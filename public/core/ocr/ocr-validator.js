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
    candidates.push(createRepairAction({
      actionType: "replaceTextRun",
      targetId,
      before: line.text,
      after: line.text,
      confidence: 1 - line.confidence,
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
}
