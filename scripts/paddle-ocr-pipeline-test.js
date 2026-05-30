import assert from "node:assert/strict";

import {
  parseCharDictionary,
  preprocessForDetection,
  preprocessForRecognition,
  dbPostProcess,
  ctcGreedyDecode,
  cropImageData,
  resizeRgba,
  rotateImageData90,
  rotateImageData180,
  interpretClsOutput,
  denoiseImageData,
  estimateNoiseLevel,
  runPaddlePipeline,
  DET_LIMIT_SIDE_LEN,
  REC_IMAGE_HEIGHT,
} from "../public/browser-transformer.js";

function solidRgba(value, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

// Mock onnxruntime namespace + sessions for end-to-end orchestration without real models.
const mockOrt = { Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } } };

function mockSession(outputName, produce) {
  return {
    inputNames: ["x"],
    outputNames: [outputName],
    run: async (feeds) => ({ [outputName]: produce(feeds.x) }),
  };
}

// 1. parseCharDictionary: blank at 0, lines preserved, trailing space appended
{
  const dict = parseCharDictionary("你\n好\nA");
  assert.deepEqual(dict, ["<blank>", "你", "好", "A", " "]);
  assert.deepEqual(parseCharDictionary(""), ["<blank>", " "]);
}

// 2. preprocessForDetection: NCHW float, dims multiple of 32, scale ratios
{
  const det = preprocessForDetection(solidRgba(255, 20, 10));
  assert.equal(det.dims[0], 1);
  assert.equal(det.dims[1], 3);
  assert.equal(det.dims[2] % 32, 0);
  assert.equal(det.dims[3] % 32, 0);
  assert.equal(det.data.length, 3 * det.dims[2] * det.dims[3]);
  assert.ok(det.scaleW > 0 && det.scaleH > 0);
  // limit side len respected
  const big = preprocessForDetection(solidRgba(0, 4000, 100));
  assert.ok(big.resizedWidth <= DET_LIMIT_SIDE_LEN + 32);
}

// 3. preprocessForRecognition: fixed height 48, normalized to [-1,1]
{
  const rec = preprocessForRecognition(solidRgba(255, 100, 32));
  assert.equal(rec.dims[2], REC_IMAGE_HEIGHT);
  assert.equal(rec.height, REC_IMAGE_HEIGHT);
  // white pixel -> (255/255 - 0.5)/0.5 = 1
  assert.ok(Math.abs(rec.data[0] - 1) < 1e-6);
}

// 4. resizeRgba + cropImageData
{
  const img = solidRgba(120, 10, 10);
  const small = resizeRgba(img, 5, 5);
  assert.equal(small.width, 5);
  assert.equal(small.data.length, 5 * 5 * 4);
  const crop = cropImageData(img, { x: 2, y: 2, w: 4, h: 4 });
  assert.equal(crop.width, 4);
  assert.equal(crop.height, 4);
  // crop clamps when out of range
  const clamped = cropImageData(img, { x: 8, y: 8, w: 10, h: 10 });
  assert.ok(clamped.width <= 2 && clamped.height <= 2);
}

// 5. dbPostProcess: connected component => one box; sub-threshold => none
{
  const prob = new Float32Array(36).fill(0); // 6x6
  // hot 3x3 block at (1,1)-(3,3)
  for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) prob[y * 6 + x] = 0.9;
  // unclipRatio:0 关闭外扩，校验连通域 bbox 精确坐标
  const boxes = dbPostProcess(prob, 6, 6, { thresh: 0.3, boxThresh: 0.5, minSize: 2, unclipRatio: 0, scaleW: 1, scaleH: 1 });
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].x, 1);
  assert.equal(boxes[0].y, 1);
  assert.equal(boxes[0].w, 3);
  assert.equal(boxes[0].h, 3);

  // 默认 unclip>0 时框应向外扩（覆盖原 bbox 且更大），不切字符
  const unclipped = dbPostProcess(prob, 6, 6, { thresh: 0.3, boxThresh: 0.5, minSize: 2, scaleW: 1, scaleH: 1 });
  assert.equal(unclipped.length, 1);
  assert.ok(unclipped[0].w >= 3 && unclipped[0].h >= 3, "unclip should not shrink the box");
  assert.ok(unclipped[0].x <= 1 && unclipped[0].y <= 1, "unclip should expand the box outward");

  const none = dbPostProcess(new Float32Array(36).fill(0.1), 6, 6, { thresh: 0.3 });
  assert.equal(none.length, 0);
}

// 6. dbPostProcess two separate blocks => two boxes sorted top->bottom
{
  const prob = new Float32Array(64).fill(0); // 8x8
  for (let y = 0; y <= 2; y += 1) for (let x = 0; x <= 2; x += 1) prob[y * 8 + x] = 0.8; // top-left
  for (let y = 5; y <= 7; y += 1) for (let x = 5; x <= 7; x += 1) prob[y * 8 + x] = 0.8; // bottom-right
  const boxes = dbPostProcess(prob, 8, 8, { thresh: 0.3, boxThresh: 0.5, minSize: 2, scaleW: 1, scaleH: 1 });
  assert.equal(boxes.length, 2);
  assert.ok(boxes[0].y <= boxes[1].y, "boxes should be sorted top-to-bottom");
}

// 7. ctcGreedyDecode: collapse repeats + drop blank(0)
{
  const dict = ["<blank>", "a", "b", "c"];
  // T=5, C=4; argmax sequence: a,a,blank,b,c -> "abc"
  const logits = new Float32Array([
    0, 9, 0, 0,
    0, 9, 0, 0,
    9, 0, 0, 0,
    0, 0, 9, 0,
    0, 0, 0, 9,
  ]);
  const { text, confidence } = ctcGreedyDecode(logits, 5, 4, dict);
  assert.equal(text, "abc");
  assert.ok(confidence > 0);
  // all blank => empty
  const blank = new Float32Array([9, 0, 0, 0, 9, 0, 0, 0]);
  assert.equal(ctcGreedyDecode(blank, 2, 4, dict).text, "");
}

// 8. runPaddlePipeline end-to-end with mock ort + mock sessions => OCRResult with decoded text
{
  const dict = ["<blank>", "H", "I"];
  // det produces a prob map (same size as resized det input) with a hot block.
  const detSession = mockSession("det_out", (tensor) => {
    const [, , H, W] = tensor.dims;
    const data = new Float32Array(H * W).fill(0);
    // hot region in the middle covering >= minSize
    for (let y = Math.floor(H / 2) - 4; y < Math.floor(H / 2) + 4; y += 1) {
      for (let x = Math.floor(W / 2) - 4; x < Math.floor(W / 2) + 4; x += 1) {
        if (y >= 0 && y < H && x >= 0 && x < W) data[y * W + x] = 0.9;
      }
    }
    return { data, dims: [1, 1, H, W] };
  });
  const clsSession = mockSession("cls_out", () => ({ data: new Float32Array([0.9, 0.1]), dims: [1, 2] }));
  // rec produces logits decoding to "HI": T=3, C=3 -> H, I, blank
  const recSession = mockSession("rec_out", () => ({
    data: new Float32Array([0, 9, 0, 0, 0, 9, 9, 0, 0]),
    dims: [1, 3, 3],
  }));

  const imageData = solidRgba(200, 64, 64);
  const result = await runPaddlePipeline({
    ort: mockOrt,
    detSession,
    clsSession,
    recSession,
    imageData,
    dictionary: dict,
    options: { db: { thresh: 0.3, boxThresh: 0.5, minSize: 2 } },
  });
  assert.equal(result.schemaVersion, "trans2former.ocr-result.v1");
  assert.equal(result.engine, "paddleocr-v5");
  assert.ok(result.pages[0].lines.length >= 1, "pipeline should produce at least one recognized line");
  assert.equal(result.pages[0].lines[0].text, "HI");
  assert.ok(result.fullText.includes("HI"));
  assert.ok(result.averageConfidence > 0);
}

// 9. runPaddlePipeline validates ort + sessions
{
  await assert.rejects(
    () => runPaddlePipeline({ ort: null, detSession: {}, recSession: {}, imageData: solidRgba(0, 4, 4) }),
    (err) => err.code === "OCR_ENGINE_INVALID",
  );
}

// 10. Rotation helpers: 180 is an involution; 90 swaps dims; corners map correctly
{
  // 2x3 image with a distinct top-left red pixel
  const w = 2, h = 3;
  const data = new Uint8ClampedArray(w * h * 4);
  const setPx = (img, x, y, r) => { const o = (y * img.width + x) * 4; img.data[o] = r; img.data[o + 3] = 255; };
  const img = { data, width: w, height: h };
  setPx(img, 0, 0, 200); // mark top-left

  const r180 = rotateImageData180(img);
  assert.equal(r180.width, w);
  assert.equal(r180.height, h);
  // top-left should now be at bottom-right
  assert.equal(r180.data[((h - 1) * w + (w - 1)) * 4], 200);
  // 180 is its own inverse
  const back = rotateImageData180(r180);
  assert.deepEqual(Array.from(back.data), Array.from(img.data));

  const cw = rotateImageData90(img, "cw");
  assert.equal(cw.width, h); // dims swapped
  assert.equal(cw.height, w);
  // top-left (0,0) under CW goes to (height-1, 0) = (2,0)
  assert.equal(cw.data[(0 * cw.width + (h - 1)) * 4], 200);
  const ccw = rotateImageData90(img, "ccw");
  assert.equal(ccw.width, h);
  assert.equal(ccw.height, w);
}

// 11. interpretClsOutput: c1 high => flip; c0 high => no flip; below threshold => no flip
{
  assert.equal(interpretClsOutput([0.05, 0.95], 0.6).flip, true);
  assert.equal(interpretClsOutput([0.95, 0.05], 0.6).flip, false);
  assert.equal(interpretClsOutput([0.45, 0.55], 0.6).flip, false, "below threshold should not flip");
  assert.equal(interpretClsOutput([0.1, 0.9]).confidence, 0.9);
}

// 12. runPaddlePipeline returns a quality assessment (grade + confidence stats)
{
  const dict = ["<blank>", "H", "I"];
  const detSession = mockSession("det_out", (tensor) => {
    const [, , H, W] = tensor.dims;
    const data = new Float32Array(H * W).fill(0);
    for (let y = Math.floor(H / 2) - 4; y < Math.floor(H / 2) + 4; y += 1)
      for (let x = Math.floor(W / 2) - 4; x < Math.floor(W / 2) + 4; x += 1)
        if (y >= 0 && y < H && x >= 0 && x < W) data[y * W + x] = 0.9;
    return { data, dims: [1, 1, H, W] };
  });
  const recSession = mockSession("rec_out", () => ({ data: new Float32Array([0, 9, 0, 0, 0, 9, 9, 0, 0]), dims: [1, 3, 3] }));
  const result = await runPaddlePipeline({
    ort: mockOrt, detSession, recSession, imageData: solidRgba(200, 64, 64), dictionary: dict,
    options: { db: { thresh: 0.3, boxThresh: 0.5, minSize: 2 } },
  });
  assert.ok(result.quality, "pipeline should attach a quality assessment");
  assert.equal(typeof result.quality.averageConfidence, "number");
  assert.equal(typeof result.quality.minConfidence, "number");
  assert.ok(["high", "medium", "low"].includes(result.quality.grade));
  assert.equal(result.quality.lineCount, result.pages[0].lines.length);
}

// 13. estimateNoiseLevel: clean ~0; salt-and-pepper => high. denoiseImageData removes speckle.
{
  const w = 32, h = 32;
  const clean = solidRgba(128, w, h);
  assert.ok(estimateNoiseLevel(clean) < 0.02, "uniform image should have near-zero noise estimate");

  // sprinkle salt-and-pepper
  const noisy = { data: new Uint8ClampedArray(clean.data), width: w, height: h };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < w * h; i += 1) {
    if (rnd() < 0.15) { const v = rnd() < 0.5 ? 0 : 255; noisy.data[i * 4] = v; noisy.data[i * 4 + 1] = v; noisy.data[i * 4 + 2] = v; }
  }
  assert.ok(estimateNoiseLevel(noisy) > 0.05, "salt-and-pepper image should exceed denoise threshold");

  // median denoise reduces the speckle measure
  const cleaned = denoiseImageData(noisy);
  assert.equal(cleaned.width, w);
  assert.ok(estimateNoiseLevel(cleaned) < estimateNoiseLevel(noisy), "denoise should reduce the noise estimate");
}

// 14. auto-denoise gating: clean stays untouched; quality reports denoised flag
{
  const dict = ["<blank>", "H", "I"];
  const detSession = mockSession("det_out", (tensor) => {
    const [, , H, W] = tensor.dims;
    const data = new Float32Array(H * W).fill(0);
    for (let y = Math.floor(H / 2) - 4; y < Math.floor(H / 2) + 4; y += 1)
      for (let x = Math.floor(W / 2) - 4; x < Math.floor(W / 2) + 4; x += 1)
        if (y >= 0 && y < H && x >= 0 && x < W) data[y * W + x] = 0.9;
    return { data, dims: [1, 1, H, W] };
  });
  const recSession = mockSession("rec_out", () => ({ data: new Float32Array([0, 9, 0, 0, 0, 9, 9, 0, 0]), dims: [1, 3, 3] }));
  const r = await runPaddlePipeline({
    ort: mockOrt, detSession, recSession, imageData: solidRgba(200, 64, 64), dictionary: dict,
    options: { db: { thresh: 0.3, boxThresh: 0.5, minSize: 2 } },
  });
  assert.equal(r.quality.denoised, false, "clean uniform image should not be denoised");
  assert.equal(typeof r.quality.noiseLevel, "number");
}

console.log("PP-OCRv5 pipeline test passed: dictionary, det/rec preprocessing, resize/crop, DB postprocess + unclip, CTC greedy decode, rotation helpers + cls interpretation, denoise (noise estimate + median + auto-gating), quality assessment, and mock-session end-to-end runPaddlePipeline verified.");
