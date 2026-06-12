import {
  defaultModelCache,
  defaultOCRStorage,
  STATUS_AVAILABLE,
  STATUS_DEGRADED,
  STATUS_NOT_DOWNLOADED,
  STATUS_VERIFYING,
  getStatusLabel,
  getTaskLabel,
  listKnownTaskLabels,
  markTesseractVendorReady,
  clearSeededTessdata,
  sha256Hex,
  tesseractOCREngine,
  paddleOcrEngine,
  markPaddleOcrVendorReady,
  PADDLE_OCR_MODEL_FILES,
  PADDLE_OCR_REQUIRED_FILES,
  getPaddleVendorFileSpec,
  verifyPaddleVendorFile,
} from "/browser-transformer.js";

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

  renderModelCache(dialog);
}

function renderModelCache(dialog) {
  const card = dialog.querySelector(".model-cache-card");
  if (!card) return;
  const table = card.querySelector("[data-model-cache-table]");
  const summary = card.querySelector("[data-model-cache-summary]");
  if (!table) return;

  table.innerHTML = "";
  const entries = defaultModelCache.listManifests();
  if (entries.length === 0) {
    table.dataset.empty = "true";
    table.textContent = "尚未注册模型清单，将在 P9-A OCR 基线启动时填充。当前默认安装包不包含任何 GB 级模型。";
  } else {
    table.dataset.empty = "false";
    const list = document.createElement("ul");
    list.className = "model-cache-list";
    for (const entry of entries) {
      const li = document.createElement("li");
      li.className = "model-cache-row";
      li.dataset.status = entry.status;
      const headerHtml = `
        <div class="model-cache-row-main">
          <strong>${getTaskLabel(entry.manifest.task)}</strong>
          <span class="model-cache-engine">${entry.manifest.engine} · ${entry.manifest.modelVersion}</span>
        </div>
        <div class="model-cache-row-meta">
          <span class="model-cache-status" data-status="${entry.status}">${getStatusLabel(entry.status)}</span>
          <span class="model-cache-size">${formatBundleSize(entry.manifest.bundleSize)}</span>
        </div>
      `;
      const actionsHtml = entry.manifest.task === "ocr-text" && entry.manifest.engine === "tesseract"
        ? renderTesseractActions(entry)
        : (entry.manifest.task === "ocr-text" && entry.manifest.engine === "paddleocr"
          ? renderPaddleActions(entry)
          : "");
      li.innerHTML = headerHtml + actionsHtml;
      list.appendChild(li);
    }
    table.appendChild(list);
  }

  if (summary) {
    const labels = listKnownTaskLabels().map((entry) => entry.label).join(" / ");
    summary.textContent = `规划任务：${labels}。模型资源不进入默认安装包，启用时本地导入到 model-cache 目录并执行 SHA-256 校验。`;
  }
}

function renderTesseractActions(entry) {
  const ready = entry.status === STATUS_AVAILABLE;
  return `
    <div class="model-cache-row-actions">
      <button class="mini-button model-cache-import-button" data-import-tessdata data-manifest-id="${entry.manifestId}" data-language="chi_sim" type="button">导入 chi_sim.traineddata</button>
      <button class="mini-button model-cache-import-button" data-import-tessdata data-manifest-id="${entry.manifestId}" data-language="eng" type="button">导入 eng.traineddata</button>
      <button class="mini-button model-cache-clear-button" data-clear-tessdata data-manifest-id="${entry.manifestId}" type="button" ${ready ? "" : "disabled"}>清除缓存</button>
    </div>
  `;
}

function renderPaddleActions(entry) {
  const ready = entry.status === STATUS_AVAILABLE;
  const importButtons = PADDLE_OCR_MODEL_FILES.map((file) =>
    `<button class="mini-button model-cache-import-button" data-import-paddle data-manifest-id="${entry.manifestId}" data-file="${file}" type="button">导入 ${file}</button>`,
  ).join("");
  return `
    <div class="model-cache-row-actions">
      ${importButtons}
      <button class="mini-button model-cache-clear-button" data-clear-paddle data-manifest-id="${entry.manifestId}" type="button" ${ready ? "" : "disabled"}>清除缓存</button>
    </div>
  `;
}

function setStatusMessage(dialog, text, level = "info") {
  const target = dialog.querySelector("[data-model-cache-status]");
  if (!target) return;
  if (!text) {
    target.hidden = true;
    target.textContent = "";
    target.dataset.level = "";
    return;
  }
  target.hidden = false;
  target.textContent = text;
  target.dataset.level = level;
}

async function importTessdata(dialog, button) {
  const language = button.dataset.language || "chi_sim";
  const manifestId = button.dataset.manifestId;
  const fileInput = dialog.querySelector("#modelCacheFileInput");
  if (!fileInput) {
    setStatusMessage(dialog, "无法找到文件选择器", "error");
    return;
  }
  await new Promise((resolve) => {
    const handler = async () => {
      fileInput.removeEventListener("change", handler);
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) {
        resolve();
        return;
      }
      try {
        defaultModelCache.setStatus(manifestId, STATUS_VERIFYING, { message: `校验 ${file.name}…` });
        setStatusMessage(dialog, `正在校验 ${file.name} (${(file.size / 1024).toFixed(0)} KB)…`, "info");
        const buffer = await file.arrayBuffer();
        const sha256 = await sha256Hex(buffer);
        await defaultOCRStorage.put(`tesseract/${language}.traineddata`, buffer, { sha256 });
        if (typeof tesseractOCREngine.ensureProbe === "function") {
          await tesseractOCREngine.ensureProbe();
        }
        markTesseractVendorReady(true);
        defaultModelCache.setStatus(manifestId, STATUS_AVAILABLE, {
          message: `已导入 ${language} (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB, sha256=${sha256.slice(0, 12)}…)`,
          language,
          sha256,
          size: buffer.byteLength,
        });
        setStatusMessage(dialog, `${language}.traineddata 已就绪 (sha256=${sha256.slice(0, 12)}…)`, "success");
      } catch (error) {
        defaultModelCache.setStatus(manifestId, STATUS_NOT_DOWNLOADED, {
          message: `导入失败：${error?.message || error}`,
        });
        setStatusMessage(dialog, `导入 ${language} 失败：${error?.message || error}`, "error");
      }
      resolve();
    };
    fileInput.addEventListener("change", handler);
    fileInput.click();
  });
}

async function clearTessdata(dialog, button) {
  const manifestId = button.dataset.manifestId;
  try {
    for (const language of ["chi_sim", "eng"]) {
      await defaultOCRStorage.delete(`tesseract/${language}.traineddata`);
      await clearSeededTessdata(language);
    }
    if (typeof tesseractOCREngine.ensureProbe === "function") {
      await tesseractOCREngine.ensureProbe();
    }
    defaultModelCache.setStatus(manifestId, STATUS_NOT_DOWNLOADED, {
      message: "已清除本地 tessdata；下次启用 OCR 需要重新导入。",
    });
    setStatusMessage(dialog, "tessdata 已清除", "info");
  } catch (error) {
    setStatusMessage(dialog, `清除失败：${error?.message || error}`, "error");
  }
}

async function importPaddleModel(dialog, button) {
  const file = button.dataset.file || "det.onnx";
  const manifestId = button.dataset.manifestId;
  const fileInput = dialog.querySelector("#modelCacheFileInput");
  if (!fileInput) {
    setStatusMessage(dialog, "无法找到文件选择器", "error");
    return;
  }
  await new Promise((resolve) => {
    const handler = async () => {
      fileInput.removeEventListener("change", handler);
      const picked = fileInput.files?.[0];
      fileInput.value = "";
      if (!picked) {
        resolve();
        return;
      }
      try {
        defaultModelCache.setStatus(manifestId, STATUS_VERIFYING, { message: `校验 ${picked.name}…` });
        setStatusMessage(dialog, `正在校验 ${picked.name} (${(picked.size / 1024).toFixed(0)} KB)…`, "info");
        const buffer = await picked.arrayBuffer();
        const sha256 = await sha256Hex(buffer);
        const knownSpec = getPaddleVendorFileSpec(file);
        if (knownSpec) {
          await verifyPaddleVendorFile(file, buffer);
        }
        await defaultOCRStorage.put(`paddleocr/v5/${file}`, buffer, { sha256 });
        // 先置位 vendor-ready（用户已选用 PP-OCRv5），再 probe；否则 ensureProbe 在 vendor
        // 未置位时恒返回 false，状态永远翻不过去。真正的 onnxruntime 运行时加载仍在
        // recognize() 时把关。对齐 paddle-default-models.js / tesseract 导入流程的顺序。
        markPaddleOcrVendorReady(true);
        const ready = typeof paddleOcrEngine.ensureProbe === "function"
          ? await paddleOcrEngine.ensureProbe()
          : false;
        if (ready) {
          defaultModelCache.setStatus(manifestId, STATUS_AVAILABLE, {
            message: `PP-OCRv5 必选资产 (${PADDLE_OCR_REQUIRED_FILES.join("/")}) 就位 (最近导入 ${file}, ${knownSpec ? "SHA-256 已匹配清单" : `sha256=${sha256.slice(0, 12)}…`})`,
            file,
            sha256,
            size: buffer.byteLength,
          });
          setStatusMessage(dialog, `${file} 已导入，PP-OCRv5 必选资产齐全 ✅（cls 可选）`, "success");
        } else {
          const missing = await missingPaddleFiles();
          defaultModelCache.setStatus(manifestId, STATUS_VERIFYING, {
            message: `已导入 ${file}；还需导入：${missing.join(", ") || "(无)"}`,
          });
          setStatusMessage(dialog, `${file} 已导入；还需导入：${missing.join(", ")}`, "info");
        }
      } catch (error) {
        defaultModelCache.setStatus(manifestId, error?.code === "MODEL_CHECKSUM_MISMATCH" ? STATUS_DEGRADED : STATUS_NOT_DOWNLOADED, {
          message: `导入失败：${error?.message || error}`,
        });
        setStatusMessage(dialog, `导入 ${file} 失败：${error?.message || error}`, "error");
      }
      resolve();
    };
    fileInput.addEventListener("change", handler);
    fileInput.click();
  });
}

async function missingPaddleFiles() {
  // 只报必选缺失（PADDLE_OCR_REQUIRED_FILES 驱动）；cls 为可选，不算缺。
  const missing = [];
  for (const file of PADDLE_OCR_REQUIRED_FILES) {
    if (!(await defaultOCRStorage.has(`paddleocr/v5/${file}`))) missing.push(file);
  }
  return missing;
}

async function clearPaddleModels(dialog, button) {
  const manifestId = button.dataset.manifestId;
  try {
    for (const file of PADDLE_OCR_MODEL_FILES) {
      await defaultOCRStorage.delete(`paddleocr/v5/${file}`);
    }
    if (typeof paddleOcrEngine.ensureProbe === "function") {
      await paddleOcrEngine.ensureProbe();
    }
    defaultModelCache.setStatus(manifestId, STATUS_NOT_DOWNLOADED, {
      message: `已清除本地 PP-OCRv5 资产；下次启用需重新导入 ${PADDLE_OCR_REQUIRED_FILES.join("/")}（cls 可选）。`,
    });
    setStatusMessage(dialog, "PP-OCRv5 模型已清除", "info");
  } catch (error) {
    setStatusMessage(dialog, `清除失败：${error?.message || error}`, "error");
  }
}

function formatBundleSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "未声明体积";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[idx]}`;
}

function init() {
  const dialog = document.getElementById("securityCenterDialog");
  const button = document.getElementById("securityCenterButton");
  if (!dialog || !button) return;

  const refresh = () => render(dialog);
  listeners.add(refresh);
  defaultModelCache.onChange(refresh);

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

  dialog.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("[data-import-tessdata]")) {
      event.preventDefault();
      importTessdata(dialog, target);
    } else if (target.matches("[data-clear-tessdata]")) {
      event.preventDefault();
      clearTessdata(dialog, target);
    } else if (target.matches("[data-import-paddle]")) {
      event.preventDefault();
      importPaddleModel(dialog, target);
    } else if (target.matches("[data-clear-paddle]")) {
      event.preventDefault();
      clearPaddleModels(dialog, target);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
