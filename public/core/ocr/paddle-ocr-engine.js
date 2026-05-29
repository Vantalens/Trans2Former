// PP-OCRv5 高级 OCR 引擎骨架（P9-D.1）。比 tesseract 更高精度的本地 OCR engine，
// 走 ONNX Runtime + WebGPU（WASM 回退），数据留在本地、零云端。本轮仅骨架 + 契约 +
// 三阶段拒绝路径；onnxruntime vendor 与真实推理留给 P9-D.2，模型按需下载留给 P9-D.3。

import { ConversionError } from "../conversion-error.js";
import { defaultOCRStorage } from "./ocr-storage.js";
import {
  OCR_ENGINE_FAILED,
  OCR_UNAVAILABLE,
} from "./ocr-warnings.js";

export const PADDLE_OCR_MANIFEST_ID = "ocr-text.paddleocr.v5";

// PP-OCRv5 三件套 ONNX 模型（检测 / 方向分类 / 识别），按需下载到 model-cache。
const MODEL_KEY_PREFIX = "paddleocr/v5/";
export const PADDLE_OCR_MODEL_FILES = Object.freeze(["det.onnx", "cls.onnx", "rec.onnx"]);

function vendorReady() {
  return Boolean(globalThis.__t2fPaddleOcrVendorReady);
}

async function hasAllModels(storage) {
  for (const file of PADDLE_OCR_MODEL_FILES) {
    if (!(await storage.has(`${MODEL_KEY_PREFIX}${file}`))) return false;
  }
  return true;
}

export const paddleOcrEngine = Object.freeze({
  id: "paddleocr-v5",
  taskCapabilities: ["ocr-text", "ocr-layout"],
  manifestId: PADDLE_OCR_MANIFEST_ID,

  // 与 OCREngineRegistry 一致：同步 isAvailable，由 ensureProbe() 在 recognize 前刷新缓存。
  // P9-D.1 阶段 vendor 未就位 + 模型未下载，恒为 false。
  isAvailable() {
    if (!vendorReady()) return false;
    return Boolean(paddleOcrEngine._modelsReady);
  },

  _modelsReady: false,
  _storage: defaultOCRStorage,

  async ensureProbe() {
    if (!vendorReady()) {
      this._modelsReady = false;
      return false;
    }
    this._modelsReady = await hasAllModels(this._storage);
    return this._modelsReady;
  },

  async recognize({ image, options } = {}) {
    if (!vendorReady()) {
      throw new ConversionError(
        "PP-OCRv5 ONNX runtime 未就位，无法执行高级 OCR。onnxruntime-web vendor 接入留给 P9-D.2。",
        {
          category: "convert",
          code: OCR_UNAVAILABLE,
          details: { engineId: "paddleocr-v5", manifestId: PADDLE_OCR_MANIFEST_ID, reason: "vendor-not-ready" },
        },
      );
    }
    if (!(await hasAllModels(this._storage))) {
      throw new ConversionError(
        "未在本地缓存中找到完整 PP-OCRv5 ONNX 模型（det/cls/rec）；请先在安全中心按需下载。",
        {
          category: "convert",
          code: OCR_UNAVAILABLE,
          details: { engineId: "paddleocr-v5", manifestId: PADDLE_OCR_MANIFEST_ID, reason: "model-missing" },
        },
      );
    }
    if (!image) {
      throw new ConversionError("OCR 输入图像缺失。", {
        category: "validate",
        code: OCR_ENGINE_FAILED,
        details: { engineId: "paddleocr-v5", reason: "missing-image" },
      });
    }
    // 真实 ONNX/WebGPU 推理留给 P9-D.2；本轮以 runtime-not-wired 拒绝，给后续接入测试留信号。
    throw new ConversionError(
      "PP-OCRv5 ONNX 推理尚未接入（P9-D.2 接 onnxruntime-web + WebGPU）。",
      {
        category: "convert",
        code: OCR_ENGINE_FAILED,
        details: { engineId: "paddleocr-v5", reason: "runtime-not-wired", options: options || null },
      },
    );
  },
});

export function markPaddleOcrVendorReady(ready = true) {
  globalThis.__t2fPaddleOcrVendorReady = Boolean(ready);
}
