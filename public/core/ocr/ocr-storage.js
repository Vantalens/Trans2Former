import { ConversionError } from "../conversion-error.js";

function ensureString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConversionError(`OCR storage ${field} must be a non-empty string.`, {
      category: "validate",
      code: "OCR_STORAGE_INVALID_KEY",
      details: { reason: "missing-field", field },
    });
  }
}

function ensureBuffer(value, field) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new ConversionError(`OCR storage ${field} must be ArrayBuffer or TypedArray.`, {
    category: "validate",
    code: "OCR_STORAGE_INVALID_VALUE",
    details: { reason: "unsupported-input-type", field },
  });
}

export class InMemoryStorage {
  constructor() {
    this._entries = new Map();
  }

  async has(key) {
    ensureString(key, "key");
    return this._entries.has(key);
  }

  async get(key) {
    ensureString(key, "key");
    const entry = this._entries.get(key);
    if (!entry) return null;
    // Return a copy to prevent caller mutation
    return entry.value.slice(0);
  }

  async put(key, value, meta = {}) {
    ensureString(key, "key");
    const buffer = ensureBuffer(value, "value");
    this._entries.set(key, {
      value: buffer,
      size: buffer.byteLength,
      sha256: typeof meta?.sha256 === "string" ? meta.sha256 : "",
      updatedAt: Date.now(),
    });
  }

  async delete(key) {
    ensureString(key, "key");
    return this._entries.delete(key);
  }

  async list() {
    return [...this._entries.entries()]
      .map(([key, entry]) => ({
        key,
        size: entry.size,
        sha256: entry.sha256,
        updatedAt: entry.updatedAt,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async clear() {
    this._entries.clear();
  }
}

let _indexedDBStorageCtorPromise = null;

async function loadIndexedDBStorageCtor() {
  if (!_indexedDBStorageCtorPromise) {
    _indexedDBStorageCtorPromise = import("./indexeddb-storage.js")
      .then((mod) => mod.IndexedDBStorage)
      .catch((error) => {
        _indexedDBStorageCtorPromise = null;
        throw error;
      });
  }
  return _indexedDBStorageCtorPromise;
}

class LazyIndexedDBStorage {
  constructor(dbName) {
    this._dbName = dbName;
    this._delegate = null;
  }

  async _resolve() {
    if (!this._delegate) {
      const Ctor = await loadIndexedDBStorageCtor();
      this._delegate = new Ctor(this._dbName);
    }
    return this._delegate;
  }

  async has(key) { return (await this._resolve()).has(key); }
  async get(key) { return (await this._resolve()).get(key); }
  async put(key, value, meta) { return (await this._resolve()).put(key, value, meta); }
  async delete(key) { return (await this._resolve()).delete(key); }
  async list() { return (await this._resolve()).list(); }
  async clear() { return (await this._resolve()).clear(); }
}

export function createIndexedDBStorage(dbName = "trans2former-ocr-cache") {
  if (typeof globalThis !== "undefined" && globalThis.indexedDB) {
    return new LazyIndexedDBStorage(dbName);
  }
  return new InMemoryStorage();
}

export const defaultOCRStorage = createIndexedDBStorage();
