import {
  defaultModelCache,
  STATUS_NOT_DOWNLOADED,
} from "../model-cache/availability.js";
import { createModelManifest } from "../model-cache/manifest.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { ensureTesseractBootstrap } from "./tesseract-bootstrap.js";
import { paddleOcrEngine, PADDLE_OCR_MANIFEST_ID, PADDLE_OCR_MODEL_FILES } from "./paddle-ocr-engine.js";

let bootstrapped = false;

export function ensurePaddleOcrBootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  // 在 tesseract 之后注册：保证 placeholder → tesseract → paddle 的注册顺序，
  // 都不可用时 pickForTask 回退候选落到 paddle（最高级 engine）。可用时的偏好
  // 排序（paddle 优先于 tesseract）留给 P9-D.4。
  ensureTesseractBootstrap();

  if (!defaultOCRRegistry.has(paddleOcrEngine.id)) {
    defaultOCRRegistry.register(paddleOcrEngine);
  }

  if (!defaultModelCache.has(PADDLE_OCR_MANIFEST_ID)) {
    const perFile = {};
    for (const file of PADDLE_OCR_MODEL_FILES) perFile[file] = "0".repeat(64);
    const manifest = createModelManifest({
      manifestId: PADDLE_OCR_MANIFEST_ID,
      task: "ocr-text",
      engine: "paddleocr",
      modelVersion: "v5",
      bundleSize: 16 * 1024 * 1024,
      quantization: "int8",
      minMemoryMB: 512,
      sources: [
        { kind: "on-demand-download", path: "model-cache/ocr-text/paddleocr/v5/ (det/cls/rec onnx)" },
        { kind: "user-provided", path: "PP-OCRv5 ONNX via 安全中心 → 下载/导入" },
      ],
      checksums: {
        algorithm: "SHA-256",
        digest: "0".repeat(64),
        perFile,
      },
      fallback: {
        onFailure: "use-degraded-route",
        message: "PP-OCRv5 ONNX 占位 manifest；onnxruntime-web 运行时接入留给 P9-D.2，模型按需下载留给 P9-D.3。",
      },
      ui: {
        label: "PP-OCRv5 高级 OCR (ONNX/WebGPU)",
        description: "比 Tesseract 更高精度的本地 OCR；ONNX Runtime + WebGPU（WASM 回退），数据留在本地、零云端。",
        enableHint: "首次启用时按需下载 PP-OCRv5 det/cls/rec ONNX 模型到本地缓存，SHA-256 校验通过后激活。",
      },
    });
    defaultModelCache.register(manifest);
    defaultModelCache.setStatus(PADDLE_OCR_MANIFEST_ID, STATUS_NOT_DOWNLOADED, {
      message: "等待 P9-D.2/P9-D.3 接入 onnxruntime-web 与按需下载；高级 OCR engine 已登记但运行时尚未就位。",
    });
  }
}

ensurePaddleOcrBootstrap();
