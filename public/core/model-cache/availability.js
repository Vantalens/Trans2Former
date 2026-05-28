import { ConversionError } from "../conversion-error.js";
import { validateModelManifest, summarizeManifest } from "./manifest.js";

export const STATUS_NOT_DOWNLOADED = "not-downloaded";
export const STATUS_IMPORTING = "importing";
export const STATUS_VERIFYING = "verifying";
export const STATUS_AVAILABLE = "available";
export const STATUS_DEGRADED = "degraded";
export const STATUS_DISABLED = "disabled";

export const MODEL_CACHE_STATUSES = Object.freeze([
  STATUS_NOT_DOWNLOADED,
  STATUS_IMPORTING,
  STATUS_VERIFYING,
  STATUS_AVAILABLE,
  STATUS_DEGRADED,
  STATUS_DISABLED,
]);

function ensureStatus(status) {
  if (!MODEL_CACHE_STATUSES.includes(status)) {
    throw new ConversionError(`Unknown model cache status: ${status}`, {
      category: "validate",
      code: "MODEL_CACHE_STATUS_INVALID",
      details: { reason: "unknown-status", status },
    });
  }
}

export class ModelCacheRegistry {
  constructor() {
    this._entries = new Map();
    this._listeners = new Set();
  }

  register(manifest) {
    validateModelManifest(manifest);
    if (this._entries.has(manifest.manifestId)) {
      throw new ConversionError(`Model manifest already registered: ${manifest.manifestId}`, {
        category: "validate",
        code: "MODEL_CACHE_DUPLICATE",
        details: { manifestId: manifest.manifestId },
      });
    }
    const entry = {
      manifest,
      status: STATUS_NOT_DOWNLOADED,
      detail: { message: "" },
      updatedAt: Date.now(),
    };
    this._entries.set(manifest.manifestId, entry);
    this._notify({ type: "register", manifestId: manifest.manifestId, status: entry.status });
    return entry;
  }

  unregister(manifestId) {
    if (!this._entries.has(manifestId)) return false;
    this._entries.delete(manifestId);
    this._notify({ type: "unregister", manifestId });
    return true;
  }

  has(manifestId) {
    return this._entries.has(manifestId);
  }

  getStatus(manifestId) {
    const entry = this._entries.get(manifestId);
    if (!entry) return null;
    return {
      manifestId,
      status: entry.status,
      detail: { ...entry.detail },
      updatedAt: entry.updatedAt,
      summary: summarizeManifest(entry.manifest),
    };
  }

  setStatus(manifestId, status, detail = {}) {
    const entry = this._entries.get(manifestId);
    if (!entry) {
      throw new ConversionError(`Unknown manifestId: ${manifestId}`, {
        category: "validate",
        code: "MODEL_CACHE_UNKNOWN",
        details: { manifestId },
      });
    }
    ensureStatus(status);
    entry.status = status;
    entry.detail = { message: "", ...detail };
    entry.updatedAt = Date.now();
    this._notify({ type: "status", manifestId, status, detail: entry.detail });
    return entry;
  }

  listManifests() {
    return [...this._entries.values()]
      .map((entry) => ({
        manifestId: entry.manifest.manifestId,
        manifest: entry.manifest,
        status: entry.status,
        detail: { ...entry.detail },
        updatedAt: entry.updatedAt,
      }))
      .sort((a, b) => a.manifestId.localeCompare(b.manifestId));
  }

  reset() {
    this._entries.clear();
    this._notify({ type: "reset" });
  }

  onChange(callback) {
    if (typeof callback !== "function") return () => {};
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify(event) {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (error) {
        // listener errors must not break the registry
      }
    }
  }
}

export const defaultModelCache = new ModelCacheRegistry();
