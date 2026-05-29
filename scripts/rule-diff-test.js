import assert from "node:assert/strict";

import {
  convertContent,
  diffSemanticDocs,
  runVerificationStage,
  blockFingerprint,
  modelFingerprint,
  ROUND_TRIP_FORMATS,
  RULE_DIFF_DRIFT,
  RULE_DIFF_READBACK_FAILED,
} from "../public/browser-transformer.js";

function block(overrides = {}) {
  return {
    id: overrides.id,
    type: "paragraph",
    text: "Hello world",
    warnings: [],
    sourceSpan: { startLine: null, endLine: null, startOffset: null, endOffset: null },
    ...overrides,
  };
}

function model(blocks) {
  return {
    schemaVersion: "trans2former.document.v1",
    title: "diff-test",
    sourceFormat: "md",
    blocks,
    assets: [],
    metadata: { warnings: [], qualityReport: {} },
  };
}

// Reference implementation of the legacy fingerprint, kept for byte-level equivalence check.
function legacyBlockFingerprint(b) {
  if (!b || typeof b !== "object") return "";
  if (b.type === "heading") return `h${b.level}|${b.text || ""}`;
  if (b.type === "paragraph" || b.type === "quote") return `${b.type}|${b.text || ""}`;
  if (b.type === "code") return `code|${b.language || ""}|${b.code || ""}`;
  if (b.type === "list") return `list|${b.ordered ? "ol" : "ul"}|${(b.items || []).join("")}`;
  if (b.type === "table") {
    return `table|${(b.headers || []).join("")}|${(b.rows || []).map((row) => (row || []).join("")).join("")}`;
  }
  if (b.type === "image" || b.type === "asset") {
    return `${b.type}|${b.src || ""}|${b.alt || ""}|${b.assetId || ""}`;
  }
  if (b.type === "raw") return `raw|${b.format || ""}|${b.content || ""}`;
  return b.type || "";
}

// 1. Identical models → exact / score 1
{
  const original = model([block({ id: "b1" }), block({ id: "b2", type: "heading", level: 1, text: "Title" })]);
  const readBack = model([block({ id: "b1" }), block({ id: "b2", type: "heading", level: 1, text: "Title" })]);
  const diff = diffSemanticDocs(original, readBack);
  assert.equal(diff.identical, true);
  assert.equal(diff.fidelity, "exact");
  assert.equal(diff.overallScore, 1);
  assert.equal(diff.changedBlocks.length, 0);
  assert.equal(diff.addedBlocks.length, 0);
  assert.equal(diff.removedBlocks.length, 0);
}

// 2. Whitespace/punct-only text delta → minor-drift, severity minor
{
  const original = model([block({ id: "b1", text: "Hello, world!" })]);
  const readBack = model([block({ id: "b1", text: "Hello world" })]);
  const diff = diffSemanticDocs(original, readBack);
  assert.equal(diff.fidelity, "minor-drift");
  assert.equal(diff.changedBlocks.length, 1);
  assert.deepEqual(diff.changedBlocks[0].fieldsDiffered.map((f) => f.field), ["text"]);
  assert.equal(diff.changedBlocks[0].severity, "minor");
}

// 2b. Substantive text change → major (text field semantic change)
{
  const original = model([block({ id: "b1", text: "The quick brown fox" })]);
  const readBack = model([block({ id: "b1", text: "Totally different sentence here" })]);
  const diff = diffSemanticDocs(original, readBack);
  assert.equal(diff.changedBlocks[0].severity, "major");
  assert.equal(diff.fidelity, "major-drift");
}

// 3. Heading level change → major-drift
{
  const original = model([block({ id: "h", type: "heading", level: 1, text: "Same" })]);
  const readBack = model([block({ id: "h", type: "heading", level: 2, text: "Same" })]);
  const diff = diffSemanticDocs(original, readBack);
  assert.equal(diff.fidelity, "major-drift");
  assert.ok(diff.changedBlocks[0].fieldsDiffered.some((f) => f.field === "level" && f.severity === "major"));
}

// 4. Missing + extra block, >30% structural delta → broken
{
  const original = model([
    block({ id: "a", text: "alpha" }),
    block({ id: "b", text: "beta" }),
  ]);
  const readBack = model([
    block({ id: "a", text: "alpha" }),
    block({ id: "c", text: "gamma" }),
  ]);
  const diff = diffSemanticDocs(original, readBack);
  assert.equal(diff.removedBlocks.length, 1);
  assert.equal(diff.addedBlocks.length, 1);
  assert.equal(diff.removedBlocks[0].id, "b");
  assert.equal(diff.addedBlocks[0].id, "c");
  assert.equal(diff.fidelity, "broken");
}

// 5. runVerificationStage with mock ctx.read returning identical model → ruleDiff.identical, no warnings
{
  const original = model([block({ id: "b1", text: "stable" })]);
  const ctx = {
    from: "md",
    to: "md",
    read: () => model([block({ id: "b1", text: "stable" })]),
  };
  const result = runVerificationStage({ model: original, output: { type: "text", format: "md", data: "stable" }, ctx });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.layers, ["rule-diff"]);
  assert.equal(result.ruleDiff.identical, true);
  assert.equal(result.warnings.length, 0);
}

// 6. runVerificationStage with ctx.read throwing → RULE_DIFF_READBACK_FAILED warning, no throw
{
  const original = model([block({ id: "b1" })]);
  const ctx = {
    from: "md",
    to: "md",
    read: () => { throw new Error("boom"); },
  };
  const result = runVerificationStage({ model: original, output: { type: "text", format: "md", data: "x" }, ctx });
  assert.equal(result.eligible, true);
  assert.equal(result.ruleDiff, null);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, RULE_DIFF_READBACK_FAILED);
}

// 7. runVerificationStage not eligible for non-text-canonical writer
{
  const original = model([block({ id: "b1" })]);
  const ctx = {
    from: "md",
    to: "pptx",
    read: () => original,
  };
  const result = runVerificationStage({ model: original, output: { type: "binary", format: "pptx", data: "<bin>" }, ctx });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "writer-not-text-canonical");
  assert.deepEqual(result.layers, []);
  assert.equal(result.ruleDiff, null);
  assert.equal(result.skipped[0].layer, "rule-diff");
  assert.equal(ROUND_TRIP_FORMATS.has("pptx"), false);
}

// 8. End-to-end md -> md → ruleDiff.identical, verification.layers
{
  const result = convertContent({ content: "# Title\n\nBody text.", from: "md", to: "md", title: "e2e.md" });
  assert.equal(result.quality.qualityReport.ruleDiff.identical, true);
  assert.deepEqual(result.quality.qualityReport.verification.layers, ["rule-diff"]);
  assert.equal(result.quality.qualityReport.verification.eligible, true);
}

// 9. End-to-end md -> html cross-format loopback runs, ruleDiff non-null
{
  const result = convertContent({ content: "# A\n\nB", from: "md", to: "html", title: "e2e.html" });
  assert.equal(result.quality.qualityReport.verification.eligible, true);
  assert.notEqual(result.quality.qualityReport.ruleDiff, null);
  assert.deepEqual(result.quality.qualityReport.verification.layers, ["rule-diff"]);
}

// 10. End-to-end md -> pdf not eligible + shared fingerprint byte-equivalence
{
  const result = convertContent({ content: "# Hi", from: "md", to: "pdf", title: "e2e.pdf" });
  assert.equal(result.quality.qualityReport.ruleDiff, null);
  assert.equal(result.quality.qualityReport.verification.eligible, false);
  assert.equal(result.quality.qualityReport.verification.skipped[0].reason, "writer-not-text-canonical");

  // shared fingerprint must match legacy implementation byte-for-byte
  const samples = [
    block({ id: "p", text: "para" }),
    block({ id: "h", type: "heading", level: 3, text: "Head" }),
    { type: "code", language: "js", code: "x=1" },
    { type: "list", ordered: true, items: ["one", "two"] },
    { type: "table", headers: ["a", "b"], rows: [["1", "2"], ["3", "4"]] },
    { type: "image", src: "i.png", alt: "img" },
    { type: "raw", format: "html", content: "<b>x</b>" },
  ];
  for (const sample of samples) {
    assert.equal(blockFingerprint(sample), legacyBlockFingerprint(sample), `fingerprint drift for ${sample.type}`);
  }
  const m = model(samples);
  assert.equal(modelFingerprint(m), samples.map(legacyBlockFingerprint).join(""));
  assert.equal(typeof RULE_DIFF_DRIFT, "string");
}

console.log("Rule diff test passed: diffSemanticDocs units, verification-stage gating/readback, end-to-end md->md/html/pdf, fingerprint equivalence covered.");
