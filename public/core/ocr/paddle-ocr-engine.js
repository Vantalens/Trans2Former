// PP-OCRv5 高级 OCR 引擎骨架（P9-D.1）。比 tesseract 更高精度的本地 OCR engine，
// 走 ONNX Runtime + WebGPU（WASM 回退），数据留在本地、零云端。本轮仅骨架 + 契约 +
// 三阶段拒绝路径；onnxruntime vendor 与真实推理留给 P9-D.2，模型按需下载留给 P9-D.3。

import { ConversionError } from "../conversion-error.js";
import { defaultOCRStorage } from "./ocr-storage.js";
import {
  OCR_ENGINE_FAILED,
  OCR_UNAVAILABLE,
} from "./ocr-warnings.js";
import { loadOnnxRuntime, pickExecutionProviders, createOcrSession, disposeOcrSession, clearSessionCache } from "./paddle-ocr-runtime.js";
import { runPaddlePipeline, parseCharDictionary } from "./paddle-ocr-pipeline.js";

const DICT_KEY = "paddleocr/v5/dict.txt";

// 浏览器端把 image（dataURL/同源 blob URL）解码为 RGBA ImageData。不使用 fetch（遵守
// 本地禁联网守门）；用 Image + canvas。Node 无 document → 抛错（recognize 在 loadOnnxRuntime
// 阶段已先行拒绝，不会走到这里）。
async function decodeImageToImageData(image) {
  if (typeof globalThis.document?.createElement !== "function" || typeof globalThis.Image !== "function") {
    throw new ConversionError("当前运行时无法解码图像（缺少 document/Image）。", {
      category: "convert",
      code: OCR_ENGINE_FAILED,
      details: { engineId: "paddleocr-v5", reason: "image-decode-unavailable" },
    });
  }
  const img = new globalThis.Image();
  img.src = image;
  if (typeof img.decode === "function") {
    await img.decode();
  } else {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("image load failed"));
    });
  }
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data, width, height };
}

export const PADDLE_OCR_MANIFEST_ID = "ocr-text.paddleocr.v5";

// PP-OCRv5 资产（检测 / 方向分类 / 识别 / 字典）。全集供 UI 列举/清理；可用性看必选集。
const MODEL_KEY_PREFIX = "paddleocr/v5/";
export const PADDLE_OCR_MODEL_FILES = Object.freeze(["det.onnx", "cls.onnx", "rec.onnx", "dict.txt"]);
// 必选集：det（DB 检测）+ rec（CTC 识别）+ dict（CTC 解码字典——缺失时识别输出全空文本，
// 引擎报 available 却产不出内容）。cls（方向分类）为可选——管线运行时已容忍其缺失
// （clsSession 为 null 时跳过 180° 校正），故不纳入可用性闸门。
export const PADDLE_OCR_REQUIRED_FILES = Object.freeze(["det.onnx", "rec.onnx", "dict.txt"]);

// 就绪状态放模块级可变变量，而非冻结对象的实例属性（冻结对象在严格模式下无法被
// ensureProbe 赋值）。引擎对象本身仍可 Object.freeze 防外部篡改。
let modelsReady = false;

function vendorReady() {
  return Boolean(globalThis.__t2fPaddleOcrVendorReady);
}

async function hasAllModels(storage) {
  for (const file of PADDLE_OCR_REQUIRED_FILES) {
    if (!(await storage.has(`${MODEL_KEY_PREFIX}${file}`))) return false;
  }
  return true;
}

export const paddleOcrEngine = Object.freeze({
  id: "paddleocr-v5",
  taskCapabilities: ["ocr-text", "ocr-layout"],
  manifestId: PADDLE_OCR_MANIFEST_ID,
  // 高级引擎：可用时经 pickForTask 优先于 tesseract(10) / placeholder(0)。
  priority: 20,

  // 与 OCREngineRegistry 一致：同步 isAvailable，由 ensureProbe() 在 recognize 前刷新缓存。
  // P9-D.1 阶段 vendor 未就位 + 模型未下载，恒为 false。
  isAvailable() {
    if (!vendorReady()) return false;
    return Boolean(modelsReady);
  },

  _storage: defaultOCRStorage,

  async ensureProbe() {
    if (!vendorReady()) {
      modelsReady = false;
      return false;
    }
    modelsReady = await hasAllModels(this._storage);
    return modelsReady;
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
        "未在本地缓存中找到 PP-OCRv5 必选资产（det/rec/dict）；请先在安全中心导入/下载（cls 方向分类可选）。",
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
    // P9-D.2.b：真实推理管线。Node/未 vendor 在 loadOnnxRuntime 抛 OCR_VENDOR_LOAD_FAILED。
    const ort = await loadOnnxRuntime();
    const providers = pickExecutionProviders();
    const providersKey = providers.join(",");
    let detSession = null;
    let clsSession = null;
    let recSession = null;
    try {
      const imageData = await decodeImageToImageData(image);
      const [detBuf, clsBuf, recBuf] = await Promise.all([
        this._storage.get(`${MODEL_KEY_PREFIX}det.onnx`),
        this._storage.get(`${MODEL_KEY_PREFIX}cls.onnx`),
        this._storage.get(`${MODEL_KEY_PREFIX}rec.onnx`),
      ]);
      const dictBuf = await this._storage.get(DICT_KEY);
      // hasAllModels 闸门已保证 dict 在缓存；此处防御直写存储绕过——没有字典时 CTC
      // 解码只会产出空文本，宁可显式失败。
      if (!dictBuf || (dictBuf.byteLength ?? 0) === 0) {
        throw new ConversionError("PP-OCRv5 字典 dict.txt 缺失或为空，CTC 解码无法产出文本。", {
          category: "convert",
          code: OCR_UNAVAILABLE,
          details: { engineId: "paddleocr-v5", manifestId: PADDLE_OCR_MANIFEST_ID, reason: "dict-missing" },
        });
      }
      const dictionary = parseCharDictionary(new TextDecoder().decode(dictBuf instanceof ArrayBuffer ? new Uint8Array(dictBuf) : dictBuf));
      // 使用缓存 key 复用 sessions：按模型类型 + providers 缓存
      detSession = await createOcrSession({ ort, modelBuffer: detBuf, providers, cacheKey: `paddleocr-det-${providersKey}` });
      clsSession = clsBuf ? await createOcrSession({ ort, modelBuffer: clsBuf, providers, cacheKey: `paddleocr-cls-${providersKey}` }) : null;
      recSession = await createOcrSession({ ort, modelBuffer: recBuf, providers, cacheKey: `paddleocr-rec-${providersKey}` });
      return await runPaddlePipeline({
        ort,
        detSession,
        clsSession,
        recSession,
        imageData,
        dictionary,
        options: options || {},
      });
    } catch (error) {
      if (error instanceof ConversionError) throw error;
      throw new ConversionError(`PP-OCRv5 推理失败：${error?.message || error}`, {
        category: "convert",
        code: OCR_ENGINE_FAILED,
        details: { engineId: "paddleocr-v5", reason: "inference-failed", providers, cause: String(error?.name || error?.message || "unknown") },
      });
    } finally {
      // 不再释放 sessions，让它们保持缓存以供后续页面复用
      await disposeOcrSession(detSession, `paddleocr-det-${providersKey}`);
      await disposeOcrSession(clsSession, clsSession ? `paddleocr-cls-${providersKey}` : null);
      await disposeOcrSession(recSession, `paddleocr-rec-${providersKey}`);
    }
  },
});

export function markPaddleOcrVendorReady(ready = true) {
  globalThis.__t2fPaddleOcrVendorReady = Boolean(ready);
}

// 导出清理函数，供外部在需要释放内存时调用
export { clearSessionCache };
