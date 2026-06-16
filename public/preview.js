import { readPreviewPayload, clearPreviewPayload } from "./router.js";
import {
  renderPreviewHtml,
  toDocumentModel,
} from "./browser-transformer.js";
import { renderMathIn } from "./katex-render.js";

const TEXT_LIKE_FORMATS = new Set(["md", "html", "txt", "json", "csv", "xml"]);
const IMAGE_FORMATS = new Set(["png"]);
const PDF_FORMATS = new Set(["pdf"]);
const READER_FALLBACK_FORMATS = new Set(["docx", "doc", "xlsx", "epub", "pptx", "ofd"]);

const stage = document.getElementById("previewStage");
const titleEl = document.getElementById("previewTitle");
const subtitleEl = document.getElementById("previewSubtitle");
const downloadButton = document.getElementById("previewDownloadButton");
const zoomControls = document.getElementById("previewZoomControls");
const zoomLevelEl = document.getElementById("previewZoomLevel");

const params = new URLSearchParams(window.location.search);
const taskId = params.get("taskId");
let payload = null;
let createdBlobUrls = [];
let zoomState = { value: 1, target: null };

function trackBlobUrl(url) {
  if (typeof url === "string" && url.startsWith("blob:")) createdBlobUrls.push(url);
  return url;
}

function clearStage() {
  if (!stage) return;
  stage.innerHTML = "";
}

function setTitle(name, sub) {
  if (titleEl) titleEl.textContent = name || "独立预览";
  if (subtitleEl) subtitleEl.textContent = sub || "";
  document.title = name ? `${name} · Trans2Former 预览` : "Trans2Former · 独立预览";
}

function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return null;
  const meta = dataUrl.slice(5, commaIdx);
  const isBase64 = meta.includes(";base64");
  const mime = meta.replace(/;base64.*$/, "") || "application/octet-stream";
  const rawPayload = dataUrl.slice(commaIdx + 1);
  try {
    if (isBase64) {
      const bytes = Uint8Array.from(atob(rawPayload), (ch) => ch.charCodeAt(0));
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(rawPayload)], { type: mime });
  } catch (error) {
    return null;
  }
}

function ensureBlobUrl(value, mime) {
  if (!value) return "";
  if (typeof value === "string" && value.startsWith("blob:")) return value;
  if (typeof value === "string" && value.startsWith("data:")) {
    const blob = dataUrlToBlob(value);
    if (blob) {
      const url = URL.createObjectURL(blob);
      return trackBlobUrl(url);
    }
  }
  if (typeof value === "string") {
    const blob = new Blob([value], { type: mime || "application/octet-stream" });
    return trackBlobUrl(URL.createObjectURL(blob));
  }
  return "";
}

function renderError(message) {
  clearStage();
  const wrap = document.createElement("div");
  wrap.className = "preview-error";
  wrap.textContent = message;
  stage.appendChild(wrap);
}

function renderFallback(format) {
  clearStage();
  const wrap = document.createElement("div");
  wrap.className = "preview-fallback";
  wrap.innerHTML = `
    <h2>暂无可视化预览</h2>
    <p>当前输出格式 <code>${(format || "未知").toUpperCase()}</code> 暂未提供独立预览渲染，可直接下载文件后用本地应用打开。</p>
  `;
  stage.appendChild(wrap);
}

function renderTextLike(content, format) {
  clearStage();
  const wrap = document.createElement("article");
  wrap.className = "preview-canvas preview-markdown";
  try {
    wrap.innerHTML = renderPreviewHtml(content, format, payload?.source?.fileName || "preview");
    renderMathIn(wrap);
  } catch (error) {
    wrap.textContent = String(content || "");
  }
  stage.appendChild(wrap);
}

function renderPdf(blobUrl) {
  clearStage();
  const frame = document.createElement("iframe");
  frame.className = "preview-pdf-frame";
  frame.title = "PDF 预览";
  frame.src = blobUrl;
  stage.appendChild(frame);
  zoomControls.hidden = false;
  zoomState.target = frame;
  zoomState.value = 1;
  updateZoomLevel();
}

function renderImage(blobUrl) {
  clearStage();
  const host = document.createElement("div");
  host.className = "preview-image-host";
  const img = document.createElement("img");
  img.className = "preview-image";
  img.alt = payload?.source?.fileName || "图片预览";
  img.src = blobUrl;
  host.appendChild(img);
  stage.appendChild(host);
  zoomControls.hidden = false;
  zoomState.target = img;
  zoomState.value = 1;
  updateZoomLevel();

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  host.addEventListener("wheel", (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    applyZoom(zoomState.value + delta);
  }, { passive: false });
  img.addEventListener("mousedown", (event) => {
    isDragging = true;
    startX = event.clientX - offsetX;
    startY = event.clientY - offsetY;
    img.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    offsetX = event.clientX - startX;
    offsetY = event.clientY - startY;
    applyTransform();
  });
  window.addEventListener("mouseup", () => {
    isDragging = false;
    img.style.cursor = "grab";
  });
  img.style.cursor = "grab";

  function applyTransform() {
    img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoomState.value})`;
  }
  img._applyTransform = applyTransform;
}

function applyZoom(value) {
  const clamped = Math.max(0.25, Math.min(4, value));
  zoomState.value = clamped;
  if (zoomState.target?._applyTransform) {
    zoomState.target._applyTransform();
  } else if (zoomState.target?.style) {
    zoomState.target.style.transform = `scale(${clamped})`;
    zoomState.target.style.transformOrigin = "center top";
  }
  updateZoomLevel();
}

function updateZoomLevel() {
  if (!zoomLevelEl) return;
  zoomLevelEl.textContent = `${Math.round(zoomState.value * 100)}%`;
}

function attachZoomHandlers() {
  zoomControls.addEventListener("click", (event) => {
    const action = event.target?.dataset?.zoom;
    if (!action) return;
    if (action === "in") applyZoom(zoomState.value + 0.1);
    else if (action === "out") applyZoom(zoomState.value - 0.1);
    else if (action === "reset") applyZoom(1);
  });
}

function renderBinaryViaReader(output) {
  const format = output?.format || "";
  if (!READER_FALLBACK_FORMATS.has(format)) return false;
  if (!output?.blobUrl) return false;
  return fetch(output.blobUrl)
    .then((response) => response.arrayBuffer())
    .then((buffer) => {
      const dataUrl = bufferToDataUrl(buffer, output.mime || "application/octet-stream");
      const model = toDocumentModel(dataUrl, format, payload?.source?.fileName || "preview");
      clearStage();
      const wrap = document.createElement("article");
      wrap.className = "preview-canvas preview-markdown";
      wrap.innerHTML = renderPreviewHtml(dataUrl, format, payload?.source?.fileName || "preview");
      if (!wrap.innerHTML || wrap.innerHTML.trim() === "") {
        wrap.innerHTML = `<pre>${escapeHtml(JSON.stringify(model, null, 2).slice(0, 8000))}</pre>`;
      }
      stage.appendChild(wrap);
      return true;
    })
    .catch((error) => {
      renderFallback(format);
      console.warn("Binary reader fallback failed:", error);
      return false;
    });
}

function bufferToDataUrl(buffer, mime) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mime || "application/octet-stream"};base64,${btoa(binary)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attachDownload(output) {
  if (!downloadButton) return;
  let downloadHref = "";
  let downloadName = "";
  const baseName = payload?.source?.fileName?.replace(/\.[^.]+$/, "") || "trans2former-output";
  const ext = output?.format ? `.${output.format}` : "";
  if (output?.blobUrl) {
    downloadHref = output.blobUrl;
    downloadName = `${baseName}${ext}`;
  } else if (output?.text) {
    const blob = new Blob([output.text], { type: output.mime || "text/plain;charset=utf-8" });
    downloadHref = trackBlobUrl(URL.createObjectURL(blob));
    downloadName = `${baseName}${ext}`;
  }
  if (!downloadHref) {
    downloadButton.disabled = true;
    return;
  }
  downloadButton.disabled = false;
  downloadButton.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = downloadHref;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

function dispatchRender(payload) {
  const output = payload?.output || {};
  const format = output.format || "";
  setTitle(payload?.source?.fileName || "独立预览", `${(format || "").toUpperCase()} · ${output.mime || ""}`);

  if (PDF_FORMATS.has(format)) {
    const url = output.blobUrl || ensureBlobUrl(output.text, "application/pdf");
    if (url) renderPdf(url);
    else renderFallback(format);
    return;
  }
  if (IMAGE_FORMATS.has(format)) {
    const url = output.blobUrl || ensureBlobUrl(output.text, output.mime || "image/png");
    if (url) renderImage(url);
    else renderFallback(format);
    return;
  }
  if (TEXT_LIKE_FORMATS.has(format)) {
    renderTextLike(output.text || "", format);
    return;
  }
  if (READER_FALLBACK_FORMATS.has(format) && output.blobUrl) {
    renderBinaryViaReader(output);
    return;
  }
  if (output.text) {
    renderTextLike(output.text, format || "txt");
    return;
  }
  renderFallback(format);
}

function attachGlobalShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      window.location.href = "/#/workbench";
    }
  });
  for (const link of document.querySelectorAll("[data-preview-back]")) {
    link.addEventListener("click", () => {
      if (taskId) clearPreviewPayload(taskId);
    });
  }
}

function cleanupBlobUrls() {
  for (const url of createdBlobUrls) {
    try { URL.revokeObjectURL(url); } catch (error) { /* ignore */ }
  }
  createdBlobUrls = [];
}

function bootstrap() {
  attachZoomHandlers();
  attachGlobalShortcuts();
  window.addEventListener("beforeunload", cleanupBlobUrls);

  if (!taskId) {
    renderError("预览链接缺少 taskId，无法读取数据。请从工作台重新打开。");
    return;
  }
  payload = readPreviewPayload(taskId);
  if (!payload) {
    renderError("预览数据不存在或已过期。请返回工作台重新打开预览。");
    return;
  }
  try {
    dispatchRender(payload);
    attachDownload(payload.output);
  } catch (error) {
    console.error(error);
    renderError(`渲染预览失败：${error?.message || error}`);
  }
}

bootstrap();
