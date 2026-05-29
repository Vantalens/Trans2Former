// PP-OCRv5 ONNX Runtime 运行时加载器（P9-D.2）。dynamic import 同源 vendor onnxruntime-web，
// WebGPU 优先 / WASM 回退选择执行后端，提供 InferenceSession 创建/释放骨架。数据留在本地、
// 零云端。真实 det/cls/rec 推理管线 + CTC 解码留给 P9-D.2.b。

import { ConversionError } from "../conversion-error.js";

export const OCR_VENDOR_LOAD_FAILED = "OCR_VENDOR_LOAD_FAILED";

export const PADDLE_VENDOR_PATHS = Object.freeze({
  // ORT 的 ESM 入口；浏览器/Tauri 端从同源 vendor 目录加载，wasm 二进制亦在该目录。
  mainBundle: "/vendor/onnxruntime/ort.min.mjs",
  wasmDir: "/vendor/onnxruntime/",
});

let cachedNamespace = null;

function hasWebGPU() {
  return typeof globalThis !== "undefined"
    && typeof globalThis.navigator === "object"
    && globalThis.navigator !== null
    && typeof globalThis.navigator.gpu === "object"
    && globalThis.navigator.gpu !== null;
}

// WebGPU 可用 → ["webgpu","wasm"]（webgpu 优先，wasm 回退）；否则 ["wasm"]。
// Node（无 navigator.gpu）返回 ["wasm"]，纯函数可测。
export function pickExecutionProviders() {
  return hasWebGPU() ? ["webgpu", "wasm"] : ["wasm"];
}

export async function loadOnnxRuntime(vendorUrl = PADDLE_VENDOR_PATHS.mainBundle) {
  if (cachedNamespace) return cachedNamespace;
  try {
    const ort = await import(/* @vite-ignore */ vendorUrl);
    const namespace = ort?.default && ort.default.InferenceSession ? ort.default : ort;
    if (!namespace || !namespace.InferenceSession) {
      throw new Error("vendor onnxruntime-web missing InferenceSession");
    }
    // 让 ORT 从同源 vendor 目录加载 wasm 二进制，绝不联网。
    if (namespace.env?.wasm) {
      namespace.env.wasm.wasmPaths = PADDLE_VENDOR_PATHS.wasmDir;
    }
    cachedNamespace = namespace;
    return cachedNamespace;
  } catch (error) {
    throw new ConversionError(
      `onnxruntime-web vendor 加载失败：${error?.message || error}`,
      {
        category: "convert",
        code: OCR_VENDOR_LOAD_FAILED,
        details: {
          path: vendorUrl,
          cause: String(error?.name || error?.message || "unknown"),
        },
      },
    );
  }
}

export async function createOcrSession({ ort, modelBuffer, providers = pickExecutionProviders() } = {}) {
  if (!ort || !ort.InferenceSession) {
    throw new ConversionError("onnxruntime namespace 未就位，无法创建 InferenceSession。", {
      category: "convert",
      code: OCR_VENDOR_LOAD_FAILED,
      details: { reason: "namespace-missing" },
    });
  }
  if (!modelBuffer) {
    throw new ConversionError("createOcrSession requires an ONNX model buffer.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "missing-model-buffer" },
    });
  }
  try {
    const data = modelBuffer instanceof ArrayBuffer ? new Uint8Array(modelBuffer) : modelBuffer;
    return await ort.InferenceSession.create(data, { executionProviders: providers });
  } catch (error) {
    throw new ConversionError(`ONNX InferenceSession 创建失败：${error?.message || error}`, {
      category: "convert",
      code: "OCR_ENGINE_FAILED",
      details: { reason: "session-create-failed", providers, cause: String(error?.name || error?.message || "unknown") },
    });
  }
}

export async function disposeOcrSession(session) {
  if (session && typeof session.release === "function") {
    try { await session.release(); } catch (error) { /* ignore */ }
  }
}

export function resetOnnxRuntimeCache() {
  cachedNamespace = null;
}
