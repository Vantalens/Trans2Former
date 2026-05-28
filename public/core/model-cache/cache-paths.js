import { ConversionError } from "../conversion-error.js";
import { MODEL_ENGINES, MODEL_TASKS } from "./manifest.js";

export const MODEL_CACHE_ROOT = "model-cache";

function assertSlugSafe(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConversionError(`Cache path field missing or empty: ${field}`, {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "missing-field", field },
    });
  }
  if (!/^[a-z0-9][a-z0-9_.\-]*$/i.test(value)) {
    throw new ConversionError(`Cache path field contains unsupported characters: ${field}=${value}`, {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "unsafe-slug", field, value },
    });
  }
}

export function getCacheKey({ task, engine, modelVersion } = {}) {
  assertSlugSafe(task, "task");
  assertSlugSafe(engine, "engine");
  assertSlugSafe(modelVersion, "modelVersion");
  if (!MODEL_TASKS.includes(task)) {
    throw new ConversionError(`Unknown cache task: ${task}`, {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "unknown-task", task },
    });
  }
  if (!MODEL_ENGINES.includes(engine)) {
    throw new ConversionError(`Unknown cache engine: ${engine}`, {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "unknown-engine", engine },
    });
  }
  return `${task}/${engine}/${modelVersion}`;
}

export function getCacheDirectory(parts) {
  return `${MODEL_CACHE_ROOT}/${getCacheKey(parts)}`;
}

export function parseCacheKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new ConversionError("parseCacheKey requires a non-empty key string.", {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "empty-key" },
    });
  }
  const segments = key.split("/").filter(Boolean);
  if (segments.length !== 3) {
    throw new ConversionError(`Cache key must have 3 segments (task/engine/modelVersion): ${key}`, {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "segment-count", segments: segments.length },
    });
  }
  const [task, engine, modelVersion] = segments;
  getCacheKey({ task, engine, modelVersion });
  return { task, engine, modelVersion };
}

export function getCacheFilePath(parts, fileName) {
  if (typeof fileName !== "string" || fileName.trim().length === 0) {
    throw new ConversionError("getCacheFilePath requires a non-empty fileName.", {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "empty-file-name" },
    });
  }
  if (fileName.includes("..") || fileName.startsWith("/") || fileName.includes("\\")) {
    throw new ConversionError(`Cache file name must be relative and safe: ${fileName}`, {
      category: "validate",
      code: "MODEL_CACHE_PATH_INVALID",
      details: { reason: "unsafe-file-name", fileName },
    });
  }
  return `${getCacheDirectory(parts)}/${fileName.replace(/^\/+/, "")}`;
}
