import { ConversionError } from "./conversion-error.js";

export const REPAIR_ACTION_TYPES = Object.freeze([
  "replaceTextRun",
  "insertTextRun",
  "reorderBlocks",
  "restoreTableGrid",
  "adjustBoundingBox",
  "regeneratePageLayout",
  "selectFallbackRoute",
]);

const REQUIRED_FIELDS = ["actionType", "targetId", "before", "after", "confidence", "evidence"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createRepairAction({
  actionType,
  targetId,
  before,
  after,
  confidence,
  evidence,
  modelVersion = "",
  sourcePage = null,
  sourceSpan = null,
  targetField = null,
  fallback = null,
} = {}) {
  const action = {
    actionType,
    targetId,
    before,
    after,
    confidence,
    evidence,
    modelVersion,
    sourcePage,
    sourceSpan,
    targetField,
    fallback,
  };
  validateRepairAction(action);
  return Object.freeze(action);
}

export function validateRepairAction(action) {
  if (!isPlainObject(action)) {
    throw new ConversionError("Repair action must be an object.", {
      category: "validate",
      code: "REPAIR_ACTION_INVALID",
      details: { reason: "not-an-object" },
    });
  }
  for (const field of REQUIRED_FIELDS) {
    if (action[field] === undefined || action[field] === null) {
      throw new ConversionError(`Repair action missing required field: ${field}`, {
        category: "validate",
        code: "REPAIR_ACTION_INVALID",
        details: { reason: "missing-field", field },
      });
    }
  }
  if (!REPAIR_ACTION_TYPES.includes(action.actionType)) {
    throw new ConversionError(`Unknown repair actionType: ${action.actionType}`, {
      category: "validate",
      code: "REPAIR_ACTION_INVALID",
      details: { reason: "unknown-action-type", actionType: action.actionType },
    });
  }
  if (typeof action.targetId !== "string" || action.targetId.length === 0) {
    throw new ConversionError("Repair action targetId must be a non-empty string.", {
      category: "validate",
      code: "REPAIR_ACTION_INVALID",
      details: { reason: "invalid-target-id" },
    });
  }
  if (typeof action.confidence !== "number" || action.confidence < 0 || action.confidence > 1) {
    throw new ConversionError("Repair action confidence must be a number in [0, 1].", {
      category: "validate",
      code: "REPAIR_ACTION_INVALID",
      details: { reason: "invalid-confidence", confidence: action.confidence },
    });
  }
  if (!isPlainObject(action.evidence)) {
    throw new ConversionError("Repair action evidence must be an object.", {
      category: "validate",
      code: "REPAIR_ACTION_INVALID",
      details: { reason: "invalid-evidence" },
    });
  }
  return action;
}

export function summarizeAction(action) {
  return {
    actionType: action.actionType,
    targetId: action.targetId,
    confidence: action.confidence,
    modelVersion: action.modelVersion || "rule-based",
    evidenceKeys: Object.keys(action.evidence || {}),
  };
}
