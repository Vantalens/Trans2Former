// 浏览器端开箱即用：把随应用打包的 PP-OCRv5 模型（public/vendor/paddleocr/ 同源）
// 自动载入 OCR 本地缓存（IndexedDB），让高级 OCR 无需手动导入即可用。仅 fetch 同源
// vendor 资源，不联网、不上传。vendor 缺失时静默跳过（仍可经安全中心手动导入）。

import {
  defaultModelCache,
  STATUS_AVAILABLE,
  STATUS_DEGRADED,
  STATUS_NOT_DOWNLOADED,
} from "../model-cache/availability.js";
import { ConversionError } from "../conversion-error.js";
import { defaultOCRStorage } from "./ocr-storage.js";
import {
  paddleOcrEngine,
  markPaddleOcrVendorReady,
  PADDLE_OCR_MODEL_FILES,
  PADDLE_OCR_REQUIRED_FILES,
} from "./paddle-ocr-engine.js";
import { PADDLE_OCR_MANIFEST_ID } from "./paddle-ocr-engine.js";
import { verifyPaddleVendorFile } from "./paddle-model-manifest.js";

const VENDOR_BASE = "/vendor/paddleocr/";
const STORAGE_PREFIX = "paddleocr/v5/";
// cls（方向分类）不随包自动载入：manifest 声明 intentionally NOT bundled、无钉定
// digest，自动载入等于给任意字节开后门。需要 cls 的用户走安全中心手动导入。

let inflight = null;

function isBrowser() {
  return typeof globalThis !== "undefined"
    && typeof globalThis.fetch === "function"
    && typeof globalThis.document === "object";
}

async function fetchToBuffer(url) {
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  const contentType = response.headers?.get?.("content-type") || "";
  const buffer = await response.arrayBuffer();
  if (/text\/html/i.test(contentType)) {
    throw new ConversionError(`${url} returned HTML instead of a model asset`, {
      category: "validate",
      code: "MODEL_VENDOR_INVALID",
      details: { url, reason: "html-fallback" },
    });
  }
  return buffer;
}

async function clearPaddleCache(files = PADDLE_OCR_MODEL_FILES) {
  for (const file of files) {
    await defaultOCRStorage.delete(`${STORAGE_PREFIX}${file}`);
  }
}

async function alreadyLoadedAndVerified() {
  for (const file of PADDLE_OCR_REQUIRED_FILES) {
    const key = `${STORAGE_PREFIX}${file}`;
    if (!(await defaultOCRStorage.has(key))) return false;
    const buffer = await defaultOCRStorage.get(key);
    try {
      await verifyPaddleVendorFile(file, buffer);
    } catch (error) {
      // 连同历史遗留的未校验可选条目（cls）一起清，缓存中毒不留死角。
      await clearPaddleCache();
      throw error;
    }
  }
  return true;
}

function setPaddleStatus(status, detail) {
  if (defaultModelCache.has(PADDLE_OCR_MANIFEST_ID)) {
    defaultModelCache.setStatus(PADDLE_OCR_MANIFEST_ID, status, detail);
  }
}

// 幂等：若 vendor 模型已在缓存则只置位；否则 fetch 同源 vendor → 写入缓存 → markReady → probe。
export async function ensurePaddleDefaultModels() {
  if (!isBrowser()) return { loaded: false, reason: "not-browser" };
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (await alreadyLoadedAndVerified()) {
        markPaddleOcrVendorReady(true);
        await paddleOcrEngine.ensureProbe();
        setPaddleStatus(STATUS_AVAILABLE, {
          message: "PP-OCRv5 bundled model cache verified from local storage.",
          source: "cached",
        });
        return { loaded: true, reason: "cached" };
      }
      // 先确认 vendor 真的随包提供（HEAD det），缺失则跳过（不报错，留给手动导入）。
      const probe = await globalThis.fetch(`${VENDOR_BASE}det.onnx`, { method: "HEAD" });
      if (!probe.ok) return { loaded: false, reason: "vendor-absent" };

      for (const file of PADDLE_OCR_REQUIRED_FILES) {
        const key = `${STORAGE_PREFIX}${file}`;
        // 逐文件增量：已缓存且校验通过的不重取（老部署缺 dict 时避免每次转换
        // 重拉 det+rec ~21MB 才在 dict 处失败）。校验失败的照常重新 fetch 覆盖。
        if (await defaultOCRStorage.has(key)) {
          try {
            await verifyPaddleVendorFile(file, await defaultOCRStorage.get(key));
            continue;
          } catch (staleError) {
            await defaultOCRStorage.delete(key);
          }
        }
        const buffer = await fetchToBuffer(`${VENDOR_BASE}${file}`);
        const checksum = await verifyPaddleVendorFile(file, buffer);
        await defaultOCRStorage.put(key, buffer, {
          source: "vendor-bundle",
          sha256: checksum.actual,
        });
      }

      markPaddleOcrVendorReady(true);
      await paddleOcrEngine.ensureProbe();
      setPaddleStatus(STATUS_AVAILABLE, {
        message: "PP-OCRv5 bundled model cache verified with SHA-256.",
        source: "vendor-bundle",
      });
      return { loaded: true, reason: "fetched" };
    } catch (error) {
      markPaddleOcrVendorReady(false);
      setPaddleStatus(STATUS_DEGRADED, {
        message: `PP-OCRv5 bundled model verification failed: ${error?.message || error}`,
      });
      return {
        loaded: false,
        reason: error?.code === "MODEL_VENDOR_INVALID"
          ? "vendor-invalid"
          : error?.code === "MODEL_CHECKSUM_MISMATCH"
            ? "checksum-mismatch"
            : `error:${error?.message || error}`,
      };
    } finally {
      // 允许后续重试（例如首次 vendor 还没就位）。
      if (inflight) inflight = inflight;
    }
  })();
  const result = await inflight;
  if (!result.loaded) {
    if (result.reason === "vendor-absent") {
      setPaddleStatus(STATUS_NOT_DOWNLOADED, { message: "PP-OCRv5 bundled vendor files are absent." });
    }
    inflight = null; // 失败可重试；成功保留以幂等短路
  }
  return result;
}
