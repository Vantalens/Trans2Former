import { ConversionError } from "../conversion-error.js";

export const MODEL_MANIFEST_SCHEMA_VERSION = "trans2former.model-manifest.v1";

export const MODEL_TASKS = Object.freeze([
  "ocr-text",
  "ocr-layout",
  "ocr-table",
  "quality-reviewer",
]);

export const MODEL_ENGINES = Object.freeze([
  "tesseract",
  "paddleocr",
  "paddleocr-vl",
  "mineru",
  "custom",
]);

export const MODEL_QUANTIZATIONS = Object.freeze(["fp32", "fp16", "int8", "none"]);

export const FALLBACK_STRATEGIES = Object.freeze([
  "skip-task",
  "use-degraded-route",
  "fail-quality-gate",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function freezeDeep(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
    return Object.freeze(value);
  }
  return value;
}

export function createModelManifest({
  manifestId,
  task,
  engine,
  modelVersion,
  bundleSize,
  quantization = "none",
  minMemoryMB = 0,
  sources = [],
  checksums = { algorithm: "SHA-256", digest: "", perFile: {} },
  fallback = { onFailure: "skip-task", message: "" },
  ui = { label: "", description: "", enableHint: "" },
} = {}) {
  const manifest = {
    schemaVersion: MODEL_MANIFEST_SCHEMA_VERSION,
    manifestId,
    task,
    engine,
    modelVersion,
    bundleSize,
    quantization,
    minMemoryMB,
    sources: Array.isArray(sources) ? sources.map((entry) => ({ ...entry })) : sources,
    checksums: {
      algorithm: checksums?.algorithm || "SHA-256",
      digest: checksums?.digest || "",
      perFile: { ...(checksums?.perFile || {}) },
    },
    fallback: {
      onFailure: fallback?.onFailure || "skip-task",
      message: fallback?.message || "",
    },
    ui: {
      label: ui?.label || "",
      description: ui?.description || "",
      enableHint: ui?.enableHint || "",
    },
  };
  validateModelManifest(manifest);
  return freezeDeep(manifest);
}

export function validateModelManifest(manifest) {
  if (!isPlainObject(manifest)) {
    throw new ConversionError("Model manifest must be an object.", {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "not-an-object" },
    });
  }
  if (manifest.schemaVersion !== MODEL_MANIFEST_SCHEMA_VERSION) {
    throw new ConversionError(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}`, {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "schema-version", expected: MODEL_MANIFEST_SCHEMA_VERSION },
    });
  }
  for (const field of ["manifestId", "task", "engine", "modelVersion"]) {
    if (!isNonEmptyString(manifest[field])) {
      throw new ConversionError(`Manifest field missing or empty: ${field}`, {
        category: "validate",
        code: "MODEL_MANIFEST_INVALID",
        details: { reason: "missing-field", field },
      });
    }
  }
  if (!MODEL_TASKS.includes(manifest.task)) {
    throw new ConversionError(`Unknown manifest task: ${manifest.task}`, {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "unknown-task", task: manifest.task },
    });
  }
  if (!MODEL_ENGINES.includes(manifest.engine)) {
    throw new ConversionError(`Unknown manifest engine: ${manifest.engine}`, {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "unknown-engine", engine: manifest.engine },
    });
  }
  if (typeof manifest.bundleSize !== "number" || !Number.isFinite(manifest.bundleSize) || manifest.bundleSize <= 0) {
    throw new ConversionError("Manifest bundleSize must be a positive number.", {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "invalid-bundle-size", bundleSize: manifest.bundleSize },
    });
  }
  if (manifest.quantization && !MODEL_QUANTIZATIONS.includes(manifest.quantization)) {
    throw new ConversionError(`Unknown quantization: ${manifest.quantization}`, {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "unknown-quantization", quantization: manifest.quantization },
    });
  }
  if (typeof manifest.minMemoryMB !== "number" || !Number.isFinite(manifest.minMemoryMB) || manifest.minMemoryMB < 0) {
    throw new ConversionError("Manifest minMemoryMB must be a non-negative number.", {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "invalid-min-memory" },
    });
  }
  if (!isPlainObject(manifest.checksums) || manifest.checksums.algorithm !== "SHA-256") {
    throw new ConversionError("Manifest checksums.algorithm must equal 'SHA-256'.", {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "invalid-checksum-algorithm" },
    });
  }
  if (!isNonEmptyString(manifest.checksums.digest)) {
    throw new ConversionError("Manifest checksums.digest must be a non-empty SHA-256 hex string.", {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "missing-digest" },
    });
  }
  if (!isPlainObject(manifest.fallback) || !FALLBACK_STRATEGIES.includes(manifest.fallback.onFailure)) {
    throw new ConversionError(`Manifest fallback.onFailure must be one of ${FALLBACK_STRATEGIES.join(", ")}.`, {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "invalid-fallback", onFailure: manifest.fallback?.onFailure },
    });
  }
  if (!Array.isArray(manifest.sources)) {
    throw new ConversionError("Manifest sources must be an array.", {
      category: "validate",
      code: "MODEL_MANIFEST_INVALID",
      details: { reason: "invalid-sources" },
    });
  }
  return manifest;
}

export function summarizeManifest(manifest) {
  if (!isPlainObject(manifest)) return null;
  return {
    manifestId: manifest.manifestId,
    task: manifest.task,
    engine: manifest.engine,
    modelVersion: manifest.modelVersion,
    bundleSize: manifest.bundleSize,
    quantization: manifest.quantization || "none",
    minMemoryMB: manifest.minMemoryMB || 0,
    fallback: manifest.fallback?.onFailure || "skip-task",
  };
}
