import {
  defaultModelCache,
  STATUS_DISABLED,
} from "../model-cache/availability.js";
import { createModelManifest } from "../model-cache/manifest.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { placeholderOCREngine, PLACEHOLDER_OCR_MANIFEST_ID } from "./placeholder-engine.js";

let bootstrapped = false;

export function ensureOCRBootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  if (!defaultOCRRegistry.has(placeholderOCREngine.id)) {
    defaultOCRRegistry.register(placeholderOCREngine);
  }

  if (!defaultModelCache.has(PLACEHOLDER_OCR_MANIFEST_ID)) {
    const manifest = createModelManifest({
      manifestId: PLACEHOLDER_OCR_MANIFEST_ID,
      task: "ocr-text",
      engine: "custom",
      modelVersion: "0.1.0",
      bundleSize: 1,
      quantization: "none",
      minMemoryMB: 0,
      sources: [{ kind: "vendor-bundle", path: "placeholder" }],
      checksums: {
        algorithm: "SHA-256",
        digest: "0".repeat(64),
        perFile: {},
      },
      fallback: {
        onFailure: "use-degraded-route",
        message: "P9-A 占位 manifest，等待真实模型接入",
      },
      ui: {
        label: "OCR 文字识别 · 占位",
        description: "P9-A.1 仅注册契约；接入真实 Tesseract.js 留给 P9-A.2",
        enableHint: "占位 manifest，不会触发任何下载",
      },
    });
    defaultModelCache.register(manifest);
    defaultModelCache.setStatus(PLACEHOLDER_OCR_MANIFEST_ID, STATUS_DISABLED, {
      message: "P9-A.1 占位条目；启用真实 OCR 留给 P9-A.2",
    });
  }
}

ensureOCRBootstrap();
