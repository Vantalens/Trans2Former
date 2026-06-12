import {
  defaultModelCache,
  STATUS_AVAILABLE,
  STATUS_NOT_DOWNLOADED,
} from "../model-cache/availability.js";
import { createModelManifest } from "../model-cache/manifest.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { ensureOCRBootstrap } from "./ocr-bootstrap.js";
import { defaultOCRStorage } from "./ocr-storage.js";
import {
  tesseractOCREngine,
  TESSERACT_MANIFEST_ID,
  TESSERACT_DEFAULT_LANGUAGES,
  markTesseractVendorReady,
} from "./tesseract-engine.js";

let bootstrapped = false;

export function ensureTesseractBootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  // Tesseract bootstrap must run after the placeholder bootstrap, so the
  // pickForTask fallback order ends on a tesseract entry (with isAvailable()
  // still false in P9-A.2). 这保证 placeholder 与 tesseract 两条都在 registry 中。
  ensureOCRBootstrap();

  if (!defaultOCRRegistry.has(tesseractOCREngine.id)) {
    defaultOCRRegistry.register(tesseractOCREngine);
  }

  if (!defaultModelCache.has(TESSERACT_MANIFEST_ID)) {
    const manifest = createModelManifest({
      manifestId: TESSERACT_MANIFEST_ID,
      task: "ocr-text",
      engine: "tesseract",
      modelVersion: "5.0.0",
      bundleSize: 12 * 1024 * 1024,
      quantization: "none",
      minMemoryMB: 256,
      sources: [
        { kind: "vendor-bundle", path: "public/vendor/tesseract/" },
        { kind: "user-provided", path: "tessdata via 安全中心 → 导入" },
      ],
      checksums: {
        algorithm: "SHA-256",
        digest: "f".repeat(64),
        perFile: {},
      },
      fallback: {
        onFailure: "use-degraded-route",
        message: "Tesseract.js 5.x 占位 manifest；tessdata 与运行时接入留给 P9-A.2.b。",
      },
      ui: {
        label: "Tesseract.js OCR",
        description: "本地轻量 OCR runtime；启用前需在安全中心导入 tessdata (.traineddata)。",
        enableHint: "首次启用时本地选择 chi_sim.traineddata / eng.traineddata，写入本地缓存后激活。",
      },
    });
    defaultModelCache.register(manifest);
    defaultModelCache.setStatus(TESSERACT_MANIFEST_ID, STATUS_NOT_DOWNLOADED, {
      message: "等待 P9-A.2.b 通过安全中心导入 tessdata；vendor wasm 已就位但 tessdata 尚未提供。",
    });
  }
}

ensureTesseractBootstrap();

// 启动时从 OCR storage（IndexedDB）的实际内容重建可用性：vendor-ready 标志是内存
// 全局，刷新即忘——用户导入过 tessdata 后每次都要重新走导入对话框（issue #8/#10）。
// 持久化的是 tessdata 字节本身；状态从字节重新推导，不持久化注册表（避免状态与
// 缓存内容漂移）。Node 测试环境 storage 为空的 InMemoryStorage，走 no-tessdata
// no-op 分支，不触碰任何全局标志。
export async function rehydrateTesseractAvailability({ storage = defaultOCRStorage } = {}) {
  ensureTesseractBootstrap();
  if (tesseractOCREngine.isAvailable()) {
    return { rehydrated: true, reason: "already-ready" };
  }
  const cached = [];
  for (const language of TESSERACT_DEFAULT_LANGUAGES) {
    if (await storage.has(`tesseract/${language}.traineddata`)) cached.push(language);
  }
  if (cached.length === 0) {
    return { rehydrated: false, reason: "no-tessdata" };
  }
  // 与安全中心导入路径对齐：标志以 tessdata 在库为据；真正的 vendor wasm 加载仍在
  // recognize() 时把关（loadTesseractRuntime）。
  markTesseractVendorReady(true);
  const ready = await tesseractOCREngine.ensureProbe();
  if (ready && defaultModelCache.has(TESSERACT_MANIFEST_ID)) {
    defaultModelCache.setStatus(TESSERACT_MANIFEST_ID, STATUS_AVAILABLE, {
      message: `本地缓存 tessdata (${cached.join(", ")}) 已在启动时恢复。`,
      source: "cached",
      languages: cached,
    });
  }
  return { rehydrated: ready, reason: ready ? "cached" : "probe-failed" };
}
