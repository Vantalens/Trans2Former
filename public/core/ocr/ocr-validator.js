import { createRepairAction } from "../repair-actions.js";

const LOW_CONFIDENCE_THRESHOLD = 0.55;
const MAX_ACTIONS_PER_PAGE = 8;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function gatherLowConfidenceLines(model) {
  const ocr = model?.metadata?.ocr;
  if (!isPlainObject(ocr) || !Array.isArray(ocr.lines)) return [];
  return ocr.lines.filter((line) => typeof line?.confidence === "number" && line.confidence < LOW_CONFIDENCE_THRESHOLD);
}

export function detectOCRLowConfidence(model) {
  const lowLines = gatherLowConfidenceLines(model);
  if (lowLines.length === 0) return [];

  // 注意：当前实现只是检测低置信度行，但不生成实际修复动作。
  // 在没有真实候选纠错文本（来自语言模型或字典）之前，
  // 生成 before===after 的 no-op replaceTextRun 会导致：
  // 1. repair-engine 误报「已修复」但文本一字未改
  // 2. 置信度倒挂（1-ocrConfidence 使低质量行变高置信度修复）
  // 3. finalDecision 从 degraded 变 verified，报告失真
  //
  // 正确做法：等待 P9-B 真模型审核接入后，用真实候选文本生成动作。
  // 当前暂时返回空数组，低置信度行仍记录在 metadata.ocr.lines 中供查看。
  //
  // 参考：docs/MULTI_MODEL_ARCHITECTURE.md:203
  // 「这些候选本意是 P9-B 真模型审核接入后可以自动 apply」

  return [];

  // 以下是原实现（已禁用），保留作为未来接入真实候选时的模板：
  /*
  const candidates = [];
  const seen = new Set();
  for (const line of lowLines) {
    if (candidates.length >= MAX_ACTIONS_PER_PAGE) break;
    if (typeof line.text !== "string" || line.text.length === 0) continue;
    const targetId = typeof line.blockId === "string" && line.blockId.length > 0
      ? line.blockId
      : `ocr-line-${line.pageIndex ?? 0}-${line.lineIndex ?? 0}`;
    if (seen.has(targetId)) continue;
    seen.add(targetId);

    // TODO: 从真模型获取候选修复文本
    const candidateText = line.text; // 当前 no-op: before===after

    candidates.push(createRepairAction({
      actionType: "replaceTextRun",
      targetId,
      before: line.text,
      after: candidateText,  // 应该是真实候选，而非 line.text
      confidence: 0.5,  // 应该是修复置信度，而非 1-line.confidence（倒挂）
      evidence: {
        source: "ocr-low-confidence",
        ocrConfidence: line.confidence,
        threshold: LOW_CONFIDENCE_THRESHOLD,
        engineId: model?.metadata?.modelReview?.engine || "",
        modelVersion: model?.metadata?.modelReview?.modelVersion || "",
        language: model?.metadata?.modelReview?.ocr?.language || "auto",
        bbox: line.bbox || null,
        pageIndex: line.pageIndex ?? null,
        lineIndex: line.lineIndex ?? null,
      },
      targetField: "text",
      modelVersion: model?.metadata?.modelReview?.modelVersion || "rule-based",
    }));
  }
  return candidates;
  */
}
