// 真实 PP-OCRv5 ONNX 集成测试：用 onnxruntime-node 在 Node 端跑真实 rec 模型，验证
// 整条识别管线（预处理 + CTC + 字典）对真实模型确实正确。
//
// 依赖 onnxruntime-node + pngjs（重型/原生，非项目运行时依赖）+ 本地 vendor 模型 +
// 字典 + 词图 fixture。任一缺失则**优雅跳过**（exit 0），所以默认 `npm test` 在未安装
// 这些开发依赖 / 未下载模型的环境下不会失败。
//
// 本机启用：npm i -D onnxruntime-node pngjs && npm run vendor:onnx + 下载 PP-OCRv5 模型。

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function tryRequire(name) {
  try { return require(name); } catch { return null; }
}

const ort = tryRequire("onnxruntime-node");
const pngjs = tryRequire("pngjs");
const REC = "public/vendor/paddleocr/rec.onnx";
const DICT = "public/vendor/paddleocr/dict.txt";
const FIXTURE = "samples/ocr/word-PAIN.png";

if (!ort || !pngjs) {
  console.log("PP-OCRv5 integration test skipped: onnxruntime-node / pngjs not installed (dev-only). Install with `npm i -D onnxruntime-node pngjs`.");
  process.exit(0);
}
if (!existsSync(REC) || !existsSync(DICT)) {
  console.log("PP-OCRv5 integration test skipped: vendor models absent. Run `npm run vendor:onnx` + download PP-OCRv5 ONNX into public/vendor/paddleocr/.");
  process.exit(0);
}
if (!existsSync(FIXTURE)) {
  console.log(`PP-OCRv5 integration test skipped: fixture ${FIXTURE} missing.`);
  process.exit(0);
}

const P = await import("../public/core/ocr/paddle-ocr-pipeline.js");

const png = pngjs.PNG.sync.read(readFileSync(FIXTURE));
const img = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
const dict = P.parseCharDictionary(readFileSync(DICT, "utf8"));

const rec = await ort.InferenceSession.create(REC);
const pre = P.preprocessForRecognition(img, {});
const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor("float32", pre.data, pre.dims) });
const o = out[rec.outputNames[0]];
const C = o.dims[o.dims.length - 1];
const T = o.dims[o.dims.length - 2];

// rec 输出类别数必须等于字典长度（blank + chars + space），否则对齐错位。
assert.equal(C, dict.length, `rec output classes (${C}) must equal dictionary length (${dict.length})`);

const decoded = P.ctcGreedyDecode(o.data, T, C, dict);
const text = decoded.text.toUpperCase().replace(/\s+/g, "");
// fixture word-PAIN.png 的 ground-truth 是 "PAIN"
assert.equal(text, "PAIN", `expected rec to read "PAIN", got "${decoded.text}"`);
assert.ok(decoded.confidence > 0.8, `expected high confidence, got ${decoded.confidence}`);

console.log(`PP-OCRv5 integration test passed: real rec model decodes fixture -> "${decoded.text}" (conf ${decoded.confidence.toFixed(3)}, C=${C} matches dict).`);
