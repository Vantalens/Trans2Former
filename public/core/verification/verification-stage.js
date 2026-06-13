// 验证阶段编排：在 Repair Engine cycle 之后跑，组合 P9-C 三层检验结果到统一 envelope。
// 本批仅实现第一层（rule-diff）；P9-C.2 SSIM、P9-C.3 OCR 回读以后按相同 envelope 接入。

import { createWarning } from "../warnings.js";
import { ROUND_TRIP_FORMATS } from "./block-fingerprint.js";
import { diffSemanticDocs } from "./rule-diff.js";
import { compareImages } from "./ssim.js";
import {
  defaultPageImageSource,
  RASTERIZABLE_FORMATS,
} from "./page-image-source.js";

export const RULE_DIFF_DRIFT = "RULE_DIFF_DRIFT";
export const RULE_DIFF_READBACK_FAILED = "RULE_DIFF_READBACK_FAILED";
export const SSIM_VISUAL_DRIFT = "SSIM_VISUAL_DRIFT";
export const SSIM_SOURCE_UNAVAILABLE = "SSIM_SOURCE_UNAVAILABLE";

export const DEFAULT_SSIM_THRESHOLD = 0.85;

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

function syncPipelineSkipped() {
  return [
    skippedEntry("ssim", "sync-pipeline"),
    skippedEntry("ocr-readback", "sync-pipeline"),
  ];
}

function buildEmptyEnvelope(reason, runtimeMs) {
  return {
    eligible: false,
    reason,
    layers: [],
    skipped: [skippedEntry("rule-diff", reason), ...syncPipelineSkipped()],
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
      skipped: [skippedEntry("rule-diff", `readback-failed:${readBackResult.error}`), ...syncPipelineSkipped()],
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
    skipped: syncPipelineSkipped(),
    ruleDiff,
    warnings,
    runtimeMs: nowMs() - start,
  };
}

// ---- SSIM 视觉回环层（P9-C.2，异步） ----

function ssimGate(ctx) {
  if (!RASTERIZABLE_FORMATS.has(ctx?.from)) {
    return { ok: false, reason: ctx?.from ? "source-not-rasterizable" : "no-source-format" };
  }
  if (!RASTERIZABLE_FORMATS.has(ctx?.to)) {
    return { ok: false, reason: "output-not-rasterizable" };
  }
  return { ok: true };
}

export async function runSsimLayer({ ctx, output, imageSource = defaultPageImageSource } = {}) {
  const start = nowMs();
  const gate = ssimGate(ctx);
  if (!gate.ok) {
    return {
      eligible: false,
      reason: gate.reason,
      ssim: null,
      warnings: [],
      runtimeMs: nowMs() - start,
    };
  }

  const threshold = typeof ctx?.options?.verification?.ssimThreshold === "number"
    ? ctx.options.verification.ssimThreshold
    : DEFAULT_SSIM_THRESHOLD;

  let sourceImage;
  let outputImage;
  try {
    sourceImage = await imageSource.getPageImage({ format: ctx.from, content: ctx.content, pageIndex: 0 });
    outputImage = await imageSource.getPageImage({ format: ctx.to, content: output?.data, pageIndex: 0 });
  } catch (error) {
    const cause = error?.code || error?.message || "unknown";
    const reason = cause === "VERIFICATION_IMAGE_SOURCE_UNAVAILABLE" ? "image-source-unavailable" : `image-source-failed:${cause}`;
    return {
      eligible: false,
      reason,
      ssim: null,
      warnings: cause === "VERIFICATION_IMAGE_SOURCE_UNAVAILABLE"
        ? []
        : [createWarning("info", SSIM_SOURCE_UNAVAILABLE, `SSIM 视觉对比跳过：${reason}.`, { from: ctx.from, to: ctx.to, cause })],
      runtimeMs: nowMs() - start,
    };
  }

  const comparison = compareImages(sourceImage, outputImage, ctx?.options?.verification || {});
  const passed = comparison.score >= threshold;
  const ssim = {
    score: comparison.score,
    threshold,
    passed,
    width: comparison.width,
    height: comparison.height,
    pageIndex: 0,
    sourceFormat: ctx.from,
    outputFormat: ctx.to,
    dimensionsMatched: comparison.dimensionsMatched,
  };
  const warnings = passed
    ? []
    : [createWarning(
      "info",
      SSIM_VISUAL_DRIFT,
      `SSIM 视觉对比 ${ctx.from} → ${ctx.to} 低于阈值（score ${comparison.score.toFixed(3)} < ${threshold}）。`,
      { from: ctx.from, to: ctx.to, score: comparison.score, threshold },
    )];

  return {
    eligible: true,
    reason: "completed",
    ssim,
    warnings,
    runtimeMs: nowMs() - start,
  };
}

// 异步编排：同步 rule-diff 基底 + 异步 SSIM 视觉回环 + 异步 OCR 回读，合并为统一 envelope。
export async function runVerificationStageAsync({ model, output, ctx, imageSource, ocrEngine, ocrRasterizer } = {}) {
  const base = runVerificationStage({ model, output, ctx });
  const ssimLayer = await runSsimLayer({ ctx, output, imageSource });

  let ocrLayer = { eligible: false, reason: "ocr-readback-not-loaded", ocrReadback: null, warnings: [], runtimeMs: 0 };
  try {
    const mod = await import("./ocr-readback.js");
    ocrLayer = await mod.runOcrReadbackLayer({ model, output, ctx, engine: ocrEngine, rasterizer: ocrRasterizer });
  } catch (error) {
    ocrLayer = { eligible: false, reason: `ocr-readback-load-failed:${error?.code || error?.message || "unknown"}`, ocrReadback: null, warnings: [], runtimeMs: 0 };
  }

  const layers = [...base.layers];
  const skipped = base.skipped.filter((entry) => !["ssim", "ocr-readback"].includes(entry.layer));
  if (ssimLayer.eligible) {
    layers.push("ssim");
  } else {
    skipped.push({ layer: "ssim", reason: ssimLayer.reason });
  }
  if (ocrLayer.eligible) {
    layers.push("ocr-readback");
  } else {
    skipped.push({ layer: "ocr-readback", reason: ocrLayer.reason });
  }

  const eligible = base.eligible || ssimLayer.eligible || ocrLayer.eligible;

  return {
    eligible,
    reason: eligible ? "completed" : base.reason,
    layers,
    skipped,
    ruleDiff: base.ruleDiff,
    ssim: ssimLayer.ssim,
    ocrReadback: ocrLayer.ocrReadback,
    warnings: [...base.warnings, ...ssimLayer.warnings, ...ocrLayer.warnings],
    runtimeMs: base.runtimeMs + ssimLayer.runtimeMs + ocrLayer.runtimeMs,
  };
}
