import assert from "node:assert/strict";

import {
  compareText,
  normalizeText,
  extractModelText,
  runOcrReadbackLayer,
  runVerificationStageAsync,
  convertContentAsync,
  OCR_READBACK_DRIFT,
  DEFAULT_OCR_READBACK_THRESHOLD,
} from "../public/browser-transformer.js";

function stubEngine(fullText, { available = true, averageConfidence = 0.9 } = {}) {
  return {
    id: "stub-ocr",
    taskCapabilities: ["ocr-text"],
    isAvailable: () => available,
    recognize: async () => ({ fullText, averageConfidence, pages: [] }),
  };
}

function stubRasterizer({ throwCode = null } = {}) {
  return {
    async rasterize() {
      if (throwCode) {
        const error = new Error("stub rasterizer failure");
        error.code = throwCode;
        throw error;
      }
      return { dataUrl: "data:image/png;base64,AAAA", width: 16, height: 16 };
    },
    async countPages() { return 1; },
  };
}

function model(blocks) {
  return {
    schemaVersion: "trans2former.document.v1",
    title: "ocr-readback",
    sourceFormat: "md",
    blocks,
    assets: [],
    metadata: { warnings: [], qualityReport: {} },
  };
}

// 1. compareText identical -> all 1
{
  const r = compareText("Hello World", "Hello World");
  assert.equal(r.recall, 1);
  assert.equal(r.precision, 1);
  assert.equal(r.f1, 1);
}

// 1b. compareText uses code point lengths for astral characters
{
  const r = compareText("😀😀", "😀😀");
  assert.equal(r.recall, 1);
  assert.equal(r.precision, 1);
  assert.equal(r.f1, 1);
  assert.equal(r.originalLength, 2);
  assert.equal(r.recognizedLength, 2);
}

// 2. compareText subset -> recall < 1, precision = 1
{
  const r = compareText("Hello World", "Hello");
  assert.ok(r.recall < 1, "recall should drop when text missing");
  assert.equal(r.precision, 1);
  assert.ok(r.f1 < 1 && r.f1 > 0);
}

// 3. compareText CJK (char-level multiset works without spaces)
{
  const r = compareText("你好世界", "你好世");
  assert.equal(r.recall, 0.75);
  assert.equal(r.precision, 1);
}

// 4. compareText empty original + empty recognized -> 1; empty original + text -> precision 0
{
  assert.equal(compareText("", "").f1, 1);
  const r = compareText("", "noise");
  assert.equal(r.precision, 0);
}

// 5. normalizeText strips whitespace + lowercases
{
  assert.equal(normalizeText("  He llo\nWORLD "), "helloworld");
}

// 6. extractModelText joins block text incl. list/table
{
  const text = extractModelText(model([
    { type: "heading", text: "Title" },
    { type: "paragraph", text: "Body" },
    { type: "list", ordered: false, items: ["a", "b"] },
    { type: "table", headers: ["h1"], rows: [["c1"]] },
  ]));
  assert.ok(text.includes("Title") && text.includes("Body") && text.includes("a") && text.includes("c1"));
}

// 7. runOcrReadbackLayer happy path with stub engine + rasterizer
{
  const layer = await runOcrReadbackLayer({
    model: model([{ type: "heading", text: "Title" }, { type: "paragraph", text: "Body" }]),
    output: { data: "<pdf>" },
    ctx: { from: "md", to: "pdf", options: {} },
    engine: stubEngine("Title Body"),
    rasterizer: stubRasterizer(),
  });
  assert.equal(layer.eligible, true);
  assert.equal(layer.ocrReadback.passed, true);
  assert.equal(layer.ocrReadback.engineId, "stub-ocr");
  assert.ok(layer.ocrReadback.f1 >= DEFAULT_OCR_READBACK_THRESHOLD);
}

// 8. runOcrReadbackLayer drift -> OCR_READBACK_DRIFT warning
{
  const layer = await runOcrReadbackLayer({
    model: model([{ type: "paragraph", text: "The quick brown fox jumps over the lazy dog" }]),
    output: { data: "<pdf>" },
    ctx: { from: "md", to: "pdf", options: {} },
    engine: stubEngine("zzzzz"),
    rasterizer: stubRasterizer(),
  });
  assert.equal(layer.eligible, true);
  assert.equal(layer.ocrReadback.passed, false);
  assert.equal(layer.warnings[0].code, OCR_READBACK_DRIFT);
}

// 9. not eligible: non-pdf output
{
  const layer = await runOcrReadbackLayer({
    model: model([{ type: "paragraph", text: "x" }]),
    output: { data: "text" },
    ctx: { from: "md", to: "md", options: {} },
    engine: stubEngine("x"),
    rasterizer: stubRasterizer(),
  });
  assert.equal(layer.eligible, false);
  assert.equal(layer.reason, "output-not-rasterizable-for-ocr");
}

// 10. not eligible: engine unavailable (via registry returning null)
{
  const layer = await runOcrReadbackLayer({
    model: model([{ type: "paragraph", text: "x" }]),
    output: { data: "<pdf>" },
    ctx: { from: "md", to: "pdf", options: {} },
    engine: null,
    registry: { pickForTask: () => null },
    rasterizer: stubRasterizer(),
  });
  assert.equal(layer.eligible, false);
  assert.equal(layer.reason, "ocr-engine-unavailable");
}

// 11. rasterizer unavailable -> reason rasterizer-unavailable (no throw)
{
  const layer = await runOcrReadbackLayer({
    model: model([{ type: "paragraph", text: "x" }]),
    output: { data: "<pdf>" },
    ctx: { from: "md", to: "pdf", options: {} },
    engine: stubEngine("x"),
    rasterizer: stubRasterizer({ throwCode: "OCR_RASTERIZER_UNAVAILABLE" }),
  });
  assert.equal(layer.eligible, false);
  assert.equal(layer.reason, "rasterizer-unavailable");
}

// 12. runVerificationStageAsync merges three layers; default (no stub) ocr-readback skipped
{
  const env = await runVerificationStageAsync({
    model: model([{ type: "paragraph", text: "Body" }]),
    output: { data: "<pdf>" },
    ctx: { from: "md", to: "pdf", content: "Body", read: () => model([{ type: "paragraph", text: "Body" }]), options: {} },
  });
  // md->pdf: rule-diff skipped (pdf not text-canonical), ssim skipped (md not rasterizable),
  // ocr-readback skipped in Node (no engine available)
  assert.ok(env.skipped.some((s) => s.layer === "ocr-readback"));
  assert.equal(env.skipped.filter((s) => s.layer === "ssim").length, 1);
  assert.equal(env.skipped.filter((s) => s.layer === "ocr-readback").length, 1);
  assert.ok(env.skipped.some((s) => s.layer === "ssim" && s.reason === "source-not-rasterizable"));
  assert.equal(env.ocrReadback, null);
}

// 13. End-to-end convertContentAsync md->md: ocrReadback null (sync-like text path)
{
  const result = await convertContentAsync({ content: "# Title\n\nBody", from: "md", to: "md", title: "e2e" });
  assert.equal(result.quality.qualityReport.ocrReadback, null);
  assert.equal(result.quality.qualityReport.ruleDiff.identical, true);
}

console.log("OCR readback test passed: compareText (identical/subset/CJK/empty), normalizeText, extractModelText, readback layer gating/drift/unavailable/rasterizer-fail, async three-layer merge, end-to-end null-on-text covered.");
