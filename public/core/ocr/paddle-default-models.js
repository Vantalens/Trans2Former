// 浏览器端开箱即用：把随应用打包的 PP-OCRv5 模型（public/vendor/paddleocr/ 同源）
// 自动载入 OCR 本地缓存（IndexedDB），让高级 OCR 无需手动导入即可用。仅 fetch 同源
// vendor 资源，不联网、不上传。vendor 缺失时静默跳过（仍可经安全中心手动导入）。

import { defaultOCRStorage } from "./ocr-storage.js";
import { paddleOcrEngine, markPaddleOcrVendorReady, PADDLE_OCR_MODEL_FILES } from "./paddle-ocr-engine.js";

const VENDOR_BASE = "/vendor/paddleocr/";
const STORAGE_PREFIX = "paddleocr/v5/";
const DICT_FILE = "dict.txt";

let inflight = null;

function isBrowser() {
  return typeof globalThis !== "undefined"
    && typeof globalThis.fetch === "function"
    && typeof globalThis.document === "object";
}

async function fetchToBuffer(url) {
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function alreadyLoaded() {
  for (const file of PADDLE_OCR_MODEL_FILES) {
    if (!(await defaultOCRStorage.has(`${STORAGE_PREFIX}${file}`))) return false;
  }
  return true;
}

// 幂等：若 vendor 模型已在缓存则只置位；否则 fetch 同源 vendor → 写入缓存 → markReady → probe。
export async function ensurePaddleDefaultModels() {
  if (!isBrowser()) return { loaded: false, reason: "not-browser" };
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (await alreadyLoaded()) {
        markPaddleOcrVendorReady(true);
        await paddleOcrEngine.ensureProbe();
        return { loaded: true, reason: "cached" };
      }
      // 先确认 vendor 真的随包提供（HEAD det），缺失则跳过（不报错，留给手动导入）。
      const probe = await globalThis.fetch(`${VENDOR_BASE}det.onnx`, { method: "HEAD" });
      if (!probe.ok) return { loaded: false, reason: "vendor-absent" };

      for (const file of PADDLE_OCR_MODEL_FILES) {
        const buffer = await fetchToBuffer(`${VENDOR_BASE}${file}`);
        await defaultOCRStorage.put(`${STORAGE_PREFIX}${file}`, buffer, { source: "vendor-bundle" });
      }
      // 字典（可选）
      try {
        const dict = await fetchToBuffer(`${VENDOR_BASE}${DICT_FILE}`);
        await defaultOCRStorage.put(`${STORAGE_PREFIX}${DICT_FILE}`, dict, { source: "vendor-bundle" });
      } catch (dictError) {
        // 字典缺失不致命；识别可降级。
      }

      markPaddleOcrVendorReady(true);
      await paddleOcrEngine.ensureProbe();
      return { loaded: true, reason: "fetched" };
    } catch (error) {
      return { loaded: false, reason: `error:${error?.message || error}` };
    } finally {
      // 允许后续重试（例如首次 vendor 还没就位）。
      if (inflight) inflight = inflight;
    }
  })();
  const result = await inflight;
  if (!result.loaded) inflight = null; // 失败可重试；成功保留以幂等短路
  return result;
}
