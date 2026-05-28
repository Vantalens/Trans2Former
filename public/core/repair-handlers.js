import { REPAIR_ACTION_TYPES } from "./repair-actions.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneModel(model) {
  return JSON.parse(JSON.stringify(model));
}

function defaultFieldFor(blockType) {
  if (blockType === "heading" || blockType === "paragraph" || blockType === "quote") return "text";
  if (blockType === "code") return "code";
  return null;
}

function findBlock(model, targetId) {
  return (model.blocks || []).find((block) => block.id === targetId);
}

function replaceWithinString(value, before, after) {
  if (typeof value !== "string" || !value.includes(before)) return null;
  return value.split(before).join(after);
}

function applyReplaceTextRun({ model, action }) {
  const block = findBlock(model, action.targetId);
  if (!block) return { ok: false, model, note: "target-block-not-found" };

  const cloned = cloneModel(model);
  const clonedBlock = findBlock(cloned, action.targetId);

  const listMatch = typeof action.targetField === "string"
    ? action.targetField.match(/^items\[(\d+)\]$/)
    : null;

  if (listMatch) {
    const index = Number(listMatch[1]);
    if (!Array.isArray(clonedBlock.items) || index >= clonedBlock.items.length) {
      return { ok: false, model, note: "field-out-of-bounds" };
    }
    const replaced = replaceWithinString(clonedBlock.items[index], action.before, action.after);
    if (replaced === null) return { ok: false, model, note: "before-not-found" };
    clonedBlock.items[index] = replaced;
    return { ok: true, model: cloned, note: `replaced-items[${index}]` };
  }

  const field = action.targetField || defaultFieldFor(clonedBlock.type);
  if (!field) return { ok: false, model, note: "no-suitable-field" };
  const replaced = replaceWithinString(clonedBlock[field], action.before, action.after);
  if (replaced === null) return { ok: false, model, note: "before-not-found" };
  clonedBlock[field] = replaced;
  return { ok: true, model: cloned, note: `replaced-${field}` };
}

function applySelectFallbackRoute({ model, action, context }) {
  if (!isPlainObject(action.fallback) || typeof action.fallback.to !== "string") {
    return { ok: false, model, note: "missing-fallback-target" };
  }
  const fallbackTo = action.fallback.to;
  if (!context || typeof context.prepareConversionModel !== "function" || typeof context.write !== "function") {
    return { ok: false, model, note: "registry-handles-missing" };
  }
  if (fallbackTo === context.to) {
    return { ok: false, model, note: "fallback-equals-original" };
  }
  const applyFallback = context.options?.repair?.applyFallback === true;
  if (!applyFallback) {
    return {
      ok: true,
      model,
      fallbackTo,
      fallbackRecommended: true,
      note: `fallback-recommended:${fallbackTo}`,
    };
  }
  try {
    const fallbackModel = context.prepareConversionModel({
      content: context.content,
      from: context.from,
      to: fallbackTo,
      title: context.title,
      fileName: context.fileName,
      options: { ...(context.options || {}), repair: false },
    });
    const fallbackOutput = context.write({
      model: fallbackModel,
      to: fallbackTo,
      title: context.title,
      options: { ...(context.options || {}), repair: false },
    });
    return {
      ok: true,
      model: fallbackModel,
      outputOverride: fallbackOutput,
      fallbackTo,
      fallbackApplied: true,
      note: `fallback-to-${fallbackTo}`,
    };
  } catch (error) {
    return {
      ok: false,
      model,
      note: `fallback-route-failed:${error?.code || error?.message || "unknown"}`,
    };
  }
}

function placeholderHandler(label) {
  return ({ model }) => ({ ok: false, model, note: `handler-not-implemented:${label}` });
}

export const DEFAULT_HANDLERS = Object.freeze({
  replaceTextRun: applyReplaceTextRun,
  insertTextRun: placeholderHandler("insertTextRun"),
  reorderBlocks: placeholderHandler("reorderBlocks"),
  restoreTableGrid: placeholderHandler("restoreTableGrid"),
  adjustBoundingBox: placeholderHandler("adjustBoundingBox"),
  regeneratePageLayout: placeholderHandler("regeneratePageLayout"),
  selectFallbackRoute: applySelectFallbackRoute,
});

for (const actionType of REPAIR_ACTION_TYPES) {
  if (!DEFAULT_HANDLERS[actionType]) {
    throw new Error(`Repair handler registry missing entry for ${actionType}`);
  }
}
