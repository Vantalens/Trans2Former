import assert from "node:assert/strict";

import {
  convertContent,
  defaultRepairEngine,
  RepairEngine,
  MIN_CONFIDENCE,
  REPAIR_ACTION_TYPES,
  createRepairAction,
  validateRepairAction,
} from "../public/browser-transformer.js";
import { ConversionError } from "../public/core/conversion-error.js";

function buildModel({ text = "Hello old world" } = {}) {
  return {
    schemaVersion: "trans2former.document.v1",
    title: "test",
    sourceFormat: "md",
    blocks: [
      {
        id: "block-1",
        type: "paragraph",
        text,
        warnings: [],
        sourceSpan: { startLine: null, endLine: null, startOffset: null, endOffset: null },
      },
    ],
    assets: [],
    metadata: { warnings: [], qualityReport: {} },
  };
}

function buildCtx(overrides = {}) {
  return {
    content: "Hello old world",
    from: "md",
    to: "md",
    title: "test",
    fileName: "test.md",
    options: {},
    ...overrides,
  };
}

// 1. Action contract
{
  const action = createRepairAction({
    actionType: "replaceTextRun",
    targetId: "block-1",
    before: "old",
    after: "new",
    confidence: 0.9,
    evidence: { source: "unit" },
  });
  assert.equal(action.actionType, "replaceTextRun");
  assert.equal(Object.isFrozen(action), true);

  assert.throws(
    () => createRepairAction({
      actionType: "replaceTextRun",
      before: "a",
      after: "b",
      confidence: 0.9,
      evidence: {},
    }),
    (err) => err instanceof ConversionError && err.code === "REPAIR_ACTION_INVALID",
    "missing targetId must throw REPAIR_ACTION_INVALID",
  );

  assert.throws(
    () => createRepairAction({
      actionType: "unknownAction",
      targetId: "x",
      before: "a",
      after: "b",
      confidence: 0.5,
      evidence: {},
    }),
    (err) => err instanceof ConversionError && err.code === "REPAIR_ACTION_INVALID",
    "unknown actionType must throw REPAIR_ACTION_INVALID",
  );

  assert.throws(
    () => createRepairAction({
      actionType: "replaceTextRun",
      targetId: "x",
      before: "a",
      after: "b",
      confidence: 1.5,
      evidence: {},
    }),
    (err) => err instanceof ConversionError && err.code === "REPAIR_ACTION_INVALID",
    "out-of-range confidence must throw REPAIR_ACTION_INVALID",
  );

  assert.equal(REPAIR_ACTION_TYPES.length, 7);
  assert.equal(REPAIR_ACTION_TYPES.includes("selectFallbackRoute"), true);
  validateRepairAction(action);
}

// 2. RepairEngine register + runCycle unit
{
  const engine = new RepairEngine();
  let validatorCalls = 0;
  let handlerCalls = 0;
  engine.registerValidator(() => {
    validatorCalls += 1;
    return [createRepairAction({
      actionType: "replaceTextRun",
      targetId: "block-1",
      before: "old",
      after: "new",
      confidence: 0.9,
      evidence: { source: "unit" },
      targetField: "text",
    })];
  });
  engine.registerHandler("replaceTextRun", ({ model, action }) => {
    handlerCalls += 1;
    const next = JSON.parse(JSON.stringify(model));
    const block = next.blocks.find((b) => b.id === action.targetId);
    block.text = block.text.split(action.before).join(action.after);
    return { ok: true, model: next, note: "applied" };
  });

  const result = engine.runCycle({
    model: buildModel(),
    output: { type: "text", format: "md", data: "Hello old world" },
    ctx: buildCtx(),
  });
  assert.equal(validatorCalls, 1);
  assert.equal(handlerCalls, 1);
  assert.equal(result.autoRepair.attempted, true);
  assert.equal(result.autoRepair.appliedActions.length, 1);
  assert.equal(result.autoRepair.rejectedActions.length, 0);
  assert.equal(result.autoRepair.finalDecision, "verified");
  assert.equal(result.model.blocks[0].text, "Hello new world");
}

// 3. Low-confidence action rejected
{
  const engine = new RepairEngine();
  engine.registerValidator(() => [createRepairAction({
    actionType: "replaceTextRun",
    targetId: "block-1",
    before: "x",
    after: "y",
    confidence: MIN_CONFIDENCE - 0.1,
    evidence: { source: "unit" },
    targetField: "text",
  })]);
  engine.registerHandler("replaceTextRun", () => {
    throw new Error("handler should not be called for low-confidence action");
  });
  const result = engine.runCycle({
    model: buildModel(),
    output: { type: "text", format: "md", data: "Hello old world" },
    ctx: buildCtx(),
  });
  assert.equal(result.autoRepair.appliedActions.length, 0);
  assert.equal(result.autoRepair.rejectedActions.length, 1);
  assert.equal(result.autoRepair.rejectedActions[0].note, "below-min-confidence");
  assert.equal(result.autoRepair.finalDecision, "degraded");
}

// 4. Handler throwing is caught and recorded as rejected
{
  const engine = new RepairEngine();
  engine.registerValidator(() => [createRepairAction({
    actionType: "replaceTextRun",
    targetId: "block-1",
    before: "old",
    after: "new",
    confidence: 0.9,
    evidence: { source: "unit" },
    targetField: "text",
  })]);
  engine.registerHandler("replaceTextRun", () => {
    const error = new ConversionError("intentional failure", { category: "validate", code: "REPAIR_FAKE_FAILURE" });
    throw error;
  });
  const result = engine.runCycle({
    model: buildModel(),
    output: { type: "text", format: "md", data: "Hello old world" },
    ctx: buildCtx(),
  });
  assert.equal(result.autoRepair.appliedActions.length, 0);
  assert.equal(result.autoRepair.rejectedActions.length, 1);
  assert.equal(
    result.autoRepair.rejectedActions[0].note.startsWith("handler-error:"),
    true,
    `expected handler-error note, got ${result.autoRepair.rejectedActions[0].note}`,
  );
  assert.equal(result.autoRepair.finalDecision, "degraded");
}

// 5. Default engine has all 7 action handlers registered
{
  for (const actionType of REPAIR_ACTION_TYPES) {
    assert.equal(
      defaultRepairEngine.hasHandler(actionType),
      true,
      `default engine missing handler for ${actionType}`,
    );
  }
}

// 6. End-to-end: md -> md round-trip via convertContent
{
  const md = "# Title\n\nHello world.\n";
  const result = convertContent({ content: md, from: "md", to: "md", title: "rt.md" });
  assert.equal(result.format, "md");
  assert.equal(typeof result.data, "string");
  assert.ok(result.quality, "convertContent should expose quality summary");
  assert.equal(result.quality.autoRepair.attempted, false);
  assert.equal(result.quality.autoRepair.finalDecision, "verified");
  assert.equal(result.quality.autoRepair.roundTripDelta.ok, true);
  assert.equal(result.quality.qualityReport.repairStatus, "not-attempted");
  assert.equal(result.quality.qualityReport.finalDecision, "verified");
  assert.equal(result.quality.modelReview.engine, "rule-based");
  assert.equal(typeof result.quality.modelReview.runtimeMs, "number");
  assert.ok(result.quality.modelReview.runtimeMs >= 0);
  assert.ok(result.quality.modelReview.tasks.includes("lossy-warning-scan"));
  assert.ok(result.quality.modelReview.tasks.includes("route-class-check"));
  assert.ok(result.quality.modelReview.tasks.includes("ocr-low-confidence-scan"));
}

// 7. End-to-end: md -> html skips round-trip and exposes skip reason
{
  const md = "# Heading\n\nParagraph.";
  const result = convertContent({ content: md, from: "md", to: "html", title: "rt.html" });
  assert.equal(result.quality.autoRepair.roundTripDelta.ok, null);
  assert.equal(result.quality.autoRepair.roundTripDelta.skipped, "format-not-round-trip-safe");
}

// 8. End-to-end: md -> pptx (generated) records fallback recommendation
{
  const md = "# Slide A\n\n- one\n- two\n\n# Slide B\n\nBody.";
  const result = convertContent({ content: md, from: "md", to: "pptx", title: "slides" });
  assert.equal(result.format, "pptx");
  assert.equal(result.quality.autoRepair.attempted, true);
  assert.equal(result.quality.autoRepair.fallbackUsed, false);
  assert.equal(
    result.quality.autoRepair.recommendations.length >= 1,
    true,
    "md -> pptx should produce at least one fallback recommendation",
  );
  const recommendation = result.quality.autoRepair.recommendations.find((entry) => entry.actionType === "selectFallbackRoute");
  assert.ok(recommendation, "expected a selectFallbackRoute recommendation in md -> pptx");
  assert.notEqual(recommendation.fallbackTo, "pptx");
}

// 9. End-to-end: md -> pptx with applyFallback=true switches output to safer format
{
  const md = "# Slide A\n\nbody";
  const fallback = convertContent({
    content: md,
    from: "md",
    to: "pptx",
    title: "slides",
    options: { repair: { applyFallback: true } },
  });
  assert.equal(fallback.quality.autoRepair.fallbackUsed, true);
  assert.ok(fallback.quality.autoRepair.fallbackTo, "fallbackTo should be populated");
  assert.notEqual(fallback.quality.autoRepair.fallbackTo, "pptx");
  assert.equal(fallback.format !== "pptx", true, "applied fallback should change the writer format");
}

// 10. options.repair === false short-circuits the cycle and preserves legacy shape
{
  const md = "# Title\n";
  const result = convertContent({ content: md, from: "md", to: "md", title: "legacy", options: { repair: false } });
  assert.equal(result.quality, undefined);
  assert.equal(result.format, "md");
}

// 11. Fallback handler failure is captured as a rejected action
{
  const engine = new RepairEngine();
  engine.registerValidator(() => [createRepairAction({
    actionType: "selectFallbackRoute",
    targetId: "route:md->pptx",
    before: { to: "pptx" },
    after: { to: "md" },
    confidence: 0.9,
    evidence: { source: "unit" },
    fallback: { to: "md" },
  })]);
  engine.registerHandler("selectFallbackRoute", () => ({
    ok: false,
    model: null,
    note: "fallback-route-failed:CONTEXT_MISSING",
  }));
  const result = engine.runCycle({
    model: buildModel(),
    output: { type: "text", format: "pptx", data: "<binary>" },
    ctx: buildCtx({ from: "md", to: "pptx" }),
  });
  assert.equal(result.autoRepair.appliedActions.length, 0);
  assert.equal(result.autoRepair.rejectedActions.length, 1);
  assert.equal(
    result.autoRepair.rejectedActions[0].note.startsWith("fallback-route-failed"),
    true,
  );
  assert.equal(result.autoRepair.finalDecision, "degraded");
}

console.log("Repair engine test passed: contract, engine unit, round-trip, fallback recommendation and apply paths covered.");
