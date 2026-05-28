import { ConversionError } from "../conversion-error.js";

const DEFAULT_DB_NAME = "trans2former-ocr-cache";
const DB_VERSION = 1;
const STORE_TESSDATA = "tessdata";
const STORE_METADATA = "metadata";

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

function awaitRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function awaitTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(dbName) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TESSDATA)) {
        db.createObjectStore(STORE_TESSDATA);
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another connection"));
  });
}

function wrapIdbError(operation, error) {
  return new ConversionError(`IndexedDB ${operation} failed: ${error?.message || error}`, {
    category: "convert",
    code: "OCR_STORAGE_IDB_ERROR",
    details: { operation, cause: String(error?.name || error?.message || "unknown") },
  });
}

export class IndexedDBStorage {
  constructor(dbName = DEFAULT_DB_NAME) {
    this._dbName = dbName;
    this._dbPromise = null;
  }

  async _db() {
    if (!this._dbPromise) {
      this._dbPromise = openDatabase(this._dbName).catch((error) => {
        this._dbPromise = null;
        throw wrapIdbError("open", error);
      });
    }
    return this._dbPromise;
  }

  async has(key) {
    ensureString(key, "key");
    const db = await this._db();
    try {
      const tx = db.transaction(STORE_METADATA, "readonly");
      const store = tx.objectStore(STORE_METADATA);
      const value = await awaitRequest(store.getKey(key));
      return value !== undefined;
    } catch (error) {
      throw wrapIdbError("has", error);
    }
  }

  async get(key) {
    ensureString(key, "key");
    const db = await this._db();
    try {
      const tx = db.transaction(STORE_TESSDATA, "readonly");
      const store = tx.objectStore(STORE_TESSDATA);
      const value = await awaitRequest(store.get(key));
      if (value === undefined) return null;
      if (value instanceof ArrayBuffer) return value.slice(0);
      if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      return null;
    } catch (error) {
      throw wrapIdbError("get", error);
    }
  }

  async put(key, value, meta = {}) {
    ensureString(key, "key");
    const buffer = ensureBuffer(value, "value");
    const db = await this._db();
    try {
      const tx = db.transaction([STORE_TESSDATA, STORE_METADATA], "readwrite");
      tx.objectStore(STORE_TESSDATA).put(buffer, key);
      tx.objectStore(STORE_METADATA).put(
        {
          size: buffer.byteLength,
          sha256: typeof meta?.sha256 === "string" ? meta.sha256 : "",
          updatedAt: Date.now(),
        },
        key,
      );
      await awaitTransaction(tx);
    } catch (error) {
      throw wrapIdbError("put", error);
    }
  }

  async delete(key) {
    ensureString(key, "key");
    const db = await this._db();
    try {
      const tx = db.transaction([STORE_TESSDATA, STORE_METADATA], "readwrite");
      tx.objectStore(STORE_TESSDATA).delete(key);
      tx.objectStore(STORE_METADATA).delete(key);
      await awaitTransaction(tx);
      return true;
    } catch (error) {
      throw wrapIdbError("delete", error);
    }
  }

  async list() {
    const db = await this._db();
    try {
      const tx = db.transaction(STORE_METADATA, "readonly");
      const store = tx.objectStore(STORE_METADATA);
      const keys = await awaitRequest(store.getAllKeys());
      const values = await awaitRequest(store.getAll());
      const entries = keys.map((key, index) => ({
        key: String(key),
        size: values[index]?.size ?? 0,
        sha256: values[index]?.sha256 ?? "",
        updatedAt: values[index]?.updatedAt ?? 0,
      }));
      return entries.sort((a, b) => a.key.localeCompare(b.key));
    } catch (error) {
      throw wrapIdbError("list", error);
    }
  }

  async clear() {
    const db = await this._db();
    try {
      const tx = db.transaction([STORE_TESSDATA, STORE_METADATA], "readwrite");
      tx.objectStore(STORE_TESSDATA).clear();
      tx.objectStore(STORE_METADATA).clear();
      await awaitTransaction(tx);
    } catch (error) {
      throw wrapIdbError("clear", error);
    }
  }
}
