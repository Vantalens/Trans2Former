const VIEW_LANDING = "landing";
const VIEW_WORKBENCH = "workbench";
const KNOWN_VIEWS = new Set([VIEW_LANDING, VIEW_WORKBENCH]);

const PREVIEW_PAYLOAD_PREFIX = "trans2former:preview:";
const PREVIEW_PAYLOAD_TTL_MS = 30 * 60 * 1000;

let attachedListeners = false;
let cachedSections = null;

function parseHash(hash) {
  const trimmed = String(hash || "").replace(/^#\/?/, "").trim();
  if (!trimmed) return VIEW_LANDING;
  const first = trimmed.split("/")[0].toLowerCase();
  return KNOWN_VIEWS.has(first) ? first : VIEW_LANDING;
}

function querySections() {
  if (cachedSections && document.body.contains(cachedSections.landing) && document.body.contains(cachedSections.workbench)) {
    return cachedSections;
  }
  cachedSections = {
    landing: document.querySelector('[data-view="landing"]'),
    workbench: document.querySelector('[data-view="workbench"]'),
  };
  return cachedSections;
}

function applyView(view) {
  const { landing, workbench } = querySections();
  if (!landing || !workbench) return;
  const target = KNOWN_VIEWS.has(view) ? view : VIEW_LANDING;
  if (target === VIEW_LANDING) {
    landing.hidden = false;
    landing.classList.add("is-active");
    workbench.hidden = true;
    workbench.classList.remove("is-active");
    document.body.dataset.activeView = VIEW_LANDING;
  } else {
    workbench.hidden = false;
    workbench.classList.add("is-active");
    landing.hidden = true;
    landing.classList.remove("is-active");
    document.body.dataset.activeView = VIEW_WORKBENCH;
  }
  document.dispatchEvent(new CustomEvent("t2f:viewchange", { detail: { view: target } }));
}

export function getCurrentView() {
  return parseHash(window.location.hash);
}

export function navigate(view) {
  const target = KNOWN_VIEWS.has(view) ? view : VIEW_LANDING;
  const desired = target === VIEW_LANDING ? "#/" : `#/${target}`;
  if (window.location.hash === desired) {
    applyView(target);
    return;
  }
  window.location.hash = desired;
}

export function onViewChange(callback) {
  if (typeof callback !== "function") return () => {};
  const handler = (event) => callback(event.detail?.view || getCurrentView());
  document.addEventListener("t2f:viewchange", handler);
  return () => document.removeEventListener("t2f:viewchange", handler);
}

export function initRouter() {
  if (attachedListeners) {
    applyView(getCurrentView());
    return;
  }
  attachedListeners = true;
  window.addEventListener("hashchange", () => applyView(getCurrentView()));
  applyView(getCurrentView());
}

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function generateTaskId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function tryStorageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

export function writePreviewPayload(payload) {
  // 写入前清理过期/超量的预览 payload，防止 localStorage 累积耗尽配额（issue #63）
  cleanupStalePreviewPayloads();

  const taskId = payload?.taskId || generateTaskId();
  const enveloped = JSON.stringify({ ...payload, taskId, createdAt: Date.now() });
  const key = `${PREVIEW_PAYLOAD_PREFIX}${taskId}`;
  if (tryStorageSet(window.localStorage, key, enveloped)) return taskId;
  if (tryStorageSet(window.sessionStorage, key, enveloped)) return taskId;
  throw new Error("Unable to persist preview payload: localStorage and sessionStorage both rejected the write (likely quota exceeded).");
}

// 清理过期和超量的预览 payload（issue #63）
function cleanupStalePreviewPayloads() {
  const now = Date.now();
  const storages = [window.localStorage, window.sessionStorage];
  const MAX_PAYLOADS = 5; // 最多保留5个最新的 payload

  for (const storage of storages) {
    try {
      const entries = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(PREVIEW_PAYLOAD_PREFIX)) {
          try {
            const raw = storage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            const createdAt = parsed?.createdAt || 0;
            entries.push({ key, createdAt });
          } catch (error) {
            // 损坏的条目直接删除
            storage.removeItem(key);
          }
        }
      }

      // 删除过期条目
      for (const entry of entries) {
        if (now - entry.createdAt > PREVIEW_PAYLOAD_TTL_MS) {
          storage.removeItem(entry.key);
        }
      }

      // 如果还有太多条目，只保留最新的 MAX_PAYLOADS 个
      const remaining = entries.filter(e => now - e.createdAt <= PREVIEW_PAYLOAD_TTL_MS);
      if (remaining.length > MAX_PAYLOADS) {
        remaining.sort((a, b) => a.createdAt - b.createdAt); // 旧的在前
        const toDelete = remaining.slice(0, remaining.length - MAX_PAYLOADS);
        for (const entry of toDelete) {
          storage.removeItem(entry.key);
        }
      }
    } catch (error) {
      // 扫描失败不影响后续写入尝试
      console.warn("[router] Failed to cleanup stale preview payloads:", error);
    }
  }
}

export function readPreviewPayload(taskId) {
  if (!taskId) return null;
  const key = `${PREVIEW_PAYLOAD_PREFIX}${taskId}`;
  const raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.createdAt && Date.now() - parsed.createdAt > PREVIEW_PAYLOAD_TTL_MS) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

export function clearPreviewPayload(taskId) {
  if (!taskId) return;
  const key = `${PREVIEW_PAYLOAD_PREFIX}${taskId}`;
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
}

export function openPreview(payload) {
  const taskId = writePreviewPayload(payload || {});
  const url = `/preview.html?taskId=${encodeURIComponent(taskId)}`;
  if (isTauriRuntime()) {
    window.location.href = url;
  } else {
    const handle = window.open(url, "_blank", "noopener");
    if (!handle) {
      window.location.href = url;
    }
  }
  return taskId;
}

export const ROUTER_CONSTANTS = Object.freeze({
  VIEW_LANDING,
  VIEW_WORKBENCH,
  PREVIEW_PAYLOAD_PREFIX,
  PREVIEW_PAYLOAD_TTL_MS,
});
