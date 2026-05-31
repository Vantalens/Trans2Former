import assert from "node:assert/strict";

import { readFile } from "node:fs/promises";

import {
  OCR_RESULT_SCHEMA_VERSION,
  OCR_LANGUAGES,
  createOCRResult,
  validateOCRResult,
  summarizeOCRResult,
  OCREngineRegistry,
  defaultOCRRegistry,
  placeholderOCREngine,
  PLACEHOLDER_OCR_MANIFEST_ID,
  OCR_UNAVAILABLE,
  OCR_WARNING_CODES,
  createOCRUnavailableWarning,
  createOCREngineFailedWarning,
  createOCRLowConfidenceWarning,
  createOCRDegradedRouteWarning,
  ensureOCRBootstrap,
  ensureTesseractBootstrap,
  tesseractOCREngine,
  TESSERACT_MANIFEST_ID,
  markTesseractVendorReady,
  InMemoryStorage,
  defaultOCRStorage,
  defaultModelCache,
  STATUS_DISABLED,
  STATUS_NOT_DOWNLOADED,
  toDocumentModel,
  enhanceWithOCR,
  loadTesseractRuntime,
  OCR_VENDOR_LOAD_FAILED,
  sha256Hex,
  convertContentAsync,
  runOCRStage,
  detectOCRLowConfidence,
  defaultRepairEngine,
  isScannedPdf,
  runScannedPdfOCRStage,
  defaultPdfPageRasterizer,
  setPdfPageRasterizer,
  resetPdfPageRasterizer,
  OCR_RASTERIZER_UNAVAILABLE,
  ocrResultToFixedLayoutPage,
  mergeOCRResultsToFixedLayout,
  READING_ORDER_HEURISTIC,
  MODEL_VISUAL_FIDELITY_LOST,
  MODEL_TEXT_ORDER_HEURISTIC,
  getFixedLayoutSummary,
  fixedLayoutToSemantic,
  paddleOcrEngine,
  PADDLE_OCR_MANIFEST_ID,
  markPaddleOcrVendorReady,
  ensurePaddleOcrBootstrap,
  loadOnnxRuntime,
  pickExecutionProviders,
  PADDLE_VENDOR_PATHS,
} from "../public/browser-transformer.js";
import { ConversionError } from "../public/core/conversion-error.js";

function baseOCRResult(overrides = {}) {
  return {
    language: "zh-CN",
    pages: [
      {
        pageIndex: 0,
        width: 1024,
        height: 768,
        lines: [
          { text: "Hello", confidence: 0.91, bbox: { x: 10, y: 10, w: 80, h: 16 } },
          { text: "World", confidence: 0.88, bbox: { x: 100, y: 10, w: 80, h: 16 } },
        ],
      },
    ],
    fullText: "Hello\nWorld",
    averageConfidence: 0.9,
    runtimeMs: 124,
    engine: "stub",
    modelVersion: "0.0.1",
    warnings: [],
    ...overrides,
  };
}

function makeStubEngine(overrides = {}) {
  return {
    id: overrides.id || "stub-engine",
    taskCapabilities: overrides.taskCapabilities || ["ocr-text"],
    manifestId: overrides.manifestId || "ocr-text.stub.0.0.1",
    isAvailable: overrides.isAvailable || (() => true),
    recognize: overrides.recognize || (async () => createOCRResult(baseOCRResult())),
  };
}

// 1. Schema constants
{
  assert.equal(OCR_RESULT_SCHEMA_VERSION, "trans2former.ocr-result.v1");
  assert.equal(OCR_LANGUAGES.includes("zh-CN"), true);
  assert.equal(OCR_LANGUAGES.includes("auto"), true);
  assert.equal(OCR_WARNING_CODES.includes(OCR_UNAVAILABLE), true);
  assert.equal(OCR_WARNING_CODES.length, 4);
}

// 2. createOCRResult + validate happy path
{
  const result = createOCRResult(baseOCRResult());
  assert.equal(result.schemaVersion, OCR_RESULT_SCHEMA_VERSION);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.pages), true);
  validateOCRResult(result);
  const summary = summarizeOCRResult(result);
  assert.equal(summary.pageCount, 1);
  assert.equal(summary.lineCount, 2);
  assert.equal(summary.averageConfidence, 0.9);
  assert.equal(summary.fullTextLength, "Hello\nWorld".length);
  assert.equal(summary.engine, "stub");
}

// 3. validateOCRResult rejects malformed inputs
{
  const cases = [
    [{ language: "fr" }, "unknown-language"],
    [{ pages: "not-array" }, "invalid-pages"],
    [{ averageConfidence: 1.5 }, "invalid-average-confidence"],
    [{ averageConfidence: -0.1 }, "invalid-average-confidence"],
    [{ runtimeMs: -1 }, "invalid-runtime"],
  ];
  for (const [overrides, expectedReason] of cases) {
    assert.throws(
      () => createOCRResult(baseOCRResult(overrides)),
      (err) =>
        err instanceof ConversionError
        && err.code === "OCR_RESULT_INVALID"
        && err.details?.reason === expectedReason,
      `expected ${expectedReason} to throw OCR_RESULT_INVALID with that reason`,
    );
  }
  // Page geometry guard
  assert.throws(
    () => createOCRResult(baseOCRResult({ pages: [{ pageIndex: -1, width: 0, height: 0, lines: [] }] })),
    (err) => err instanceof ConversionError && err.code === "OCR_RESULT_INVALID" && err.details?.reason === "invalid-page-geometry",
  );
  // Line confidence guard
  assert.throws(
    () => createOCRResult(baseOCRResult({
      pages: [{ pageIndex: 0, width: 1, height: 1, lines: [{ text: "x", confidence: 2, bbox: null }] }],
    })),
    (err) => err instanceof ConversionError && err.code === "OCR_RESULT_INVALID" && err.details?.reason === "invalid-line-confidence",
  );
}

// 4. Warning factories
{
  const unavailable = createOCRUnavailableWarning({ engineId: "placeholder" });
  assert.equal(unavailable.code, OCR_UNAVAILABLE);
  assert.equal(unavailable.severity, "info");

  const failed = createOCREngineFailedWarning({ engineId: "stub", reason: "timeout" });
  assert.equal(failed.severity, "lossy");

  const lowConf = createOCRLowConfidenceWarning({ averageConfidence: 0.42 });
  assert.equal(lowConf.code, "OCR_LOW_CONFIDENCE");

  const degraded = createOCRDegradedRouteWarning();
  assert.equal(degraded.code, "OCR_DEGRADED_ROUTE");
}

// 5. OCREngineRegistry register + reject malformed + duplicate
{
  const registry = new OCREngineRegistry();
  const stub = makeStubEngine({ isAvailable: () => false });
  registry.register(stub);
  assert.equal(registry.has(stub.id), true);
  assert.equal(registry.list().length, 1);

  assert.throws(
    () => registry.register(stub),
    (err) => err instanceof ConversionError && err.code === "OCR_ENGINE_DUPLICATE",
  );

  for (const invalid of [{}, { id: "" }, { id: "x", taskCapabilities: [] }, { id: "x", taskCapabilities: ["a"], isAvailable: "no" }]) {
    assert.throws(
      () => registry.register(invalid),
      (err) => err instanceof ConversionError && err.code === "OCR_ENGINE_INVALID",
      `expected ${JSON.stringify(invalid)} to throw OCR_ENGINE_INVALID`,
    );
  }
}

// 6. pickForTask prefers available engine
{
  const registry = new OCREngineRegistry();
  const unavailable = makeStubEngine({ id: "a", isAvailable: () => false });
  const available = makeStubEngine({ id: "b", isAvailable: () => true });
  registry.register(unavailable);
  registry.register(available);
  assert.equal(registry.pickForTask("ocr-text").id, "b");
  // remove available, should fall back to last candidate (unavailable)
  registry.unregister("b");
  assert.equal(registry.pickForTask("ocr-text").id, "a");
}

// 7. placeholderOCREngine contract
{
  assert.equal(placeholderOCREngine.id, "placeholder");
  assert.equal(placeholderOCREngine.taskCapabilities.includes("ocr-text"), true);
  assert.equal(placeholderOCREngine.isAvailable(), false);
  await assert.rejects(
    () => placeholderOCREngine.recognize({ image: null }),
    (err) => err instanceof ConversionError && err.code === OCR_UNAVAILABLE,
  );
}

// 8. Bootstrap idempotent + manifest registered as disabled
{
  ensureOCRBootstrap();
  ensureOCRBootstrap();
  const status = defaultModelCache.getStatus(PLACEHOLDER_OCR_MANIFEST_ID);
  assert.ok(status, "placeholder manifest should be registered after bootstrap");
  assert.equal(status.status, STATUS_DISABLED);
  assert.equal(defaultOCRRegistry.has(placeholderOCREngine.id), true);
  // After tesseract-bootstrap.js side-effect import, both placeholder + tesseract are
  // registered. With both isAvailable()=false, pickForTask falls back to the last
  // registered engine. Both ids are acceptable here.
  const picked = defaultOCRRegistry.pickForTask("ocr-text");
  assert.ok(picked, "pickForTask should return a fallback engine");
  assert.equal(
    ["placeholder", "tesseract-zh-en", "paddleocr-v5"].includes(picked.id),
    true,
    `pickForTask returned unexpected engine: ${picked.id}`,
  );
}

// 9. PNG reader emits OCR_UNAVAILABLE warning when no real engine is enabled
{
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const model = toDocumentModel(tinyPng, "png", "ocr-baseline-test.png");
  const warnings = model.metadata?.warnings || [];
  const ocrWarning = warnings.find((w) => w.code === OCR_UNAVAILABLE);
  assert.ok(ocrWarning, "PNG reader should attach OCR_UNAVAILABLE warning");
  assert.equal(ocrWarning.severity, "info");
  assert.equal(
    ["placeholder", "tesseract-zh-en", "paddleocr-v5"].includes(ocrWarning.details?.engineId),
    true,
    `expected engineId to be placeholder/tesseract/paddle, got ${ocrWarning.details?.engineId}`,
  );
}

// 10. After swapping default engine to an available stub, PNG reader should NOT emit OCR_UNAVAILABLE
{
  const stub = makeStubEngine({ id: "stub-available-temp", isAvailable: () => true });
  defaultOCRRegistry.register(stub);
  try {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
    const model = toDocumentModel(tinyPng, "png", "ocr-baseline-test.png");
    const warnings = model.metadata?.warnings || [];
    const ocrWarning = warnings.find((w) => w.code === OCR_UNAVAILABLE);
    assert.equal(ocrWarning, undefined, "PNG reader should not emit OCR_UNAVAILABLE when an available engine exists");
  } finally {
    defaultOCRRegistry.unregister(stub.id);
  }
}

// 11. TesseractEngine bootstrap registers manifest + engine but stays unavailable
{
  ensureTesseractBootstrap();
  ensureTesseractBootstrap();
  assert.equal(defaultOCRRegistry.has(tesseractOCREngine.id), true, "tesseract engine should be registered after bootstrap");
  assert.equal(tesseractOCREngine.id, "tesseract-zh-en");
  assert.equal(tesseractOCREngine.taskCapabilities.includes("ocr-text"), true);
  assert.equal(tesseractOCREngine.isAvailable(), false, "tesseract engine should report unavailable until P9-A.2.b wires tessdata");

  const status = defaultModelCache.getStatus(TESSERACT_MANIFEST_ID);
  assert.ok(status, "tesseract manifest should be registered in defaultModelCache");
  assert.equal(status.status, STATUS_NOT_DOWNLOADED);

  // ensureProbe must not throw on the frozen engine (readiness lives in module state,
  // not a frozen instance prop) — otherwise the security-center import flow fails silently.
  markTesseractVendorReady(true);
  await assert.doesNotReject(() => tesseractOCREngine.ensureProbe(), "tesseract.ensureProbe must not throw on frozen engine");
  markTesseractVendorReady(false);
  assert.equal(await tesseractOCREngine.ensureProbe(), false);
}

// 12. tesseractOCREngine.recognize rejects with OCR_UNAVAILABLE/OCR_ENGINE_FAILED depending on stage
{
  // vendor not ready, tessdata missing => OCR_UNAVAILABLE
  markTesseractVendorReady(false);
  await assert.rejects(
    () => tesseractOCREngine.recognize({ image: { width: 10, height: 10 } }),
    (err) => err instanceof ConversionError && err.code === OCR_UNAVAILABLE && err.details?.reason === "vendor-not-ready",
  );

  // vendor ready but tessdata still missing => OCR_UNAVAILABLE with tessdata-missing
  markTesseractVendorReady(true);
  try {
    await assert.rejects(
      () => tesseractOCREngine.recognize({ image: { width: 10, height: 10 } }),
      (err) => err instanceof ConversionError && err.code === OCR_UNAVAILABLE && err.details?.reason === "tessdata-missing",
    );

    // Simulate tessdata import; recognize now invokes loadTesseractRuntime which
    // fails in Node because /vendor/tesseract/* is not resolvable as an ES module.
    await tesseractOCREngine._storage.put(
      "tesseract/chi_sim.traineddata",
      new Uint8Array([1, 2, 3, 4]).buffer,
      { sha256: "deadbeef" },
    );
    try {
      await assert.rejects(
        () => tesseractOCREngine.recognize({ image: { width: 10, height: 10 } }),
        (err) =>
          err instanceof ConversionError
          && err.code === OCR_VENDOR_LOAD_FAILED,
      );
    } finally {
      await tesseractOCREngine._storage.delete("tesseract/chi_sim.traineddata");
    }
  } finally {
    markTesseractVendorReady(false);
  }
}

// 13. InMemoryStorage put/has/get/delete/list contract
{
  const storage = new InMemoryStorage();
  assert.equal(await storage.has("missing"), false);
  await storage.put("a", new Uint8Array([7, 8, 9]).buffer, { sha256: "abc" });
  assert.equal(await storage.has("a"), true);
  const value = await storage.get("a");
  assert.equal(value instanceof ArrayBuffer, true);
  assert.equal(new Uint8Array(value)[1], 8);

  await storage.put("b", new Uint8Array([1]).buffer);
  const list = await storage.list();
  assert.deepEqual(list.map((e) => e.key), ["a", "b"]);
  assert.equal(list[0].sha256, "abc");

  await storage.delete("a");
  assert.equal(await storage.has("a"), false);
  await storage.clear();
  assert.equal((await storage.list()).length, 0);
}

// 14. InMemoryStorage rejects malformed keys / values
{
  const storage = new InMemoryStorage();
  await assert.rejects(
    () => storage.put("", new Uint8Array([1]).buffer),
    (err) => err instanceof ConversionError && err.code === "OCR_STORAGE_INVALID_KEY",
  );
  await assert.rejects(
    () => storage.put("k", "not-a-buffer"),
    (err) => err instanceof ConversionError && err.code === "OCR_STORAGE_INVALID_VALUE",
  );
}

// 15. defaultOCRStorage exists and is InMemoryStorage in Node runtime
{
  assert.ok(defaultOCRStorage);
  assert.equal(typeof defaultOCRStorage.put, "function");
  assert.equal(typeof defaultOCRStorage.list, "function");
}

// 16. loadTesseractRuntime fails with OCR_VENDOR_LOAD_FAILED when vendor missing (Node default)
{
  // Reset cached namespace by reloading the module is heavy; rely on lack of
  // globalThis.Tesseract + missing /vendor file under Node.
  if (!globalThis.Tesseract) {
    await assert.rejects(
      () => loadTesseractRuntime(),
      (err) => err instanceof ConversionError && err.code === OCR_VENDOR_LOAD_FAILED,
    );
  }
}

// 17. enhanceWithOCR returns model with OCR_UNAVAILABLE when no engine available
{
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const model = toDocumentModel(tinyPng, "png", "enhance-no-engine.png");
  const enhanced = await enhanceWithOCR(model);
  const warnings = enhanced.metadata?.warnings || [];
  assert.ok(warnings.find((w) => w.code === OCR_UNAVAILABLE), "enhanceWithOCR should emit OCR_UNAVAILABLE when no engine available");
  assert.equal(enhanced.blocks.length, model.blocks.length, "enhanceWithOCR should not append paragraphs when engine unavailable");
}

// 18. enhanceWithOCR with stub engine appends paragraphs + modelReview metadata
{
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const stubResult = createOCRResult({
    language: "zh-CN",
    pages: [
      {
        pageIndex: 0,
        width: 320,
        height: 240,
        lines: [
          { text: "你好", confidence: 0.92, bbox: null },
          { text: "world", confidence: 0.88, bbox: null },
        ],
      },
    ],
    fullText: "你好\nworld",
    averageConfidence: 0.9,
    runtimeMs: 42,
    engine: "stub-enhance",
    modelVersion: "0.0.1",
  });
  const stubEngine = {
    id: "stub-enhance",
    taskCapabilities: ["ocr-text"],
    manifestId: "stub-enhance",
    isAvailable: () => true,
    recognize: async () => stubResult,
  };
  const model = toDocumentModel(tinyPng, "png", "enhance-stub.png");
  const enhanced = await enhanceWithOCR(model, { engine: stubEngine });
  assert.ok(enhanced.blocks.length > model.blocks.length, "enhanceWithOCR should append OCR paragraphs");
  const lastBlock = enhanced.blocks[enhanced.blocks.length - 1];
  assert.equal(lastBlock.type, "paragraph");
  assert.equal(lastBlock.text.includes("你好"), true);
  assert.equal(enhanced.metadata?.modelReview?.engine, "stub-enhance");
  assert.equal(enhanced.metadata?.modelReview?.ocr?.lineCount, 2);
  assert.equal(enhanced.metadata?.modelReview?.tasks.includes("ocr-text-recognition"), true);
}

// 19. enhanceWithOCR low confidence emits OCR_LOW_CONFIDENCE warning
{
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const lowResult = createOCRResult({
    language: "auto",
    pages: [{ pageIndex: 0, width: 100, height: 100, lines: [{ text: "?", confidence: 0.3, bbox: null }] }],
    fullText: "?",
    averageConfidence: 0.3,
    runtimeMs: 5,
    engine: "stub-low",
    modelVersion: "0.0.1",
  });
  const stub = {
    id: "stub-low",
    taskCapabilities: ["ocr-text"],
    manifestId: "stub-low",
    isAvailable: () => true,
    recognize: async () => lowResult,
  };
  const model = toDocumentModel(tinyPng, "png", "enhance-low.png");
  const enhanced = await enhanceWithOCR(model, { engine: stub });
  const warnings = enhanced.metadata?.warnings || [];
  assert.ok(warnings.find((w) => w.code === "OCR_LOW_CONFIDENCE"), "low-confidence OCR result should emit OCR_LOW_CONFIDENCE warning");
}

// 20. SHA-256 file picker path: sha256Hex on ArrayBuffer matches storage metadata
{
  const buffer = new TextEncoder().encode("trainedata-bytes").buffer;
  const digest = await sha256Hex(buffer);
  assert.equal(typeof digest, "string");
  assert.equal(digest.length, 64);
  const storage = new InMemoryStorage();
  await storage.put("tesseract/eng.traineddata", buffer, { sha256: digest });
  const list = await storage.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].sha256, digest);
  assert.equal(list[0].size, buffer.byteLength);
}

// 21. convertContentAsync with OCR disabled returns markdown string (same shape as sync convert)
{
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const result = await convertContentAsync({
    content: tinyPng,
    from: "png",
    to: "txt",
    title: "async-no-ocr.png",
    options: { repair: false, ocr: { enabled: false } },
  });
  assert.equal(typeof result?.data, "string", "convertContentAsync should return writer payload with data string");
  assert.equal(result.format, "txt");
}

// 22. convertContentAsync with stub OCR engine: markdown output contains stub text
{
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
  const stubEngine = {
    id: "async-stub",
    taskCapabilities: ["ocr-text"],
    manifestId: "async-stub",
    isAvailable: () => true,
    recognize: async () => createOCRResult({
      language: "auto",
      pages: [
        {
          pageIndex: 0,
          width: 1,
          height: 1,
          lines: [
            { text: "ASYNC-STUB-TEXT", confidence: 0.92, bbox: null },
          ],
        },
      ],
      fullText: "ASYNC-STUB-TEXT",
      averageConfidence: 0.92,
      runtimeMs: 1,
      engine: "async-stub",
      modelVersion: "0.0.1",
    }),
  };
  defaultOCRRegistry.register(stubEngine);
  try {
    const result = await convertContentAsync({
      content: tinyPng,
      from: "png",
      to: "txt",
      title: "async-stub.png",
      options: { repair: false },
    });
    assert.equal(result.data.includes("ASYNC-STUB-TEXT"), true, "convertContentAsync should append OCR text into markdown output");

    // Regression: the repair cycle must not clobber the OCR modelReview (ocr/ocrQuality)
    // — convertContentAsync without repair:false should still surface OCR recognition quality.
    const withRepair = await convertContentAsync({
      content: tinyPng,
      from: "png",
      to: "txt",
      title: "async-stub-repair.png",
      options: {},
    });
    assert.ok(withRepair.quality?.modelReview?.ocr, "result.quality.modelReview.ocr must survive the repair cycle for the UI");
    assert.equal(withRepair.quality.modelReview.ocr.engine, "async-stub");
  } finally {
    defaultOCRRegistry.unregister(stubEngine.id);
  }
}

// 23. runOCRStage persists line metadata in model.metadata.ocr
{
  const stubResult = createOCRResult({
    language: "zh-CN",
    pages: [
      { pageIndex: 0, width: 100, height: 100, lines: [{ text: "stage-line", confidence: 0.85, bbox: null }] },
    ],
    fullText: "stage-line",
    averageConfidence: 0.85,
    runtimeMs: 2,
    engine: "stage-stub",
    modelVersion: "0.0.1",
  });
  const stubEngine = {
    id: "stage-stub",
    taskCapabilities: ["ocr-text"],
    manifestId: "stage-stub",
    isAvailable: () => true,
    recognize: async () => stubResult,
  };
  defaultOCRRegistry.register(stubEngine);
  try {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
    const model = toDocumentModel(tinyPng, "png", "stage-test.png");
    const enhanced = await runOCRStage(model, { options: {} });
    assert.ok(enhanced.metadata?.ocr, "runOCRStage should expose metadata.ocr");
    assert.equal(enhanced.metadata.ocr.lineCount, 1);
    assert.equal(enhanced.metadata.ocr.lines[0].text, "stage-line");
    assert.equal(typeof enhanced.metadata.ocr.lines[0].confidence, "number");
    // blockId must resolve to a real appended OCR block that CONTAINS the line text,
    // which is the precondition for low-confidence replaceTextRun repair to target it.
    const lineBlockId = enhanced.metadata.ocr.lines[0].blockId;
    assert.ok(lineBlockId && lineBlockId.startsWith("ocr-block-"), "ocr line should carry a stable ocr-block id");
    const target = enhanced.blocks.find((b) => b.id === lineBlockId);
    assert.ok(target, "blockId should resolve to a real block in enhanced.blocks");
    assert.ok((target.text || "").includes("stage-line"), "target block text should contain the line text");
  } finally {
    defaultOCRRegistry.unregister(stubEngine.id);
  }
}

// 24. detectOCRLowConfidence emits replaceTextRun candidates for low-confidence lines
{
  const model = {
    schemaVersion: "trans2former.document.v1",
    title: "validator-test",
    sourceFormat: "png",
    blocks: [
      { id: "asset-1", type: "asset", assetId: "a", warnings: [], sourceSpan: { startLine: null, endLine: null, startOffset: null, endOffset: null } },
      { id: "ocr-block-1", type: "paragraph", text: "fuzzy", warnings: [], sourceSpan: { startLine: null, endLine: null, startOffset: null, endOffset: null } },
    ],
    assets: [],
    metadata: {
      ocr: {
        language: "zh-CN",
        pageCount: 1,
        lineCount: 1,
        lines: [
          { pageIndex: 0, lineIndex: 0, text: "fuzzy", confidence: 0.32, bbox: null, blockId: "ocr-block-1" },
        ],
      },
      modelReview: { engine: "validator-stub", modelVersion: "0.0.1" },
    },
  };
  const actions = detectOCRLowConfidence(model);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].actionType, "replaceTextRun");
  assert.equal(actions[0].targetId, "ocr-block-1");
  assert.equal(actions[0].before, "fuzzy");
  assert.equal(actions[0].evidence.source, "ocr-low-confidence");
}

// 25. detectOCRLowConfidence skips high-confidence lines
{
  const model = {
    schemaVersion: "trans2former.document.v1",
    title: "validator-high",
    sourceFormat: "png",
    blocks: [],
    assets: [],
    metadata: {
      ocr: {
        language: "auto",
        pageCount: 1,
        lineCount: 1,
        lines: [
          { pageIndex: 0, lineIndex: 0, text: "high", confidence: 0.92, bbox: null, blockId: "" },
        ],
      },
    },
  };
  const actions = detectOCRLowConfidence(model);
  assert.equal(actions.length, 0);
}

// 26. Sample PNG fixture can be loaded and converted via convertContentAsync without throwing
{
  const dataUrl = (await readFile("samples/png/t2f-sample.data-url.txt", "utf8")).trim();
  assert.equal(dataUrl.startsWith("data:image/png;base64,"), true);
  const result = await convertContentAsync({
    content: dataUrl,
    from: "png",
    to: "txt",
    title: "t2f-sample.png",
    options: { repair: false, ocr: { enabled: false } },
  });
  assert.equal(typeof result?.data, "string", "convertContentAsync should accept the t2f-sample PNG fixture");
}

// 27. isScannedPdf returns scanned=true for minimal pdf-header bytes with no extractable text
{
  const minimalPdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Size 1/Root 1 0 R>>\n%%EOF";
  const detection = await isScannedPdf(minimalPdf);
  assert.equal(detection.scanned, true, "minimal PDF without extractable text should be flagged scanned");
  assert.equal(detection.threshold > 0, true);
}

// 28. defaultPdfPageRasterizer.rasterize throws OCR_RASTERIZER_UNAVAILABLE in Node default
{
  await assert.rejects(
    () => defaultPdfPageRasterizer.rasterize({ content: "%PDF-1.4\n%%EOF", pageIndex: 0 }),
    (err) => err instanceof ConversionError && err.code === OCR_RASTERIZER_UNAVAILABLE,
  );
}

// 29. runScannedPdfOCRStage uses stub rasterizer + stub engine and appends multi-page paragraphs
{
  const stubRasterizer = {
    async countPages() { return 2; },
    async rasterize({ pageIndex }) {
      return {
        dataUrl: `data:image/png;base64,PAGE${pageIndex}==`,
        width: 100,
        height: 100,
      };
    },
  };
  setPdfPageRasterizer(stubRasterizer);
  const stubEngine = {
    id: "scan-stub-engine",
    taskCapabilities: ["ocr-text"],
    manifestId: "scan-stub",
    isAvailable: () => true,
    recognize: async ({ image }) => createOCRResult({
      language: "zh-CN",
      pages: [
        {
          pageIndex: 0,
          width: 100,
          height: 100,
          lines: [{ text: `STUB-${String(image).slice(-10)}`, confidence: 0.84, bbox: null }],
        },
      ],
      fullText: `STUB-${String(image).slice(-10)}`,
      averageConfidence: 0.84,
      runtimeMs: 3,
      engine: "scan-stub-engine",
      modelVersion: "0.0.1",
    }),
  };
  defaultOCRRegistry.register(stubEngine);
  try {
    const minimalPdf = "%PDF-1.4\nfake\n%%EOF";
    const baseModel = {
      schemaVersion: "trans2former.document.v1",
      title: "scan-stage",
      sourceFormat: "pdf",
      blocks: [],
      assets: [],
      metadata: {},
    };
    const enhanced = await runScannedPdfOCRStage(baseModel, {
      content: minimalPdf,
      options: { ocr: { maxScanPages: 2 } },
    });
    assert.equal(enhanced.blocks.length, 2, "stage should append one paragraph per rasterized page");
    assert.equal(enhanced.metadata?.modelReview?.engine, "scan-stub-engine");
    assert.equal(enhanced.metadata?.modelReview?.ocr?.pageCount, 2);
    assert.equal(enhanced.metadata?.ocr?.lineCount, 2);
  } finally {
    defaultOCRRegistry.unregister(stubEngine.id);
    resetPdfPageRasterizer();
  }
}

// 30. convertContentAsync routes scanned PDF through OCR stage when stubs registered
{
  const stubRasterizer = {
    async countPages() { return 1; },
    async rasterize() {
      return { dataUrl: "data:image/png;base64,SCAN==", width: 50, height: 50 };
    },
  };
  setPdfPageRasterizer(stubRasterizer);
  const stubEngine = {
    id: "scan-async-stub",
    taskCapabilities: ["ocr-text"],
    manifestId: "scan-async-stub",
    isAvailable: () => true,
    recognize: async () => createOCRResult({
      language: "auto",
      pages: [
        { pageIndex: 0, width: 50, height: 50, lines: [{ text: "ASYNC-SCAN-OCR", confidence: 0.9, bbox: null }] },
      ],
      fullText: "ASYNC-SCAN-OCR",
      averageConfidence: 0.9,
      runtimeMs: 2,
      engine: "scan-async-stub",
      modelVersion: "0.0.1",
    }),
  };
  defaultOCRRegistry.register(stubEngine);
  try {
    const minimalPdf = "%PDF-1.4\nfake\n%%EOF";
    const result = await convertContentAsync({
      content: minimalPdf,
      from: "pdf",
      to: "txt",
      title: "async-scan.pdf",
      options: { repair: false, ocr: { maxScanPages: 1 } },
    });
    assert.equal(typeof result?.data, "string");
    assert.equal(result.data.includes("ASYNC-SCAN-OCR"), true, "convertContentAsync should route scanned PDF through OCR stage and emit OCR text in output");
  } finally {
    defaultOCRRegistry.unregister(stubEngine.id);
    resetPdfPageRasterizer();
  }
}

// 31. ocrResultToFixedLayoutPage sorts textRuns by y/x and carries confidence
{
  const ocrResult = createOCRResult({
    language: "zh-CN",
    pages: [
      {
        pageIndex: 0,
        width: 1000,
        height: 800,
        lines: [
          { text: "BOTTOM-LEFT", confidence: 0.71, bbox: { x: 5, y: 700, w: 120, h: 18 } },
          { text: "TOP-RIGHT", confidence: 0.95, bbox: { x: 800, y: 30, w: 120, h: 18 } },
          { text: "TOP-LEFT", confidence: 0.92, bbox: { x: 5, y: 30, w: 120, h: 18 } },
        ],
      },
    ],
    fullText: "x",
    averageConfidence: 0.85,
    runtimeMs: 1,
    engine: "fixed-layout-stub",
    modelVersion: "0.0.1",
  });
  const page = ocrResultToFixedLayoutPage(ocrResult, { pageNumber: 1, pageIndex: 0 });
  assert.equal(page.pageNumber, 1);
  assert.equal(page.size.width, 1000);
  assert.equal(page.size.height, 800);
  assert.equal(page.readingOrderHint, READING_ORDER_HEURISTIC);
  assert.deepEqual(page.textRuns.map((r) => r.text), ["TOP-LEFT", "TOP-RIGHT", "BOTTOM-LEFT"]);
  assert.equal(page.textRuns[0].confidence, 0.92);
  assert.ok(page.textRuns[0].bbox, "bbox should be carried into textRun");
}

// 32. mergeOCRResultsToFixedLayout collects multi-page model + summary
{
  const makePage = (text) => createOCRResult({
    language: "zh-CN",
    pages: [{ pageIndex: 0, width: 100, height: 100, lines: [{ text, confidence: 0.8, bbox: null }] }],
    fullText: text,
    averageConfidence: 0.8,
    runtimeMs: 2,
    engine: "merge-stub",
    modelVersion: "0.0.1",
  });
  const layout = mergeOCRResultsToFixedLayout([makePage("page-one"), makePage("page-two")]);
  assert.equal(layout.pages.length, 2);
  assert.equal(layout.metadata?.readingOrder, READING_ORDER_HEURISTIC);
  assert.equal(layout.metadata?.ocr?.textRunCount, 2);
  const summary = getFixedLayoutSummary(layout);
  assert.equal(summary.pageCount, 2);
  assert.equal(summary.textRunCount, 2);
  const semantic = fixedLayoutToSemantic(layout, { title: "merged" });
  assert.equal(semantic.blocks.length, 2);
  assert.equal(semantic.blocks[0].text, "page-one");
}

// 33. runScannedPdfOCRStage populates model.fixedLayout + emits MODEL_* warnings
{
  const stubRasterizer = {
    async countPages() { return 2; },
    async rasterize({ pageIndex }) {
      return { dataUrl: `data:image/png;base64,LAYOUT${pageIndex}==`, width: 100, height: 100 };
    },
  };
  setPdfPageRasterizer(stubRasterizer);
  const stubEngine = {
    id: "fixedlayout-stub-engine",
    taskCapabilities: ["ocr-text"],
    manifestId: "fixedlayout-stub",
    isAvailable: () => true,
    recognize: async ({ image }) => createOCRResult({
      language: "auto",
      pages: [
        {
          pageIndex: 0,
          width: 100,
          height: 100,
          lines: [{ text: `STUB-${String(image).slice(-10)}`, confidence: 0.82, bbox: { x: 1, y: 10, w: 80, h: 12 } }],
        },
      ],
      fullText: `STUB-${String(image).slice(-10)}`,
      averageConfidence: 0.82,
      runtimeMs: 1,
      engine: "fixedlayout-stub-engine",
      modelVersion: "0.0.1",
    }),
  };
  defaultOCRRegistry.register(stubEngine);
  try {
    const minimalPdf = "%PDF-1.4\nfake\n%%EOF";
    const baseModel = {
      schemaVersion: "trans2former.document.v1",
      title: "scan-fixedlayout",
      sourceFormat: "pdf",
      blocks: [],
      assets: [],
      metadata: {},
    };
    const enhanced = await runScannedPdfOCRStage(baseModel, {
      content: minimalPdf,
      options: { ocr: { maxScanPages: 2 } },
    });
    assert.ok(enhanced.fixedLayout, "stage should populate model.fixedLayout");
    assert.equal(enhanced.fixedLayout.pages.length, 2);
    assert.equal(enhanced.metadata?.modelReview?.ocr?.fixedLayout?.pageCount, 2);
    const warnings = enhanced.metadata?.warnings || [];
    assert.ok(
      warnings.find((w) => w.code === MODEL_VISUAL_FIDELITY_LOST),
      "stage should emit MODEL_VISUAL_FIDELITY_LOST info warning",
    );
    assert.ok(
      warnings.find((w) => w.code === MODEL_TEXT_ORDER_HEURISTIC),
      "stage should emit MODEL_TEXT_ORDER_HEURISTIC info warning",
    );
    // Each ocr line must resolve to a real appended block CONTAINING its text — even though
    // mergeOCRResultsToFixedLayout re-sorts by reading order (so lines order != block order).
    const ocrLines = enhanced.metadata?.ocr?.lines || [];
    assert.equal(ocrLines.length, 2, "two scanned pages => two ocr lines");
    for (const ln of ocrLines) {
      assert.ok(ln.blockId && ln.blockId.startsWith("ocr-block-"), "scan-pdf ocr line should carry a stable ocr-block id");
      const target = enhanced.blocks.find((b) => b.id === ln.blockId);
      assert.ok(target, "scan-pdf blockId should resolve to a real block");
      assert.ok((target.text || "").includes((ln.text || "").trim()), "target block should contain the line text");
    }
  } finally {
    defaultOCRRegistry.unregister(stubEngine.id);
    resetPdfPageRasterizer();
  }
}

// 34. defaultPdfPageRasterizer falls through inject → browser auto → throw OCR_RASTERIZER_UNAVAILABLE
{
  // Node has no document; default should throw
  resetPdfPageRasterizer();
  await assert.rejects(
    () => defaultPdfPageRasterizer.countPages({ content: "%PDF-1.4\n%%EOF" }),
    (err) => err instanceof ConversionError && err.code === OCR_RASTERIZER_UNAVAILABLE,
  );
  // Inject a stub — it should take priority
  const injectedStub = {
    async countPages() { return 7; },
    async rasterize() { return { dataUrl: "data:image/png;base64,INJ==", width: 1, height: 1 }; },
  };
  setPdfPageRasterizer(injectedStub);
  try {
    const count = await defaultPdfPageRasterizer.countPages({ content: "%PDF-1.4\n%%EOF" });
    assert.equal(count, 7);
  } finally {
    resetPdfPageRasterizer();
  }
  // After reset, back to throwing
  await assert.rejects(
    () => defaultPdfPageRasterizer.countPages({ content: "%PDF-1.4\n%%EOF" }),
    (err) => err instanceof ConversionError && err.code === OCR_RASTERIZER_UNAVAILABLE,
  );
}

// 35. PP-OCRv5 advanced OCR engine skeleton (P9-D.1): registered, unavailable in Node,
//     manifest registered, recognize three-stage rejection.
{
  ensurePaddleOcrBootstrap();
  ensurePaddleOcrBootstrap();
  assert.equal(defaultOCRRegistry.has(paddleOcrEngine.id), true, "paddle engine should be registered after bootstrap");
  assert.equal(paddleOcrEngine.id, "paddleocr-v5");
  assert.equal(paddleOcrEngine.taskCapabilities.includes("ocr-text"), true);
  assert.equal(paddleOcrEngine.taskCapabilities.includes("ocr-layout"), true);
  assert.equal(paddleOcrEngine.isAvailable(), false, "paddle engine should report unavailable until P9-D.2 wires onnxruntime");

  const status = defaultModelCache.getStatus(PADDLE_OCR_MANIFEST_ID);
  assert.ok(status, "paddle manifest should be registered in defaultModelCache");
  assert.equal(status.status, STATUS_NOT_DOWNLOADED);

  // vendor not ready => OCR_UNAVAILABLE / vendor-not-ready
  markPaddleOcrVendorReady(false);
  await assert.rejects(
    () => paddleOcrEngine.recognize({ image: { width: 10, height: 10 } }),
    (err) => err instanceof ConversionError && err.code === OCR_UNAVAILABLE && err.details?.reason === "vendor-not-ready",
  );

  // vendor ready but models missing => OCR_UNAVAILABLE / model-missing
  markPaddleOcrVendorReady(true);
  try {
    await assert.rejects(
      () => paddleOcrEngine.recognize({ image: { width: 10, height: 10 } }),
      (err) => err instanceof ConversionError && err.code === OCR_UNAVAILABLE && err.details?.reason === "model-missing",
    );
  } finally {
    markPaddleOcrVendorReady(false);
  }
}

// 36. PP-OCRv5 onnxruntime-web runtime loader (P9-D.2): EP selection + Node vendor-load reject.
{
  // Node has no navigator.gpu => wasm-only execution providers.
  assert.deepEqual(pickExecutionProviders(), ["wasm"], "Node should pick wasm-only execution provider");
  assert.equal(PADDLE_VENDOR_PATHS.mainBundle, "/vendor/onnxruntime/ort.min.mjs");

  // loadOnnxRuntime dynamic-imports a same-origin vendor path that does not resolve in Node => throws.
  await assert.rejects(
    () => loadOnnxRuntime(),
    (err) => err instanceof ConversionError && err.code === OCR_VENDOR_LOAD_FAILED,
    "loadOnnxRuntime should reject with OCR_VENDOR_LOAD_FAILED when vendor onnxruntime-web is absent (Node)",
  );

  // With vendor + models simulated ready, recognize reaches the runtime loader and surfaces
  // the vendor-load failure (rather than the earlier vendor-not-ready / model-missing stages).
  markPaddleOcrVendorReady(true);
  for (const file of ["det.onnx", "cls.onnx", "rec.onnx"]) {
    await paddleOcrEngine._storage.put(`paddleocr/v5/${file}`, new Uint8Array([1]).buffer, { sha256: "x" });
  }
  try {
    await assert.rejects(
      () => paddleOcrEngine.recognize({ image: { width: 4, height: 4 } }),
      (err) => err instanceof ConversionError && err.code === OCR_VENDOR_LOAD_FAILED,
      "paddle recognize should reach loadOnnxRuntime and reject with OCR_VENDOR_LOAD_FAILED in Node",
    );
  } finally {
    for (const file of ["det.onnx", "cls.onnx", "rec.onnx"]) {
      await paddleOcrEngine._storage.delete(`paddleocr/v5/${file}`);
    }
    markPaddleOcrVendorReady(false);
  }
}

// 37. PP-OCRv5 model import availability flip (P9-D.3): required det+rec present + vendor ready
//     => isAvailable() true; cls is OPTIONAL (removing it stays ready); removing a required
//     model (rec) => false. Mirrors security-center import/clear with cls optional.
{
  const det = "paddleocr/v5/det.onnx";
  const cls = "paddleocr/v5/cls.onnx";
  const rec = "paddleocr/v5/rec.onnx";
  markPaddleOcrVendorReady(true);
  try {
    // partial: det present but required rec missing => not ready (cls present but optional)
    await paddleOcrEngine._storage.put(det, new Uint8Array([1]).buffer, { sha256: "a" });
    await paddleOcrEngine._storage.put(cls, new Uint8Array([2]).buffer, { sha256: "b" });
    assert.equal(await paddleOcrEngine.ensureProbe(), false, "det without required rec should not be ready");
    assert.equal(paddleOcrEngine.isAvailable(), false);

    // required det+rec present => ready
    await paddleOcrEngine._storage.put(rec, new Uint8Array([3]).buffer, { sha256: "c" });
    assert.equal(await paddleOcrEngine.ensureProbe(), true, "required det+rec present => ready");
    assert.equal(paddleOcrEngine.isAvailable(), true);

    // vendor flag off => unavailable even with models
    markPaddleOcrVendorReady(false);
    assert.equal(paddleOcrEngine.isAvailable(), false, "vendor not ready => unavailable regardless of models");

    // remove OPTIONAL cls => still ready (det+rec remain)
    markPaddleOcrVendorReady(true);
    await paddleOcrEngine._storage.delete(cls);
    assert.equal(await paddleOcrEngine.ensureProbe(), true, "removing optional cls keeps readiness");

    // remove a REQUIRED model (rec) => not ready
    await paddleOcrEngine._storage.delete(rec);
    assert.equal(await paddleOcrEngine.ensureProbe(), false, "removing required rec should drop readiness");
  } finally {
    for (const key of [det, cls, rec]) await paddleOcrEngine._storage.delete(key);
    markPaddleOcrVendorReady(false);
    await paddleOcrEngine.ensureProbe();
  }
}

// 38. Priority-aware pickForTask (P9-D.4): higher-priority available engine wins; PP-OCRv5
//     preferred over tesseract when both available.
{
  const reg = new OCREngineRegistry();
  const stub = (id, priority, available) => ({
    id, taskCapabilities: ["ocr-text"], priority, isAvailable: () => available, recognize: async () => ({}),
  });
  reg.register(stub("low-pri", 5, true));
  reg.register(stub("high-pri", 20, true));
  reg.register(stub("mid-pri", 10, true));
  assert.equal(reg.pickForTask("ocr-text").id, "high-pri", "highest-priority available engine should win");

  // Only a low-priority engine available => it is picked even if a higher-priority one is unavailable.
  const reg2 = new OCREngineRegistry();
  reg2.register(stub("hi-unavail", 20, false));
  reg2.register(stub("lo-avail", 5, true));
  assert.equal(reg2.pickForTask("ocr-text").id, "lo-avail", "available lower-priority engine should win over unavailable higher-priority");

  // Default registry: both tesseract + paddle available => paddle (priority 20) preferred.
  markTesseractVendorReady(true);
  await tesseractOCREngine._storage.put("tesseract/eng.traineddata", new Uint8Array([1]).buffer, { sha256: "x" });
  await tesseractOCREngine.ensureProbe();
  markPaddleOcrVendorReady(true);
  for (const file of ["det.onnx", "cls.onnx", "rec.onnx"]) {
    await paddleOcrEngine._storage.put(`paddleocr/v5/${file}`, new Uint8Array([1]).buffer, { sha256: "x" });
  }
  await paddleOcrEngine.ensureProbe();
  try {
    assert.equal(tesseractOCREngine.isAvailable(), true);
    assert.equal(paddleOcrEngine.isAvailable(), true);
    assert.equal(defaultOCRRegistry.pickForTask("ocr-text").id, "paddleocr-v5", "PP-OCRv5 should be preferred over tesseract when both available");

    // Remove paddle models => tesseract wins.
    for (const file of ["det.onnx", "cls.onnx", "rec.onnx"]) {
      await paddleOcrEngine._storage.delete(`paddleocr/v5/${file}`);
    }
    await paddleOcrEngine.ensureProbe();
    assert.equal(defaultOCRRegistry.pickForTask("ocr-text").id, "tesseract-zh-en", "tesseract should win when paddle unavailable");
  } finally {
    await tesseractOCREngine._storage.delete("tesseract/eng.traineddata");
    for (const file of ["det.onnx", "cls.onnx", "rec.onnx"]) {
      await paddleOcrEngine._storage.delete(`paddleocr/v5/${file}`);
    }
    markTesseractVendorReady(false);
    markPaddleOcrVendorReady(false);
    await tesseractOCREngine.ensureProbe();
    await paddleOcrEngine.ensureProbe();
  }
}

console.log("OCR baseline test passed: contracts, registry, bootstraps, storage, png reader/async stage, repair validator, scan PDF detection + rasterizer skeleton + multi-page OCR stage + FixedLayoutModel mapping + browser rasterizer fallback + PP-OCRv5 advanced engine skeleton + onnxruntime-web runtime loader + model import availability flip + priority-aware route preference all verified.");
