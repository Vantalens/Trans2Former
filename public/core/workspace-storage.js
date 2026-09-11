const DB_NAME = "trans2former.workspace";
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";
const FALLBACK_KEY = "trans2former.workspace.snapshot";
const SCHEMA_VERSION = 1;

function hasIndexedDb() {
  return typeof globalThis.indexedDB?.open === "function";
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地工作区缓存"));
  });
}

function runStoreRequest(mode, operation) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地工作区缓存操作失败"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error || new Error("本地工作区缓存事务失败"));
  }));
}

function readFallback() {
  try {
    const raw = globalThis.localStorage?.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeFallback(snapshot) {
  try {
    globalThis.localStorage?.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || typeof snapshot.content !== "string") return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    fileName: String(snapshot.fileName || "document"),
    fromFormat: String(snapshot.fromFormat || "md"),
    toFormat: String(snapshot.toFormat || "html"),
    content: snapshot.content,
    savedAt: Number(snapshot.savedAt) || Date.now(),
  };
}

export async function saveWorkspaceSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) return false;
  if (hasIndexedDb()) {
    try {
      await runStoreRequest("readwrite", (store) => store.put(normalized, SNAPSHOT_KEY));
      return true;
    } catch {
      // Continue to the small localStorage fallback for private windows or
      // browsers that expose IndexedDB but reject its quota.
    }
  }
  return writeFallback(normalized);
}

export async function readWorkspaceSnapshot() {
  let snapshot = null;
  if (hasIndexedDb()) {
    try {
      snapshot = await runStoreRequest("readonly", (store) => store.get(SNAPSHOT_KEY));
    } catch {
      snapshot = null;
    }
  }
  return normalizeSnapshot(snapshot || readFallback());
}

export async function clearWorkspaceSnapshot() {
  if (hasIndexedDb()) {
    try {
      await runStoreRequest("readwrite", (store) => store.delete(SNAPSHOT_KEY));
    } catch {
      // The fallback is still cleared below.
    }
  }
  try {
    globalThis.localStorage?.removeItem(FALLBACK_KEY);
  } catch {
    // ignore storage cleanup failures
  }
}

export const WORKSPACE_STORAGE_CONSTANTS = Object.freeze({
  DB_NAME,
  STORE_NAME,
  SNAPSHOT_KEY,
  FALLBACK_KEY,
  SCHEMA_VERSION,
});
