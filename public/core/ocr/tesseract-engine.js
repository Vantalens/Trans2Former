import { ConversionError } from "../conversion-error.js";
import { defaultOCRStorage } from "./ocr-storage.js";
import { toTesseractLanguage } from "./ocr-language.js";
import {
  OCR_ENGINE_FAILED,
  OCR_UNAVAILABLE,
} from "./ocr-warnings.js";
import {
  createTesseractWorker,
  disposeWorker,
  loadTesseractRuntime,
  runRecognize,
} from "./tesseract-runtime.js";

export const TESSERACT_MANIFEST_ID = "ocr-text.tesseract.5.0.0";

const TESSDATA_KEY_PREFIX = "tesseract/";
export const TESSERACT_DEFAULT_LANGUAGES = Object.freeze(["chi_sim", "eng"]);
const DEFAULT_LANGUAGES = TESSERACT_DEFAULT_LANGUAGES;

// 就绪状态放模块级可变变量，而非冻结对象的实例属性（冻结对象在严格模式下无法被
// ensureProbe 赋值）。引擎对象本身仍可 Object.freeze 防外部篡改。
let tessdataReady = false;

function vendorReady() {
  return Boolean(globalThis.__t2fTesseractVendorReady);
}

async function hasAnyTessdata(storage, languages) {
  for (const language of languages) {
    if (await storage.has(`${TESSDATA_KEY_PREFIX}${language}.traineddata`)) {
      return language;
    }
  }
  return null;
}

export const tesseractOCREngine = Object.freeze({
  id: "tesseract-zh-en",
  taskCapabilities: ["ocr-text"],
  manifestId: TESSERACT_MANIFEST_ID,
  // 轻量内置引擎：优先级高于 placeholder(0)，低于 PP-OCRv5 高级引擎(20)。
  priority: 10,

  // OCREngineRegistry expects a synchronous isAvailable. We expose a synchronous
  // signature backed by a cached probe; the probe is updated by ensureProbe()
  // before any recognize() call. Until P9-A.2.b populates IndexedDB, this stays
  // false.
  isAvailable() {
    if (!vendorReady()) return false;
    return Boolean(tessdataReady);
  },

  _storage: defaultOCRStorage,

  async ensureProbe() {
    if (!vendorReady()) {
      tessdataReady = false;
      return false;
    }
    const language = await hasAnyTessdata(this._storage, DEFAULT_LANGUAGES);
    tessdataReady = Boolean(language);
    return tessdataReady;
  },

  async recognize({ image, options } = {}) {
    if (!vendorReady()) {
      throw new ConversionError(
        "Tesseract vendor 资源未就位，无法执行 OCR。请运行 `npm run vendor:tesseract` 同步本地资源。",
        {
          category: "convert",
          code: OCR_UNAVAILABLE,
          details: { engineId: "tesseract-zh-en", manifestId: TESSERACT_MANIFEST_ID, reason: "vendor-not-ready" },
        },
      );
    }
    // 语言偏好接线：canonical 码（zh-CN/en）映射到 tessdata 语言码（chi_sim/eng），
    // 请求的语言优先、其余默认语言垫底；显式 options.languages（复数）覆盖一切。
    const requested = toTesseractLanguage(options?.language);
    const candidates = Array.isArray(options?.languages) && options.languages.length > 0
      ? options.languages
      : (requested ? [requested, ...DEFAULT_LANGUAGES.filter((l) => l !== requested)] : DEFAULT_LANGUAGES);
    const language = await hasAnyTessdata(this._storage, candidates);
    if (!language) {
      throw new ConversionError(
        "未在本地缓存中找到 tessdata；请先在安全中心导入 .traineddata 文件。",
        {
          category: "convert",
          code: OCR_UNAVAILABLE,
          details: { engineId: "tesseract-zh-en", manifestId: TESSERACT_MANIFEST_ID, reason: "tessdata-missing" },
        },
      );
    }
    // P9-A.2 阶段保留真实推理入口，但不在本轮接入；recognize 真实执行留给 P9-A.2.b。
    // 检查 image 至少存在，给 P9-A.2.b 留下接入测试期望的拒绝信号。
    if (!image) {
      throw new ConversionError("OCR 输入图像缺失。", {
        category: "validate",
        code: OCR_ENGINE_FAILED,
        details: { engineId: "tesseract-zh-en", reason: "missing-image" },
      });
    }
    const namespace = await loadTesseractRuntime();
    const tessdataBuffer = await this._storage.get(`${TESSDATA_KEY_PREFIX}${language}.traineddata`);
    if (!tessdataBuffer) {
      throw new ConversionError(
        `tessdata for ${language} 在导入流程后未被读取到；请重新导入 .traineddata 文件。`,
        {
          category: "convert",
          code: OCR_UNAVAILABLE,
          details: { engineId: "tesseract-zh-en", manifestId: TESSERACT_MANIFEST_ID, reason: "tessdata-read-failed", language },
        },
      );
    }
    let worker = null;
    try {
      worker = await createTesseractWorker({ namespace, language, tessdataBuffer });
      const result = await runRecognize(worker, image, { ...(options || {}), language });
      return result;
    } catch (error) {
      if (error instanceof ConversionError) throw error;
      throw new ConversionError(`Tesseract recognize 失败：${error?.message || error}`, {
        category: "convert",
        code: OCR_ENGINE_FAILED,
        details: { engineId: "tesseract-zh-en", reason: "recognize-failed", cause: String(error?.name || error?.message || "unknown") },
      });
    } finally {
      await disposeWorker(worker);
    }
  },
});

export function markTesseractVendorReady(ready = true) {
  globalThis.__t2fTesseractVendorReady = Boolean(ready);
}
