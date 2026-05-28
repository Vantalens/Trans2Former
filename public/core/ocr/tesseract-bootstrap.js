import {
  defaultModelCache,
  STATUS_NOT_DOWNLOADED,
} from "../model-cache/availability.js";
import { createModelManifest } from "../model-cache/manifest.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { ensureOCRBootstrap } from "./ocr-bootstrap.js";
import { tesseractOCREngine, TESSERACT_MANIFEST_ID } from "./tesseract-engine.js";

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
