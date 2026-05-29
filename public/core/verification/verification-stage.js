// 验证阶段编排：在 Repair Engine cycle 之后跑，组合 P9-C 三层检验结果到统一 envelope。
// 本批仅实现第一层（rule-diff）；P9-C.2 SSIM、P9-C.3 OCR 回读以后按相同 envelope 接入。

import { createWarning } from "../warnings.js";
import { ROUND_TRIP_FORMATS } from "./block-fingerprint.js";
import { diffSemanticDocs } from "./rule-diff.js";

export const RULE_DIFF_DRIFT = "RULE_DIFF_DRIFT";
export const RULE_DIFF_READBACK_FAILED = "RULE_DIFF_READBACK_FAILED";

const CROSS_FORMAT_LOOPBACK_PAIRS = new Set([
  "md->html",
  "html->md",
]);

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function skippedEntry(layer, reason) {
  return { layer, reason };
}

function buildEmptyEnvelope(reason, runtimeMs) {
  return {
    eligible: false,
    reason,
    layers: [],
    skipped: [skippedEntry("rule-diff", reason)],
    ruleDiff: null,
    warnings: [],
    runtimeMs,
  };
}

function shouldRunRuleDiff(ctx, output) {
  if (!ROUND_TRIP_FORMATS.has(ctx?.from) || !ROUND_TRIP_FORMATS.has(ctx?.to)) {
    return { ok: false, reason: "writer-not-text-canonical" };
  }
  if (typeof output?.data !== "string") {
    return { ok: false, reason: "output-not-string" };
  }
  return { ok: true };
}

function safeRead(ctx, payload, fromFormat) {
  try {
    const readBack = ctx.read({
      content: payload,
      from: fromFormat,
      title: ctx?.title || "verification-readback",
    });
    return { ok: true, model: readBack };
  } catch (error) {
    return {
      ok: false,
      error: error?.code || error?.message || "unknown",
    };
  }
}

function safeCrossLoopback(ctx, payload) {
  // payload 在 ctx.to 格式中：先反向 prepareConversionModel(payload, from = ctx.to, to = ctx.from)，
  // 用 ctx.write 把它写回原格式，再 read 一次以拿到与 original 同源格式的 SemanticDoc。
  if (typeof ctx?.prepareConversionModel !== "function" || typeof ctx?.write !== "function") {
    return { ok: false, error: "ctx-missing-pipeline" };
  }
  try {
    const reverseModel = ctx.prepareConversionModel({
      content: payload,
      from: ctx.to,
      to: ctx.from,
      title: ctx?.title || "verification-readback",
      fileName: "",
      options: { repair: false },
    });
    const reverseOutput = ctx.write({
      model: reverseModel,
      to: ctx.from,
      title: ctx?.title || "verification-readback",
      options: {},
    });
    if (typeof reverseOutput?.data !== "string") {
      return { ok: false, error: "reverse-output-not-string" };
    }
    const readBack = ctx.read({
      content: reverseOutput.data,
      from: ctx.from,
      title: ctx?.title || "verification-readback",
    });
    return { ok: true, model: readBack };
  } catch (error) {
    return { ok: false, error: error?.code || error?.message || "unknown" };
  }
}

export function runVerificationStage({ model, output, ctx } = {}) {
  const start = nowMs();
  const gating = shouldRunRuleDiff(ctx, output);
  if (!gating.ok) {
    return buildEmptyEnvelope(gating.reason, nowMs() - start);
  }
  if (typeof ctx?.read !== "function") {
    return buildEmptyEnvelope("ctx-missing-read", nowMs() - start);
  }

  let readBackResult;
  const pairKey = `${ctx.from}->${ctx.to}`;

  if (ctx.from === ctx.to) {
    readBackResult = safeRead(ctx, output.data, ctx.to);
  } else if (CROSS_FORMAT_LOOPBACK_PAIRS.has(pairKey)) {
    readBackResult = safeCrossLoopback(ctx, output.data);
  } else {
    return buildEmptyEnvelope("cross-format-loopback-not-enabled", nowMs() - start);
  }

  if (!readBackResult.ok) {
    const warning = createWarning(
      "info",
      RULE_DIFF_READBACK_FAILED,
      `Rule-diff readback failed for ${pairKey}: ${readBackResult.error}.`,
      { from: ctx.from, to: ctx.to, cause: readBackResult.error },
    );
    return {
      eligible: true,
      reason: "readback-failed",
      layers: [],
      skipped: [skippedEntry("rule-diff", `readback-failed:${readBackResult.error}`)],
      ruleDiff: null,
      warnings: [warning],
      runtimeMs: nowMs() - start,
    };
  }

  const ruleDiff = diffSemanticDocs(model, readBackResult.model);
  const warnings = [];
  if (ruleDiff.fidelity !== "exact") {
    warnings.push(createWarning(
      "info",
      RULE_DIFF_DRIFT,
      `Rule-diff detected ${ruleDiff.fidelity} for ${pairKey} (score ${ruleDiff.overallScore.toFixed(3)}).`,
      {
        from: ctx.from,
        to: ctx.to,
        fidelity: ruleDiff.fidelity,
        score: ruleDiff.overallScore,
        addedCount: ruleDiff.addedBlocks.length,
        removedCount: ruleDiff.removedBlocks.length,
        changedCount: ruleDiff.changedBlocks.length,
      },
    ));
  }

  return {
    eligible: true,
    reason: "completed",
    layers: ["rule-diff"],
    skipped: [],
    ruleDiff,
    warnings,
    runtimeMs: nowMs() - start,
  };
}
