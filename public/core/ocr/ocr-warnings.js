import { createWarning } from "../warnings.js";

export const OCR_UNAVAILABLE = "OCR_UNAVAILABLE";
export const OCR_LOW_CONFIDENCE = "OCR_LOW_CONFIDENCE";
export const OCR_ENGINE_FAILED = "OCR_ENGINE_FAILED";
export const OCR_DEGRADED_ROUTE = "OCR_DEGRADED_ROUTE";
export const OCR_SCAN_PAGES_TRUNCATED = "OCR_SCAN_PAGES_TRUNCATED";

export const OCR_WARNING_CODES = Object.freeze([
  OCR_UNAVAILABLE,
  OCR_LOW_CONFIDENCE,
  OCR_ENGINE_FAILED,
  OCR_DEGRADED_ROUTE,
  OCR_SCAN_PAGES_TRUNCATED,
]);

export function createOCRUnavailableWarning(details = {}) {
  const engineId = details.engineId || "placeholder";
  const manifestId = details.manifestId || "ocr-text.placeholder.0.1.0";
  return createWarning(
    "info",
    OCR_UNAVAILABLE,
    "OCR 模型未启用，图片中的文字未被识别；仅保留资产引用与可读 fallback。",
    { engineId, manifestId, reason: details.reason || "engine-not-enabled", task: details.task || "ocr-text" },
  );
}

export function createOCREngineFailedWarning(details = {}) {
  return createWarning(
    "lossy",
    OCR_ENGINE_FAILED,
    `OCR 引擎执行失败：${details.reason || details.cause || "未知原因"}。降级到资产引用路径。`,
    {
      engineId: details.engineId || "unknown",
      manifestId: details.manifestId || "",
      cause: details.cause || details.reason || "unknown",
    },
  );
}

export function createOCRLowConfidenceWarning(details = {}) {
  const confidence = typeof details.averageConfidence === "number"
    ? details.averageConfidence.toFixed(2)
    : "未知";
  return createWarning(
    "lossy",
    OCR_LOW_CONFIDENCE,
    `OCR 平均置信度较低（${confidence}），结果仅供参考。`,
    {
      averageConfidence: details.averageConfidence ?? null,
      threshold: details.threshold ?? null,
      engineId: details.engineId || "",
    },
  );
}

export function createOCRDegradedRouteWarning(details = {}) {
  return createWarning(
    "info",
    OCR_DEGRADED_ROUTE,
    "OCR 模型未就绪，当前路径以降级模式输出（仅保留可读 fallback）。",
    {
      task: details.task || "ocr-text",
      manifestId: details.manifestId || "",
      reason: details.reason || "engine-not-enabled",
    },
  );
}

export function createOCRScanPagesTruncatedWarning(details = {}) {
  const totalPages = details.totalPages ?? 0;
  const processedPages = details.processedPages ?? 0;
  const maxScanPages = details.maxScanPages ?? processedPages;
  // severity "lossy"：未处理页是真实内容丢失，需计入 downgradeCount 并在报告中可见。
  return createWarning(
    "lossy",
    OCR_SCAN_PAGES_TRUNCATED,
    `扫描 PDF 共 ${totalPages} 页，仅对前 ${processedPages} 页执行 OCR（上限 maxScanPages=${maxScanPages}）；第 ${processedPages + 1}–${totalPages} 页未转换。如需完整转换，请调高 options.ocr.maxScanPages。`,
    {
      totalPages,
      processedPages,
      maxScanPages,
      engineId: details.engineId || "",
    },
  );
}
