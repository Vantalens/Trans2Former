import { convertContentAsync } from "../browser-transformer.js";
import { normalizeConversionError } from "../core/conversion-error.js";
import { decodeTextBytes } from "../core/text-decoding.js";

// 转换阶段定义（用于文档和未来的细粒度进度报告）
// 注意：当前 convertContentAsync 是原子操作，无法报告中间阶段。
// 这些定义保留用于：
// 1. 文档化转换流程
// 2. 未来如果 convertContentAsync 支持进度回调时使用
const STAGES = {
  read: { stage: "read", progress: 0.1, message: "正在读取输入" },
  parse: { stage: "parse", progress: 0.28, message: "正在解析内容" },
  validate: { stage: "validate", progress: 0.46, message: "正在校验结构" },
  convert: { stage: "convert", progress: 0.64, message: "正在转换格式" },
  render: { stage: "render", progress: 0.82, message: "正在渲染输出" },
  package: { stage: "package", progress: 0.94, message: "正在准备下载" },
};

function postProgress(id, stageInfo) {
  workerScope?.postMessage({ id, type: "progress", ...stageInfo });
}

export function normalizeWorkerPayload(payload) {
  if (!payload?.contentBuffer) {
    return payload;
  }
  return {
    ...payload,
    content: decodeTextBytes(new Uint8Array(payload.contentBuffer), {
      fileName: payload.fileName || "",
      encoding: payload.contentEncoding || "utf-8",
      trustEncoding: true,
    }).text,
    contentBuffer: undefined,
  };
}

const workerScope = typeof self !== "undefined" ? self : null;

workerScope?.addEventListener("message", async (event) => {
  const { id, payload } = event.data || {};
  if (!id || !payload) {
    return;
  }

  try {
    // 只在真实开始转换时报告一次进度（而非转换前连发4个假阶段）
    postProgress(id, { stage: "convert", progress: 0.1, message: "正在转换" });

    const result = await convertContentAsync(normalizeWorkerPayload(payload));

    // 转换完成后报告
    postProgress(id, { stage: "complete", progress: 1, message: "转换完成" });
    workerScope.postMessage({ id, type: "result", result });
  } catch (error) {
    const conversionError = normalizeConversionError(error);
    workerScope.postMessage({
      id,
      type: "error",
      error: {
        ...conversionError.toJSON(),
        stack: error instanceof Error ? error.stack : "",
      },
    });
  }
});
