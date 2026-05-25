const ORIGIN = location.origin;
const externalRequests = [];
let interceptMode = "off";
const listeners = new Set();

function isExternal(url) {
  try {
    return new URL(url, location.href).origin !== ORIGIN;
  } catch {
    return false;
  }
}

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {}
  }
}

function recordRequest(url, type) {
  const external = isExternal(url);
  const entry = {
    url: String(url || ""),
    type,
    ts: Date.now(),
    blocked: external && interceptMode === "block",
  };
  if (external) {
    externalRequests.push(entry);
    notify();
  }
  return entry;
}

if (typeof window.fetch === "function") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const entry = recordRequest(url, "fetch");
    if (entry.blocked) {
      return Promise.reject(new Error(`Trans2Former 安全中心已拦截外部请求: ${url}`));
    }
    return originalFetch(input, init);
  };
}

if (typeof window.XMLHttpRequest === "function") {
  const proto = window.XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;
  proto.open = function patchedOpen(method, url, ...rest) {
    this.__t2fSecurityUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  proto.send = function patchedSend(body) {
    const url = this.__t2fSecurityUrl || "";
    const entry = recordRequest(url, "xhr");
    if (entry.blocked) {
      const message = `Trans2Former 安全中心已拦截外部请求: ${url}`;
      queueMicrotask(() => {
        try {
          this.dispatchEvent(new Event("error"));
          this.dispatchEvent(new Event("loadend"));
        } catch {}
      });
      throw new Error(message);
    }
    return originalSend.call(this, body);
  };
}

window.addEventListener("online", notify);
window.addEventListener("offline", notify);

function snapshotResources() {
  const entries = typeof performance.getEntriesByType === "function"
    ? performance.getEntriesByType("resource")
    : [];
  const externalResources = [];
  const sameOriginByType = new Map();
  for (const entry of entries) {
    if (isExternal(entry.name)) {
      externalResources.push({
        url: entry.name,
        type: entry.initiatorType || "other",
      });
    } else {
      const type = entry.initiatorType || "other";
      sameOriginByType.set(type, (sameOriginByType.get(type) || 0) + 1);
    }
  }
  return { externalResources, sameOriginByType };
}

function dedupeExternal(externalResources, runtimeRecords) {
  const merged = new Map();
  for (const item of externalResources) {
    const key = `resource|${item.url}`;
    merged.set(key, { url: item.url, type: item.type, source: "resource", blocked: false });
  }
  for (const item of runtimeRecords) {
    const key = `${item.blocked ? "blocked" : "runtime"}|${item.url}|${item.type}`;
    if (!merged.has(key)) {
      merged.set(key, { url: item.url, type: item.type, source: "runtime", blocked: item.blocked });
    }
  }
  return Array.from(merged.values());
}

const MODE_LABEL = {
  off: "未启用",
  audit: "审计中",
  block: "拦截中",
};

function render(dialog) {
  const onlineEl = dialog.querySelector("[data-sec-online]");
  const modeBadge = dialog.querySelector("[data-sec-mode-badge]");
  const modeSelect = dialog.querySelector("[data-sec-mode]");
  const externalList = dialog.querySelector("[data-sec-external]");
  const externalCount = dialog.querySelector("[data-sec-external-count]");
  const sameOriginList = dialog.querySelector("[data-sec-same-origin]");

  const { externalResources, sameOriginByType } = snapshotResources();
  const externals = dedupeExternal(externalResources, externalRequests);

  if (onlineEl) {
    onlineEl.textContent = navigator.onLine ? "在线" : "离线";
    onlineEl.dataset.state = navigator.onLine ? "online" : "offline";
  }
  if (modeBadge) {
    modeBadge.textContent = MODE_LABEL[interceptMode] || "未启用";
    modeBadge.dataset.mode = interceptMode;
  }
  if (modeSelect && modeSelect.value !== interceptMode) {
    modeSelect.value = interceptMode;
  }
  if (externalCount) {
    externalCount.textContent = String(externals.length);
  }

  if (externalList) {
    externalList.innerHTML = "";
    if (externals.length === 0) {
      externalList.dataset.empty = "true";
      externalList.textContent = "未观察到任何外部域名请求 · local-only 验证通过";
    } else {
      externalList.dataset.empty = "false";
      for (const item of externals) {
        const li = document.createElement("li");
        const suffix = item.blocked ? " · 已拦截" : item.source === "runtime" ? " · 运行时" : "";
        li.textContent = `[${item.type}] ${item.url}${suffix}`;
        if (item.blocked) {
          li.classList.add("is-blocked");
        }
        externalList.appendChild(li);
      }
    }
  }

  if (sameOriginList) {
    sameOriginList.innerHTML = "";
    if (sameOriginByType.size === 0) {
      sameOriginList.dataset.empty = "true";
      sameOriginList.textContent = "暂无加载记录";
    } else {
      sameOriginList.dataset.empty = "false";
      const sorted = Array.from(sameOriginByType.entries()).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sorted) {
        const li = document.createElement("li");
        li.textContent = `${type} × ${count}`;
        sameOriginList.appendChild(li);
      }
    }
  }
}

function init() {
  const dialog = document.getElementById("securityCenterDialog");
  const button = document.getElementById("securityCenterButton");
  if (!dialog || !button) return;

  const refresh = () => render(dialog);
  listeners.add(refresh);

  button.addEventListener("click", () => {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    refresh();
  });

  dialog.querySelectorAll("[data-sec-close]").forEach((node) => {
    node.addEventListener("click", () => {
      dialog.close();
    });
  });

  dialog.querySelector("[data-sec-refresh]")?.addEventListener("click", refresh);

  const modeSelect = dialog.querySelector("[data-sec-mode]");
  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      interceptMode = modeSelect.value;
      notify();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
