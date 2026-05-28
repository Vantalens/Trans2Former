import assert from "node:assert/strict";

import {
  MODEL_MANIFEST_SCHEMA_VERSION,
  MODEL_TASKS,
  MODEL_ENGINES,
  MODEL_QUANTIZATIONS,
  FALLBACK_STRATEGIES,
  createModelManifest,
  validateModelManifest,
  summarizeManifest,
  sha256Hex,
  verifyChecksum,
  MODEL_CACHE_ROOT,
  getCacheKey,
  getCacheDirectory,
  parseCacheKey,
  getCacheFilePath,
  STATUS_NOT_DOWNLOADED,
  STATUS_AVAILABLE,
  STATUS_DEGRADED,
  STATUS_DISABLED,
  MODEL_CACHE_STATUSES,
  ModelCacheRegistry,
  defaultModelCache,
  getFirstEnableHint,
  getOfflineFallbackHint,
  getClearCacheHint,
  getStatusLabel,
  getTaskLabel,
  listKnownTaskLabels,
} from "../public/browser-transformer.js";
import { ConversionError } from "../public/core/conversion-error.js";

function baseManifestInput(overrides = {}) {
  return {
    manifestId: "ocr-text.tesseract.1.0.0",
    task: "ocr-text",
    engine: "tesseract",
    modelVersion: "1.0.0",
    bundleSize: 12345678,
    quantization: "int8",
    minMemoryMB: 256,
    sources: [{ kind: "user-provided", path: "user://imported.zip" }],
    checksums: {
      algorithm: "SHA-256",
      digest: "deadbeef".repeat(8),
      perFile: { "tessdata/chi_sim.traineddata": "deadbeef".repeat(8) },
    },
    fallback: { onFailure: "skip-task", message: "OCR 模型缺失时跳过该路径" },
    ui: { label: "中文 OCR", description: "Tesseract.js 中文模型", enableHint: "首次启用本地导入" },
    ...overrides,
  };
}

// 1. Schema constants
{
  assert.equal(MODEL_MANIFEST_SCHEMA_VERSION, "trans2former.model-manifest.v1");
  assert.deepEqual([...MODEL_TASKS], ["ocr-text", "ocr-layout", "ocr-table", "quality-reviewer"]);
  assert.deepEqual([...MODEL_ENGINES], ["tesseract", "paddleocr", "paddleocr-vl", "mineru", "custom"]);
  assert.equal(MODEL_QUANTIZATIONS.includes("int8"), true);
  assert.equal(FALLBACK_STRATEGIES.includes("skip-task"), true);
  assert.equal(MODEL_CACHE_ROOT, "model-cache");
}

// 2. createModelManifest + validate happy path
{
  const manifest = createModelManifest(baseManifestInput());
  assert.equal(manifest.schemaVersion, MODEL_MANIFEST_SCHEMA_VERSION);
  assert.equal(manifest.task, "ocr-text");
  assert.equal(manifest.engine, "tesseract");
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.checksums), true);
  assert.equal(Object.isFrozen(manifest.sources), true);
  validateModelManifest(manifest);
  const summary = summarizeManifest(manifest);
  assert.equal(summary.manifestId, manifest.manifestId);
  assert.equal(summary.fallback, "skip-task");
}

// 3. validateModelManifest rejects malformed inputs
{
  const cases = [
    [{ task: undefined }, "missing-field"],
    [{ task: "unknown-task" }, "unknown-task"],
    [{ engine: "unknown-engine" }, "unknown-engine"],
    [{ bundleSize: 0 }, "invalid-bundle-size"],
    [{ bundleSize: -1 }, "invalid-bundle-size"],
    [{ quantization: "fp99" }, "unknown-quantization"],
    [{ minMemoryMB: -10 }, "invalid-min-memory"],
    [{ checksums: { algorithm: "MD5", digest: "x" } }, "invalid-checksum-algorithm"],
    [{ checksums: { algorithm: "SHA-256", digest: "" } }, "missing-digest"],
    [{ fallback: { onFailure: "explode" } }, "invalid-fallback"],
    [{ sources: "not-array" }, "invalid-sources"],
  ];
  for (const [overrides, expectedReason] of cases) {
    assert.throws(
      () => createModelManifest(baseManifestInput(overrides)),
      (err) =>
        err instanceof ConversionError
        && err.code === "MODEL_MANIFEST_INVALID"
        && err.details?.reason === expectedReason,
      `expected ${expectedReason} to throw MODEL_MANIFEST_INVALID with that reason (got: ${JSON.stringify(overrides)})`
    );
  }
}

// 4. sha256Hex on known vector
{
  // Well-known SHA-256("abc") expected digest
  const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  const actual = await sha256Hex("abc");
  assert.equal(actual, expected, `sha256Hex("abc") should equal known digest`);

  const result = await verifyChecksum("abc", expected.toUpperCase());
  assert.equal(result.ok, true, "verifyChecksum should accept uppercase expected digest");
  assert.equal(result.actual, expected);
  assert.equal(result.expected, expected);

  const mismatch = await verifyChecksum("xyz", expected);
  assert.equal(mismatch.ok, false);
  assert.notEqual(mismatch.actual, expected);
}

// 5. verifyChecksum input validation
{
  await assert.rejects(
    () => verifyChecksum("abc", ""),
    (err) => err instanceof ConversionError && err.code === "MODEL_CHECKSUM_INVALID_INPUT",
  );
}

// 6. Cache path helpers
{
  const key = getCacheKey({ task: "ocr-text", engine: "tesseract", modelVersion: "1.0.0" });
  assert.equal(key, "ocr-text/tesseract/1.0.0");
  const dir = getCacheDirectory({ task: "ocr-text", engine: "tesseract", modelVersion: "1.0.0" });
  assert.equal(dir, "model-cache/ocr-text/tesseract/1.0.0");
  assert.deepEqual(parseCacheKey(key), { task: "ocr-text", engine: "tesseract", modelVersion: "1.0.0" });
  assert.equal(
    getCacheFilePath({ task: "ocr-text", engine: "tesseract", modelVersion: "1.0.0" }, "tessdata/chi_sim.traineddata"),
    "model-cache/ocr-text/tesseract/1.0.0/tessdata/chi_sim.traineddata",
  );

  // Reject unsafe inputs
  for (const invalid of ["..", "../etc/passwd", "/absolute", "back\\slash"]) {
    assert.throws(
      () =>
        getCacheFilePath({ task: "ocr-text", engine: "tesseract", modelVersion: "1.0.0" }, invalid),
      (err) => err instanceof ConversionError && err.code === "MODEL_CACHE_PATH_INVALID",
      `getCacheFilePath should reject unsafe fileName: ${invalid}`,
    );
  }
  for (const badEngine of ["unknown-engine", "with space", ""]) {
    assert.throws(
      () => getCacheKey({ task: "ocr-text", engine: badEngine, modelVersion: "1.0.0" }),
      (err) => err instanceof ConversionError && err.code === "MODEL_CACHE_PATH_INVALID",
      `getCacheKey should reject engine: ${badEngine}`,
    );
  }
}

// 7. ModelCacheRegistry default status + state transitions + onChange
{
  const registry = new ModelCacheRegistry();
  const manifest = createModelManifest(baseManifestInput());
  const events = [];
  const unsubscribe = registry.onChange((event) => events.push(event));

  registry.register(manifest);
  const status = registry.getStatus(manifest.manifestId);
  assert.equal(status.status, STATUS_NOT_DOWNLOADED);
  assert.equal(status.summary.task, "ocr-text");

  registry.setStatus(manifest.manifestId, STATUS_AVAILABLE, { message: "imported" });
  const afterAvailable = registry.getStatus(manifest.manifestId);
  assert.equal(afterAvailable.status, STATUS_AVAILABLE);
  assert.equal(afterAvailable.detail.message, "imported");

  assert.throws(
    () => registry.setStatus(manifest.manifestId, "exploded"),
    (err) => err instanceof ConversionError && err.code === "MODEL_CACHE_STATUS_INVALID",
  );
  assert.throws(
    () => registry.setStatus("non-existent", STATUS_AVAILABLE),
    (err) => err instanceof ConversionError && err.code === "MODEL_CACHE_UNKNOWN",
  );
  assert.throws(
    () => registry.register(manifest),
    (err) => err instanceof ConversionError && err.code === "MODEL_CACHE_DUPLICATE",
  );

  const list = registry.listManifests();
  assert.equal(list.length, 1);
  assert.equal(list[0].manifestId, manifest.manifestId);

  assert.equal(events.some((event) => event.type === "register"), true);
  assert.equal(events.some((event) => event.type === "status" && event.status === STATUS_AVAILABLE), true);

  unsubscribe();
  registry.setStatus(manifest.manifestId, STATUS_DEGRADED);
  const eventsAfter = events.length;
  // unsubscribe should stop event delivery
  registry.setStatus(manifest.manifestId, STATUS_DISABLED);
  assert.equal(events.length, eventsAfter, "unsubscribed listener must not receive further events");

  registry.unregister(manifest.manifestId);
  assert.equal(registry.has(manifest.manifestId), false);
  registry.reset();
  assert.equal(registry.listManifests().length, 0);
}

// 8. defaultModelCache instance check
{
  assert.equal(defaultModelCache instanceof ModelCacheRegistry, true);
  assert.equal(typeof defaultModelCache.register, "function");
}

// 9. UI text helpers
{
  for (const task of MODEL_TASKS) {
    assert.equal(typeof getFirstEnableHint(task), "string");
    assert.notEqual(getFirstEnableHint(task), "");
    assert.equal(typeof getOfflineFallbackHint(task), "string");
    assert.equal(typeof getClearCacheHint(task), "string");
    assert.equal(typeof getTaskLabel(task), "string");
  }
  for (const status of MODEL_CACHE_STATUSES) {
    assert.equal(typeof getStatusLabel(status), "string");
  }
  const labels = listKnownTaskLabels();
  assert.equal(labels.length, MODEL_TASKS.length);
}

console.log("Model cache test passed: manifest contract, checksum, cache paths, registry, and UI hints all verified.");
