import { ConversionError } from "../conversion-error.js";
import { createOCRResult } from "./ocr-result.js";
import { normalizeOCRLanguage } from "./ocr-language.js";

export const OCR_VENDOR_LOAD_FAILED = "OCR_VENDOR_LOAD_FAILED";
export const TESSERACT_VENDOR_PATHS = Object.freeze({
  corePath: "/vendor/tesseract/core/",
  workerPath: "/vendor/tesseract/worker/worker.min.js",
  mainBundle: "/vendor/tesseract/core/tesseract.min.js",
  // 仅作 cache miss 时的同源 fallback；正常路径 worker 从预写缓存取 tessdata，
  // 永远不会向 langPath 发起 fetch。
  langPath: "/vendor/tesseract/tessdata",
});

// tesseract.js 5.x browser worker 用 idb-keyval 默认库读取 tessdata 缓存
// （库名 keyval-store / 表名 keyval，key = `${cachePath}/${lang}.traineddata`）。
// 主线程把导入的 tessdata 字节预写进该缓存 + cacheMethod "readOnly"，worker
// loadLanguage 命中缓存直接 FS.writeFile，绕开 langPath fetch——blob URL 方案
// （langPath 不可拼接 `/<lang>.traineddata.gz`）在真实浏览器从未工作过。
const TESSDATA_CACHE_DB = "keyval-store";
const TESSDATA_CACHE_STORE = "keyval";
export const TESSDATA_CACHE_PATH = "trans2former/tessdata";
const WORKER_INIT_TIMEOUT_MS = 60000;

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

function openTessdataCacheDB() {
  return new Promise((resolve, reject) => {
    // 与 idb-keyval v6 对齐：不指定版本号打开（keyval-store 是共享默认库名，钉死
    // version 会在第三方升过版本时抛 VersionError）。store 缺失时再用 version+1 重开补建。
    const request = globalThis.indexedDB.open(TESSDATA_CACHE_DB);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TESSDATA_CACHE_STORE)) {
        db.createObjectStore(TESSDATA_CACHE_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(TESSDATA_CACHE_STORE)) {
        resolve(db);
        return;
      }
      const version = db.version + 1;
      db.close();
      const retry = globalThis.indexedDB.open(TESSDATA_CACHE_DB, version);
      retry.onupgradeneeded = () => {
        retry.result.createObjectStore(TESSDATA_CACHE_STORE);
      };
      retry.onsuccess = () => resolve(retry.result);
      retry.onerror = () => reject(retry.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function seedTessdataCache(language, buffer) {
  if (!globalThis.indexedDB) return false;
  const db = await openTessdataCacheDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TESSDATA_CACHE_STORE, "readwrite");
      tx.objectStore(TESSDATA_CACHE_STORE).put(
        new Uint8Array(buffer),
        `${TESSDATA_CACHE_PATH}/${language}.traineddata`,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } finally {
    db.close();
  }
}

export async function clearSeededTessdata(language) {
  if (!globalThis.indexedDB) return;
  try {
    const db = await openTessdataCacheDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(TESSDATA_CACHE_STORE, "readwrite");
        tx.objectStore(TESSDATA_CACHE_STORE).delete(`${TESSDATA_CACHE_PATH}/${language}.traineddata`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch (error) { /* best-effort cleanup */ }
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
  try {
    await seedTessdataCache(language, tessdataBuffer);
  } catch (error) {
    throw new ConversionError(`tessdata 预写浏览器缓存失败：${error?.message || error}`, {
      category: "convert",
      code: "OCR_ENGINE_FAILED",
      details: { reason: "tessdata-seed-failed", cause: String(error?.name || error?.message || "unknown") },
    });
  }
  // tesseract.js 5.x 的 loadLanguage/initialize 失败在某些路径上不会让 createWorker
  // reject（内部 .catch 吞掉），表现为永不 settle 的 promise——超时背板把静默挂死
  // 转成可见、可清理的错误。
  let timeoutId = null;
  try {
    const worker = await Promise.race([
      namespace.createWorker(language, undefined, {
        corePath: vendorPaths.corePath,
        workerPath: vendorPaths.workerPath,
        langPath: vendorPaths.langPath || TESSERACT_VENDOR_PATHS.langPath,
        cachePath: TESSDATA_CACHE_PATH,
        cacheMethod: "readOnly",
        logger: () => {},
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Tesseract worker 初始化超过 ${WORKER_INIT_TIMEOUT_MS / 1000}s 未完成（多为 tessdata 缓存未命中且 langPath 兜底不可用）`)),
          WORKER_INIT_TIMEOUT_MS,
        );
      }),
    ]);
    worker.__t2fTessdataLanguage = language;
    return worker;
  } catch (error) {
    await clearSeededTessdata(language);
    throw new ConversionError(`Tesseract worker 初始化失败：${error?.message || error}`, {
      category: "convert",
      code: "OCR_ENGINE_FAILED",
      details: { reason: "worker-init-failed", cause: String(error?.name || error?.message || "unknown") },
    });
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
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
    language: normalizeOCRLanguage(options?.language),
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
  if (worker && worker.__t2fTessdataLanguage) {
    await clearSeededTessdata(worker.__t2fTessdataLanguage);
    worker.__t2fTessdataLanguage = "";
  }
}
