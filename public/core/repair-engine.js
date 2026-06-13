import { ensureDocumentAudit } from "./document-audit.js";
import { validateRepairAction, summarizeAction } from "./repair-actions.js";
import { DEFAULT_HANDLERS } from "./repair-handlers.js";
import { DEFAULT_VALIDATORS } from "./repair-validators.js";
import { detectOCRLowConfidence } from "./ocr/ocr-validator.js";
import { ROUND_TRIP_FORMATS, modelFingerprint } from "./verification/block-fingerprint.js";
import { createWarning, withWarnings } from "./warnings.js";

export const MIN_CONFIDENCE = 0.6;

function summarizeQuality(model) {
  const report = model.metadata?.qualityReport || {};
  return {
    warningCount: report.warningCount ?? 0,
    downgradeCount: report.downgradeCount ?? 0,
    structureFidelity: report.structureFidelity ?? "unknown",
  };
}

function isRoundTripEligible(from, to) {
  return ROUND_TRIP_FORMATS.has(from) && ROUND_TRIP_FORMATS.has(to) && from === to;
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function validatorTaskName(validator, index) {
  const names = {
    detectLossyRepairHints: "lossy-warning-scan",
    detectRouteClassDegradation: "route-class-check",
    detectOCRLowConfidence: "ocr-low-confidence-scan",
  };
  return names[validator?.name] || `validator-${index + 1}`;
}

export class RepairEngine {
  constructor() {
    this.validators = [];
    this.handlers = new Map();
  }

  registerValidator(fn) {
    if (typeof fn !== "function") throw new TypeError("RepairEngine validator must be a function.");
    this.validators.push(fn);
  }

  registerHandler(actionType, fn) {
    if (typeof actionType !== "string" || actionType.length === 0) {
      throw new TypeError("RepairEngine handler requires a non-empty actionType.");
    }
    if (typeof fn !== "function") {
      throw new TypeError("RepairEngine handler must be a function.");
    }
    this.handlers.set(actionType, fn);
  }

  hasHandler(actionType) {
    return this.handlers.has(actionType);
  }

  proposeActions(model, ctx) {
    const proposed = [];
    for (const validator of this.validators) {
      let actions = [];
      try {
        actions = validator(model, ctx) || [];
      } catch (error) {
        actions = [];
      }
      for (const action of actions) {
        try {
          validateRepairAction(action);
          proposed.push(action);
        } catch (error) {
          // Malformed validator output - skip without breaking the cycle
        }
      }
    }
    return proposed;
  }

  applyActions({ model, actions, output, ctx }) {
    const applied = [];
    const rejected = [];
    const recommendations = [];
    let currentModel = model;
    let currentOutput = output;
    let fallbackTo = null;
    let fallbackApplied = false;

    for (const action of actions) {
      if (action.confidence < MIN_CONFIDENCE) {
        rejected.push({ ...summarizeAction(action), note: "below-min-confidence" });
        continue;
      }
      const handler = this.handlers.get(action.actionType);
      if (!handler) {
        rejected.push({ ...summarizeAction(action), note: "no-handler" });
        continue;
      }
      let result;
      try {
        result = handler({ model: currentModel, action, context: ctx }) || { ok: false, note: "handler-returned-empty" };
      } catch (error) {
        rejected.push({ ...summarizeAction(action), note: `handler-error:${error?.code || error?.message || "unknown"}` });
        continue;
      }
      if (!result.ok) {
        rejected.push({ ...summarizeAction(action), note: result.note || "handler-rejected" });
        continue;
      }
      if (result.outputOverride !== undefined) {
        currentOutput = result.outputOverride;
        fallbackTo = result.fallbackTo || fallbackTo;
        fallbackApplied = true;
        currentModel = result.model || currentModel;
      } else if (result.fallbackRecommended) {
        recommendations.push({ ...summarizeAction(action), fallbackTo: result.fallbackTo, note: result.note || "fallback-recommended" });
      } else {
        currentModel = result.model || currentModel;
      }
      applied.push({ ...summarizeAction(action), note: result.note || "applied" });
    }

    return { model: currentModel, output: currentOutput, applied, rejected, recommendations, fallbackTo, fallbackApplied };
  }

  reverifyModel({ before, after, ctx }) {
    const refreshed = ensureDocumentAudit(after, {
      content: ctx?.content || "",
      reader: ctx?.from || "",
      writer: ctx?.to || "",
      targetFormat: ctx?.to || "",
      fileName: ctx?.fileName || "",
      options: ctx?.options || {},
    });
    const beforeQuality = summarizeQuality(before);
    const afterQuality = summarizeQuality(refreshed);
    const verified = afterQuality.warningCount <= beforeQuality.warningCount
      && afterQuality.downgradeCount <= beforeQuality.downgradeCount;
    return { refreshed, beforeQuality, afterQuality, verified };
  }

  reverifyRoundTrip({ output, model, ctx }) {
    if (!ctx || typeof ctx.read !== "function") {
      return { eligible: false, reason: "no-read-hook" };
    }
    if (!isRoundTripEligible(ctx.from, ctx.to)) {
      return { eligible: false, reason: "format-not-round-trip-safe" };
    }
    const payload = output?.data;
    if (typeof payload !== "string") {
      return { eligible: false, reason: "output-not-string" };
    }
    let readBack;
    try {
      readBack = ctx.read({ content: payload, from: ctx.to, title: ctx.title || "round-trip" });
    } catch (error) {
      return {
        eligible: true,
        ok: false,
        reason: `read-back-failed:${error?.code || error?.message || "unknown"}`,
      };
    }
    const originalFingerprint = modelFingerprint(model);
    const readBackFingerprint = modelFingerprint(readBack);
    const ok = originalFingerprint === readBackFingerprint;
    return {
      eligible: true,
      ok,
      blockCountDelta: (readBack.blocks?.length || 0) - (model.blocks?.length || 0),
      fingerprintMatch: ok,
    };
  }

  runCycle({ model, output, ctx }) {
    const start = nowMs();
    const validatorContext = ctx || {};
    const proposed = this.proposeActions(model, validatorContext);
    const createModelReview = () => ({
      engine: "rule-based",
      modelVersion: "s2-bootstrap",
      tasks: this.validators.map(validatorTaskName),
      inferenceMode: "local",
      runtimeMs: nowMs() - start,
      device: "cpu",
    });

    if (proposed.length === 0) {
      const roundTrip = this.reverifyRoundTrip({ output, model, ctx: validatorContext });
      return {
        model,
        output,
        autoRepair: {
          attempted: false,
          appliedActions: [],
          rejectedActions: [],
          fallbackUsed: false,
          fallbackTo: null,
          postRepairVerified: true,
          roundTripDelta: roundTrip.eligible ? { ok: roundTrip.ok, blockCountDelta: roundTrip.blockCountDelta ?? 0 } : { ok: null, skipped: roundTrip.reason },
          finalDecision: "verified",
        },
        modelReview: createModelReview(),
      };
    }

    const applyResult = this.applyActions({ model, actions: proposed, output, ctx: validatorContext });
    const fallbackUsed = applyResult.fallbackApplied === true;
    const verification = this.reverifyModel({ before: model, after: applyResult.model, ctx: validatorContext });
    const roundTrip = this.reverifyRoundTrip({ output: applyResult.output, model: verification.refreshed, ctx: validatorContext });
    const postRepairVerified = verification.verified && (!roundTrip.eligible || roundTrip.ok !== false);

    let finalDecision;
    if (applyResult.applied.length === 0) {
      finalDecision = "degraded";
    } else if (postRepairVerified) {
      finalDecision = "verified";
    } else {
      finalDecision = "failed-quality-gate";
    }

    return {
      model: verification.refreshed,
      output: applyResult.output,
      autoRepair: {
        attempted: true,
        appliedActions: applyResult.applied,
        rejectedActions: applyResult.rejected,
        recommendations: applyResult.recommendations,
        fallbackUsed,
        fallbackTo: applyResult.fallbackTo,
        postRepairVerified,
        roundTripDelta: roundTrip.eligible ? { ok: roundTrip.ok, blockCountDelta: roundTrip.blockCountDelta ?? 0 } : { ok: null, skipped: roundTrip.reason },
        beforeQuality: verification.beforeQuality,
        afterQuality: verification.afterQuality,
        finalDecision,
      },
      modelReview: createModelReview(),
    };
  }
}

export function createDefaultRepairEngine() {
  const engine = new RepairEngine();
  for (const validator of DEFAULT_VALIDATORS) {
    engine.registerValidator(validator);
  }
  engine.registerValidator(detectOCRLowConfidence);
  for (const [actionType, handler] of Object.entries(DEFAULT_HANDLERS)) {
    engine.registerHandler(actionType, handler);
  }
  return engine;
}

export const defaultRepairEngine = createDefaultRepairEngine();

export function annotateRoundTripSkipped(metadataWarnings, reason) {
  return withWarnings({ warnings: metadataWarnings || [] }, [
    createWarning(
      "info",
      "ROUND_TRIP_NOT_ENABLED",
      `Round-trip verification not enabled for this path: ${reason}.`,
      { reason },
    ),
  ]).warnings;
}
