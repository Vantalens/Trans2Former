import { ConversionError } from "../conversion-error.js";
import { createOCRResult } from "./ocr-result.js";

export const OCR_VENDOR_LOAD_FAILED = "OCR_VENDOR_LOAD_FAILED";
export const TESSERACT_VENDOR_PATHS = Object.freeze({
  corePath: "/vendor/tesseract/core/",
  workerPath: "/vendor/tesseract/worker/worker.min.js",
  mainBundle: "/vendor/tesseract/core/tesseract.min.js",
});

let cachedNamespace = null;

function resolveGlobalTesseract() {
  if (typeof globalThis === "undefined") return null;
  return globalThis.Tesseract || null;
}

export async function loadTesseractRuntime() {
  if (cachedNamespace) return cachedNamespace;
  const existing = resolveGlobalTesseract();
  if (existing && typeof existing.createWorker === "function") {
    cachedNamespace = existing;
    return cachedNamespace;
  }
  try {
    const mod = await import(/* @vite-ignore */ TESSERACT_VENDOR_PATHS.mainBundle);
    if (mod?.createWorker) {
      cachedNamespace = mod;
      return cachedNamespace;
    }
    const fallback = resolveGlobalTesseract();
    if (fallback && typeof fallback.createWorker === "function") {
      cachedNamespace = fallback;
      return cachedNamespace;
    }
  } catch (error) {
    throw new ConversionError(
      `Tesseract.js vendor bundle 加载失败：${error?.message || error}`,
      {
        category: "convert",
        code: OCR_VENDOR_LOAD_FAILED,
        details: {
          path: TESSERACT_VENDOR_PATHS.mainBundle,
          cause: String(error?.name || error?.message || "unknown"),
        },
      },
    );
  }
  throw new ConversionError(
    "Tesseract.js vendor 入口未导出 createWorker；请检查 vendor 同步与版本兼容。",
    {
      category: "convert",
      code: OCR_VENDOR_LOAD_FAILED,
      details: { path: TESSERACT_VENDOR_PATHS.mainBundle, reason: "missing-createWorker" },
    },
  );
}

function bufferToBlobUrl(buffer) {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  return URL.createObjectURL(blob);
}

export async function createTesseractWorker({
  namespace,
  language,
  tessdataBuffer,
  vendorPaths = TESSERACT_VENDOR_PATHS,
} = {}) {
  if (!namespace || typeof namespace.createWorker !== "function") {
    throw new ConversionError("Tesseract namespace 未就位，无法创建 worker。", {
      category: "convert",
      code: OCR_VENDOR_LOAD_FAILED,
      details: { reason: "namespace-missing" },
    });
  }
  if (!language) {
    throw new ConversionError("createTesseractWorker requires a language code.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "missing-language" },
    });
  }
  if (!tessdataBuffer) {
    throw new ConversionError("createTesseractWorker requires a tessdata buffer.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "missing-tessdata" },
    });
  }
  const tessdataUrl = bufferToBlobUrl(tessdataBuffer);
  try {
    const worker = await namespace.createWorker(language, undefined, {
      corePath: vendorPaths.corePath,
      workerPath: vendorPaths.workerPath,
      langPath: tessdataUrl.replace(/\/[^/]+$/, "/"),
      cacheMethod: "none",
      logger: () => {},
    });
    worker.__t2fTessdataUrl = tessdataUrl;
    return worker;
  } catch (error) {
    URL.revokeObjectURL(tessdataUrl);
    throw new ConversionError(`Tesseract worker 初始化失败：${error?.message || error}`, {
      category: "convert",
      code: "OCR_ENGINE_FAILED",
      details: { reason: "worker-init-failed", cause: String(error?.name || error?.message || "unknown") },
    });
  }
}

export async function runRecognize(worker, image, options = {}) {
  if (!worker || typeof worker.recognize !== "function") {
    throw new ConversionError("Tesseract worker 缺少 recognize 方法。", {
      category: "convert",
      code: "OCR_ENGINE_FAILED",
      details: { reason: "worker-invalid" },
    });
  }
  const startedAt = Date.now();
  try {
    const response = await worker.recognize(image, options);
    const runtimeMs = Date.now() - startedAt;
    return mapTesseractResultToOCR(response, runtimeMs, options);
  } catch (error) {
    throw new ConversionError(`Tesseract recognize 失败：${error?.message || error}`, {
      category: "convert",
      code: "OCR_ENGINE_FAILED",
      details: { reason: "recognize-failed", cause: String(error?.name || error?.message || "unknown") },
    });
  } finally {
    if (worker.__t2fTessdataUrl) {
      try { URL.revokeObjectURL(worker.__t2fTessdataUrl); } catch (revokeError) { /* ignore */ }
      worker.__t2fTessdataUrl = "";
    }
  }
}

function mapTesseractResultToOCR(response, runtimeMs, options) {
  const data = response?.data || {};
  const linesRaw = Array.isArray(data.lines) ? data.lines : [];
  const lines = linesRaw.map((line) => ({
    text: typeof line?.text === "string" ? line.text.trim() : "",
    confidence: typeof line?.confidence === "number" ? Math.max(0, Math.min(1, line.confidence / 100)) : 0,
    bbox: line?.bbox
      ? {
          x: line.bbox.x0 ?? 0,
          y: line.bbox.y0 ?? 0,
          w: (line.bbox.x1 ?? 0) - (line.bbox.x0 ?? 0),
          h: (line.bbox.y1 ?? 0) - (line.bbox.y0 ?? 0),
        }
      : null,
  }));
  const pageWidth = data?.imageWidth ?? data?.width ?? 0;
  const pageHeight = data?.imageHeight ?? data?.height ?? 0;
  const averageConfidence = typeof data.confidence === "number"
    ? Math.max(0, Math.min(1, data.confidence / 100))
    : 0;
  return createOCRResult({
    language: options?.language || "auto",
    pages: [
      {
        pageIndex: 0,
        width: pageWidth,
        height: pageHeight,
        lines,
      },
    ],
    fullText: typeof data.text === "string" ? data.text : "",
    averageConfidence,
    runtimeMs,
    engine: "tesseract-zh-en",
    modelVersion: "5.x",
    warnings: [],
  });
}

export async function disposeWorker(worker) {
  if (worker && typeof worker.terminate === "function") {
    try { await worker.terminate(); } catch (error) { /* ignore */ }
  }
}
