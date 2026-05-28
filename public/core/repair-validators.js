import { createRepairAction, REPAIR_ACTION_TYPES } from "./repair-actions.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function detectLossyRepairHints(model) {
  const warnings = Array.isArray(model.metadata?.warnings) ? model.metadata.warnings : [];
  const actions = [];
  for (const warning of warnings) {
    if (!isPlainObject(warning) || warning.severity !== "lossy") continue;
    const hint = warning.details?.repairAction;
    if (!isPlainObject(hint)) continue;
    if (!REPAIR_ACTION_TYPES.includes(hint.actionType)) continue;
    try {
      actions.push(createRepairAction({
        actionType: hint.actionType,
        targetId: hint.targetId,
        before: hint.before,
        after: hint.after,
        confidence: typeof hint.confidence === "number" ? hint.confidence : 0.7,
        evidence: { source: "lossy-warning", warningCode: warning.code, ...(hint.evidence || {}) },
        modelVersion: hint.modelVersion || "rule-based",
        sourcePage: hint.sourcePage ?? null,
        sourceSpan: hint.sourceSpan ?? null,
        targetField: hint.targetField ?? null,
        fallback: hint.fallback ?? null,
      }));
    } catch (error) {
      // Malformed hint - skip silently; validator surface is best-effort
    }
  }
  return actions;
}

export function detectRouteClassDegradation(model, ctx) {
  const routeClass = model.metadata?.conversion?.routeClass;
  if (!["generated", "restricted"].includes(routeClass)) return [];
  if (!ctx
    || typeof ctx.from !== "string"
    || typeof ctx.to !== "string"
    || typeof ctx.getAllowedOutputFormats !== "function"
    || typeof ctx.getRouteDetails !== "function") {
    return [];
  }
  const candidates = ctx.getAllowedOutputFormats(ctx.from).filter((target) => target !== ctx.to);
  const safer = candidates.find((target) => {
    const details = ctx.getRouteDetails(ctx.from, target);
    return details && !["generated", "restricted"].includes(details.routeClass);
  });
  if (!safer) return [];
  return [createRepairAction({
    actionType: "selectFallbackRoute",
    targetId: `route:${ctx.from}->${ctx.to}`,
    before: { to: ctx.to, routeClass },
    after: { to: safer, routeClass: ctx.getRouteDetails(ctx.from, safer)?.routeClass || "recommended" },
    confidence: 0.8,
    evidence: {
      source: "route-class-degradation",
      from: ctx.from,
      originalTo: ctx.to,
      saferTo: safer,
      originalRouteClass: routeClass,
    },
    fallback: { to: safer },
  })];
}

export const DEFAULT_VALIDATORS = Object.freeze([
  detectLossyRepairHints,
  detectRouteClassDegradation,
]);
