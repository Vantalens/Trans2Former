// PP-OCRv5 推理管线（P9-D.2.b）：检测(det) + 方向(cls) + 识别(rec) 三段 ONNX 前向 +
// 经典前后处理串成 OCRResult。前后处理为纯函数，Node 可完整单测；runPaddlePipeline 接受
// 可注入 session，便于用 mock 端到端测试（无需真实模型）。数据全程留在本地。

import { ConversionError } from "../conversion-error.js";
import { createOCRResult } from "./ocr-result.js";

export const DET_LIMIT_SIDE_LEN = 960;
export const REC_IMAGE_HEIGHT = 48;
export const DET_MEAN = [0.485, 0.456, 0.406];
export const DET_STD = [0.229, 0.224, 0.225];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// PP-OCR 字典：每行一个 token；CTC blank 占 index 0，末尾追加空格。
export function parseCharDictionary(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const chars = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    chars.push(line);
  }
  return ["<blank>", ...chars, " "];
}

// 最近邻重采样 RGBA 到目标尺寸。imageData = { data: Uint8ClampedArray(RGBA), width, height }。
export function resizeRgba(imageData, dstW, dstH) {
  const { data, width, height } = imageData;
  if (width <= 0 || height <= 0 || dstW <= 0 || dstH <= 0) {
    throw new RangeError("resizeRgba: dimensions must be positive.");
  }
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y * height) / dstH));
    for (let x = 0; x < dstW; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x * width) / dstW));
      const so = (sy * width + sx) * 4;
      const dstO = (y * dstW + x) * 4;
      out[dstO] = data[so];
      out[dstO + 1] = data[so + 1];
      out[dstO + 2] = data[so + 2];
      out[dstO + 3] = data[so + 3];
    }
  }
  return { data: out, width: dstW, height: dstH };
}

function roundToMultiple(value, multiple, min) {
  const rounded = Math.max(min, Math.round(value / multiple) * multiple);
  return rounded;
}

// 检测预处理：限制最长边 + 取 32 倍数 + ImageNet 归一化 → NCHW Float32。
export function preprocessForDetection(imageData, { limitSideLen = DET_LIMIT_SIDE_LEN } = {}) {
  const { width, height } = imageData;
  const maxSide = Math.max(width, height);
  const ratio = maxSide > limitSideLen ? limitSideLen / maxSide : 1;
  const resizedW = roundToMultiple(width * ratio, 32, 32);
  const resizedH = roundToMultiple(height * ratio, 32, 32);
  const resized = resizeRgba(imageData, resizedW, resizedH);
  const data = new Float32Array(3 * resizedH * resizedW);
  const plane = resizedH * resizedW;
  for (let i = 0; i < plane; i += 1) {
    const o = i * 4;
    data[i] = (resized.data[o] / 255 - DET_MEAN[0]) / DET_STD[0];
    data[plane + i] = (resized.data[o + 1] / 255 - DET_MEAN[1]) / DET_STD[1];
    data[2 * plane + i] = (resized.data[o + 2] / 255 - DET_MEAN[2]) / DET_STD[2];
  }
  return {
    data,
    dims: [1, 3, resizedH, resizedW],
    resizedWidth: resizedW,
    resizedHeight: resizedH,
    scaleW: width / resizedW,
    scaleH: height / resizedH,
  };
}

// 识别预处理：高度固定 48，宽按比例（封顶），归一化到 [-1,1] → NCHW Float32。
export function preprocessForRecognition(imageData, { height = REC_IMAGE_HEIGHT, maxWidth = 1280 } = {}) {
  const ratio = imageData.height > 0 ? imageData.width / imageData.height : 1;
  const targetW = clamp(Math.max(1, Math.round(height * ratio)), 1, maxWidth);
  const resized = resizeRgba(imageData, targetW, height);
  const data = new Float32Array(3 * height * targetW);
  const plane = height * targetW;
  for (let i = 0; i < plane; i += 1) {
    const o = i * 4;
    data[i] = (resized.data[o] / 255 - 0.5) / 0.5;
    data[plane + i] = (resized.data[o + 1] / 255 - 0.5) / 0.5;
    data[2 * plane + i] = (resized.data[o + 2] / 255 - 0.5) / 0.5;
  }
  return { data, dims: [1, 3, height, targetW], width: targetW, height };
}

// DB 检测后处理：阈值二值化 + 4-连通域 + 轴对齐 bbox + box 分数过滤 + 缩放回原图坐标。
export function dbPostProcess(probData, mapW, mapH, {
  thresh = 0.3,
  boxThresh = 0.5,
  minSize = 3,
  unclipRatio = 1.6,
  scaleW = 1,
  scaleH = 1,
} = {}) {
  if (!probData || probData.length < mapW * mapH) {
    throw new ConversionError("dbPostProcess: probability map smaller than mapW*mapH.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "prob-map-too-small" },
    });
  }
  const visited = new Uint8Array(mapW * mapH);
  const boxes = [];
  const stack = [];
  for (let start = 0; start < mapW * mapH; start += 1) {
    if (visited[start]) continue;
    if (probData[start] <= thresh) {
      visited[start] = 1;
      continue;
    }
    // BFS/DFS connected component
    let minX = mapW;
    let minY = mapH;
    let maxX = 0;
    let maxY = 0;
    let sum = 0;
    let count = 0;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop();
      const px = idx % mapW;
      const py = (idx - px) / mapW;
      sum += probData[idx];
      count += 1;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      const neighbors = [
        px > 0 ? idx - 1 : -1,
        px < mapW - 1 ? idx + 1 : -1,
        py > 0 ? idx - mapW : -1,
        py < mapH - 1 ? idx + mapW : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || visited[n]) continue;
        if (probData[n] > thresh) {
          visited[n] = 1;
          stack.push(n);
        } else {
          visited[n] = 1;
        }
      }
    }
    const score = count > 0 ? sum / count : 0;
    let boxW = maxX - minX + 1;
    let boxH = maxY - minY + 1;
    if (score < boxThresh) continue;
    if (boxW < minSize || boxH < minSize) continue;
    // unclip：DB 概率图相对真实文字是收缩的，按 PP-OCR 用 area*ratio/perimeter 向外扩，
    // 否则裁剪框过紧、切掉字符笔画导致识别错乱。
    const distance = (boxW * boxH * unclipRatio) / Math.max(1, 2 * (boxW + boxH));
    let ex0 = minX - distance;
    let ey0 = minY - distance;
    let ex1 = maxX + distance;
    let ey1 = maxY + distance;
    ex0 = Math.max(0, ex0);
    ey0 = Math.max(0, ey0);
    ex1 = Math.min(mapW - 1, ex1);
    ey1 = Math.min(mapH - 1, ey1);
    boxes.push({
      x: Math.round(ex0 * scaleW),
      y: Math.round(ey0 * scaleH),
      w: Math.round((ex1 - ex0 + 1) * scaleW),
      h: Math.round((ey1 - ey0 + 1) * scaleH),
      score,
    });
  }
  // 阅读顺序：上→下，再左→右（粗启发，多栏留后）。
  boxes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return boxes;
}

// 噪点估计：采样像素，统计与 3×3 邻域中值相差很大（孤立跳变，椒盐特征）的灰度像素比例。
// 文字边缘也会产生差异但占比小；椒盐噪点会显著抬高该比例。返回 [0,1] 的噪点比例。
export function estimateNoiseLevel(imageData, { jump = 80, step = 2 } = {}) {
  const { data, width, height } = imageData;
  if (width < 3 || height < 3) return 0;
  const gray = (o) => (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
  let speckle = 0;
  let sampled = 0;
  const win = [];
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      win.length = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          win.push(gray(((y + dy) * width + (x + dx)) * 4));
        }
      }
      win.sort((a, b) => a - b);
      const med = win[4];
      if (Math.abs(gray((y * width + x) * 4) - med) > jump) speckle += 1;
      sampled += 1;
    }
  }
  return sampled > 0 ? speckle / sampled : 0;
}

// 图像去噪：3×3 中值滤波（逐通道取邻域中值）。对椒盐/背景杂点有效且保边，
// 用于 OCR 前清理噪点，改善带噪图 / 艺术字背景的识别。alpha 透传。
export function denoiseImageData(imageData, { window = 3 } = {}) {
  const { data, width, height } = imageData;
  if (width < 3 || height < 3) return imageData;
  const radius = Math.max(1, Math.floor(window / 2));
  const out = new Uint8ClampedArray(data.length);
  const win = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        win.length = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -radius; dx <= radius; dx += 1) {
            const xx = Math.min(width - 1, Math.max(0, x + dx));
            win.push(data[(yy * width + xx) * 4 + c]);
          }
        }
        win.sort((a, b) => a - b);
        out[o + c] = win[win.length >> 1];
      }
      out[o + 3] = data[o + 3];
    }
  }
  return { data: out, width, height };
}

// 旋转 RGBA 图像。rotateImageData180：上下左右翻转（cls 检测到 180° 时用）。
export function rotateImageData180(imageData) {
  const { data, width, height } = imageData;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 4;
      const d = ((height - 1 - y) * width + (width - 1 - x)) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
  }
  return { data: out, width, height };
}

// 旋转 90°（dir: "cw" 顺时针 / "ccw" 逆时针）。输出宽高互换。用于竖排 / 侧向文本。
export function rotateImageData90(imageData, dir = "cw") {
  const { data, width, height } = imageData;
  const ow = height;
  const oh = width;
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 4;
      let ox;
      let oy;
      if (dir === "cw") { ox = height - 1 - y; oy = x; } else { ox = y; oy = width - 1 - x; }
      const d = (oy * ow + ox) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
  }
  return { data: out, width: ow, height: oh };
}

// cls 输出 [c0, c1] softmax；c1 高表示需要旋转 180°。返回 { flip, confidence }。
export function interpretClsOutput(clsData, threshold = 0.6) {
  const c0 = clsData?.[0] ?? 1;
  const c1 = clsData?.[1] ?? 0;
  return { flip: c1 > c0 && c1 >= threshold, confidence: Math.max(c0, c1) };
}

// 裁剪 RGBA 区域（坐标 clamp 到图内）。
export function cropImageData(imageData, box) {
  const { data, width, height } = imageData;
  const x0 = clamp(Math.floor(box.x), 0, Math.max(0, width - 1));
  const y0 = clamp(Math.floor(box.y), 0, Math.max(0, height - 1));
  const cw = clamp(Math.round(box.w), 1, width - x0);
  const ch = clamp(Math.round(box.h), 1, height - y0);
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const so = ((y0 + y) * width + (x0 + x)) * 4;
      const dstO = (y * cw + x) * 4;
      out[dstO] = data[so];
      out[dstO + 1] = data[so + 1];
      out[dstO + 2] = data[so + 2];
      out[dstO + 3] = data[so + 3];
    }
  }
  return { data: out, width: cw, height: ch };
}

// CTC 贪心解码：逐时刻 argmax → 折叠连续重复 → 去 blank(0) → 映射字典。
// logitsData 按 [T, C] 行主序；dictionary[idx] 给出字符（idx 0 为 blank）。
export function ctcGreedyDecode(logitsData, timeSteps, numClasses, dictionary = []) {
  let text = "";
  let confSum = 0;
  let confCount = 0;
  let prevIdx = -1;
  for (let t = 0; t < timeSteps; t += 1) {
    const base = t * numClasses;
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let c = 0; c < numClasses; c += 1) {
      const v = logitsData[base + c];
      if (v > bestVal) {
        bestVal = v;
        bestIdx = c;
      }
    }
    if (bestIdx !== prevIdx && bestIdx !== 0) {
      const ch = dictionary[bestIdx];
      if (typeof ch === "string" && ch !== "<blank>") {
        text += ch;
        confSum += bestVal;
        confCount += 1;
      }
    }
    prevIdx = bestIdx;
  }
  const confidence = confCount > 0 ? clamp(confSum / confCount, 0, 1) : 0;
  return { text, confidence };
}

function firstOutput(session, result) {
  const name = Array.isArray(session.outputNames) && session.outputNames.length > 0
    ? session.outputNames[0]
    : Object.keys(result)[0];
  return result[name];
}

function firstInputName(session) {
  return Array.isArray(session.inputNames) && session.inputNames.length > 0
    ? session.inputNames[0]
    : "x";
}

async function runSession(ort, session, { data, dims }) {
  const tensor = new ort.Tensor("float32", data, dims);
  const feeds = { [firstInputName(session)]: tensor };
  const result = await session.run(feeds);
  return firstOutput(session, result);
}

// 编排器：imageData + 三段 session + 字典 → OCRResult。ort 仅用于构造 Tensor。
export async function runPaddlePipeline({
  ort,
  detSession,
  clsSession = null,
  recSession,
  imageData,
  dictionary = [],
  options = {},
} = {}) {
  if (!ort || typeof ort.Tensor !== "function") {
    throw new ConversionError("runPaddlePipeline requires an onnxruntime namespace with Tensor.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "missing-ort" },
    });
  }
  if (!detSession || !recSession) {
    throw new ConversionError("runPaddlePipeline requires det and rec sessions.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "missing-sessions" },
    });
  }
  const startedAt = Date.now();

  // 去噪：默认 auto——仅当估计噪点比例超过阈值时才中值滤波（中值滤波会软化干净图、
  // 降低清晰文本置信度，所以干净图绝不去噪）。options.denoise: "auto"|true|false。
  const denoiseMode = options.denoise ?? "auto";
  const denoiseThreshold = typeof options.denoiseThreshold === "number" ? options.denoiseThreshold : 0.05;
  let noiseLevel = 0;
  let denoised = false;
  let workImage = imageData;
  if (denoiseMode === true) {
    workImage = denoiseImageData(imageData, options.denoiseWindow ? { window: options.denoiseWindow } : {});
    denoised = true;
  } else if (denoiseMode !== false) {
    noiseLevel = estimateNoiseLevel(imageData);
    if (noiseLevel > denoiseThreshold) {
      workImage = denoiseImageData(imageData, options.denoiseWindow ? { window: options.denoiseWindow } : {});
      denoised = true;
    }
  }

  const detInput = preprocessForDetection(workImage, options.det || {});
  const detOut = await runSession(ort, detSession, { data: detInput.data, dims: detInput.dims });
  const probData = detOut?.data || detOut;
  const probDims = detOut?.dims || [1, 1, detInput.resizedHeight, detInput.resizedWidth];
  const mapH = probDims[probDims.length - 2];
  const mapW = probDims[probDims.length - 1];
  const boxes = dbPostProcess(probData, mapW, mapH, {
    ...(options.db || {}),
    scaleW: detInput.scaleW * (detInput.resizedWidth / mapW),
    scaleH: detInput.scaleH * (detInput.resizedHeight / mapH),
  });

  const verticalAspect = typeof options.verticalAspect === "number" ? options.verticalAspect : 1.5;
  const clsThreshold = typeof options.clsThreshold === "number" ? options.clsThreshold : 0.6;
  const lowConfidence = typeof options.lowConfidence === "number" ? options.lowConfidence : 0.6;

  // 对单个裁剪做：可选 cls 180° 校正 → rec → CTC，返回 { text, confidence }。
  async function recognizeCrop(cropImg) {
    let img = cropImg;
    let orientation = "0";
    if (clsSession) {
      try {
        const clsPre = preprocessForRecognition(img, options.cls || options.rec || {});
        const clsOut = await runSession(ort, clsSession, { data: clsPre.data, dims: clsPre.dims });
        const { flip } = interpretClsOutput(clsOut?.data || clsOut, clsThreshold);
        if (flip) {
          img = rotateImageData180(img);
          orientation = "180";
        }
      } catch (error) {
        // 方向分类失败不致命，按原图识别。
      }
    }
    const recPre = preprocessForRecognition(img, options.rec || {});
    const recOut = await runSession(ort, recSession, { data: recPre.data, dims: recPre.dims });
    const logits = recOut?.data || recOut;
    const recDims = recOut?.dims || [1, 0, dictionary.length];
    const decoded = ctcGreedyDecode(logits, recDims[recDims.length - 2], recDims[recDims.length - 1], dictionary);
    return { ...decoded, orientation };
  }

  const lines = [];
  for (const box of boxes) {
    const crop = cropImageData(workImage, box);
    // 竖排 / 侧向文本：高宽比偏高的框，额外尝试旋转 90°（cw + ccw），按识别置信度取最优。
    const candidates = [{ img: crop, rot: "0" }];
    if (box.h > box.w * verticalAspect) {
      candidates.push({ img: rotateImageData90(crop, "cw"), rot: "90cw" });
      candidates.push({ img: rotateImageData90(crop, "ccw"), rot: "90ccw" });
    }
    let best = null;
    for (const cand of candidates) {
      let decoded;
      try {
        decoded = await recognizeCrop(cand.img);
      } catch (error) {
        continue;
      }
      if (decoded.text.trim().length === 0) continue;
      if (!best || decoded.confidence > best.confidence) {
        best = { ...decoded, rotation: cand.rot };
      }
    }
    if (best) {
      lines.push({
        text: best.text,
        confidence: best.confidence,
        bbox: { x: box.x, y: box.y, w: box.w, h: box.h },
        orientation: best.rotation === "0" ? best.orientation : best.rotation,
        lowConfidence: best.confidence < lowConfidence,
      });
    }
  }

  const confs = lines.map((l) => l.confidence);
  const averageConfidence = confs.length > 0 ? clamp(confs.reduce((s, c) => s + c, 0) / confs.length, 0, 1) : 0;
  const lowConfidenceLines = lines.filter((l) => l.lowConfidence).length;
  // 质量把控摘要：整体/最低置信度、低置信行数、是否有旋转校正。
  const quality = {
    lineCount: lines.length,
    averageConfidence,
    minConfidence: confs.length > 0 ? clamp(Math.min(...confs), 0, 1) : 0,
    lowConfidenceLines,
    rotatedLines: lines.filter((l) => l.orientation && l.orientation !== "0").length,
    denoised,
    noiseLevel,
    grade: averageConfidence >= 0.9 && lowConfidenceLines === 0
      ? "high"
      : (averageConfidence >= 0.7 ? "medium" : "low"),
  };

  const result = createOCRResult({
    language: options.language || "auto",
    pages: [
      {
        pageIndex: 0,
        width: imageData.width,
        height: imageData.height,
        lines,
      },
    ],
    fullText: lines.map((l) => l.text).join("\n"),
    averageConfidence,
    runtimeMs: Date.now() - startedAt,
    engine: "paddleocr-v5",
    modelVersion: "v5",
    warnings: [],
  });
  return { ...result, quality };
}
