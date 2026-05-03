import {
  convertContent as convertInBrowser,
  detectFormatFromName,
  getFormatCapabilities,
  getOutputExtension,
  renderPreviewHtml,
  toDocumentModel,
} from "./browser-transformer.js";
import { normalizeConversionError } from "./core/conversion-error.js";
import {
  buildExportFileName as buildWorkbenchExportFileName,
  createQueueItem as createWorkbenchQueueItem,
  summarizeQualityReport,
} from "./core/workbench-state.js";

const inputContent = document.getElementById("inputContent");
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const fileMeta = document.getElementById("fileMeta");
const statusText = document.getElementById("statusText");
const htmlPreview = document.getElementById("htmlPreview");
const pdfPreview = document.getElementById("pdfPreview");
const textOutputPreview = document.getElementById("textOutputPreview");
const openPdfPreviewButton = document.getElementById("openPdfPreviewButton");
const errorDetailsPanel = document.getElementById("errorDetailsPanel");
const errorDetailsSummary = document.getElementById("errorDetailsSummary");
const errorCategory = document.getElementById("errorCategory");
const errorCode = document.getElementById("errorCode");
const errorFormat = document.getElementById("errorFormat");
const errorMessageText = document.getElementById("errorMessageText");
const errorDebugText = document.getElementById("errorDebugText");
const copyErrorDiagnosticsButton = document.getElementById("copyErrorDiagnosticsButton");
const outputMeta = document.getElementById("outputMeta");
const autoPreviewCheckbox = document.getElementById("autoPreviewCheckbox");
const refreshPreviewButton = document.getElementById("refreshPreviewButton");
const transformButton = document.getElementById("transformButton");
const cancelTransformButton = document.getElementById("cancelTransformButton");
const downloadOutputButton = document.getElementById("downloadOutputButton");
const conversionProgress = document.getElementById("conversionProgress");
const progressStage = document.getElementById("progressStage");
const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");
const loadSampleButton = document.getElementById("loadSampleButton");
const fileQueueList = document.getElementById("fileQueueList");
const selectAllQueueButton = document.getElementById("selectAllQueueButton");
const retryFailedButton = document.getElementById("retryFailedButton");
const outputDirectoryButton = document.getElementById("outputDirectoryButton");
const exportNamingInput = document.getElementById("exportNamingInput");
const documentModelPreview = document.getElementById("documentModelPreview");
const warningsList = document.getElementById("warningsList");
const qualityReportList = document.getElementById("qualityReportList");
const diffSummary = document.getElementById("diffSummary");
const versionsList = document.getElementById("versionsList");
const pluginManagerButton = document.getElementById("pluginManagerButton");
const securityCenterButton = document.getElementById("securityCenterButton");
const workbenchTabs = document.getElementById("workbenchTabs");
const wordCountEl = document.getElementById("wordCount");
const lineCountEl = document.getElementById("lineCount");
const fromFormatSelect = document.getElementById("fromFormatSelect");
const toFormatSelect = document.getElementById("toFormatSelect");
const paperFormatSelect = document.getElementById("paperFormatSelect");

const formatCapabilities = getFormatCapabilities();

const BINARY_INPUT_FORMATS = new Set(["docx", "xlsx", "epub", "pptx", "pdf", "png"]);

const sampleMarkdown = `# 示例文档

这是一段可编辑内容。

- 支持多格式输入
- 支持实时预览
- 支持下载输出

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}\`;
}
\`\`\`
`;

let currentFileName = "document.md";
let currentOutputBlobUrl = "";
let currentPrintHtml = "";
let previewTimer = null;
let previewIdleHandle = null;
let lastRenderedPayload = "";
let autoPreviewEnabled = false;
let lastOutputIsPdf = false;
let convertWorker = null;
let convertJobSeq = 0;
let activeConversion = null;
let lastErrorDiagnostics = null;
let fileQueue = [];
let activeQueueItemId = "";
let outputDirectoryLabel = "浏览器下载目录";
let sessionVersions = [];

const PREVIEW_DEBOUNCE_MS = 300;
const LARGE_DOC_THRESHOLD = 12000;
const LARGE_FILE_PREVIEW_BYTES = 2 * 1024 * 1024;
const PROGRESS_STAGE_LABELS = {
  idle: "待命",
  read: "读取输入",
  parse: "解析内容",
  validate: "校验结构",
  convert: "转换格式",
  render: "渲染输出",
  package: "打包下载",
  complete: "转换完成",
  canceled: "已取消",
  error: "转换失败",
};

function scheduleIdleTask(callback, timeout = 900) {
  if (typeof window.requestIdleCallback === "function") {
    return { type: "idle", id: window.requestIdleCallback(callback, { timeout }) };
  }
  return { type: "timeout", id: window.setTimeout(callback, 0) };
}

function cancelIdleTask(handle) {
  if (!handle) {
    return;
  }
  if (handle.type === "idle" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle.id);
    return;
  }
  window.clearTimeout(handle.id);
}

function setStatus(message, type = "info") {
  statusText.textContent = message;
  statusText.dataset.type = type;
  if (type === "error") {
    statusText.style.color = "#b23a48";
  } else if (type === "success") {
    statusText.style.color = "#0f6d5f";
  } else {
    statusText.style.color = "#5d6875";
  }
}

function setFileMeta(message) {
  fileMeta.textContent = message;
}

function setOutputMeta(message) {
  outputMeta.textContent = message;
}

function formatFileSize(bytes) {
  if (!bytes) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function createQueueItem(file, detectedFormat) {
  return createWorkbenchQueueItem(file, detectedFormat);
}

function getActiveQueueItem() {
  return fileQueue.find((item) => item.id === activeQueueItemId) || null;
}

function updateActiveQueueItem(patch) {
  const item = getActiveQueueItem();
  if (!item) {
    return;
  }
  Object.assign(item, patch);
  renderFileQueue();
}

function renderFileQueue() {
  if (!fileQueueList) {
    return;
  }
  if (!fileQueue.length) {
    fileQueueList.innerHTML = '<div class="queue-empty">暂无队列文件</div>';
    return;
  }

  fileQueueList.replaceChildren(...fileQueue.map((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `queue-item${item.id === activeQueueItemId ? " is-active" : ""}`;
    row.dataset.queueId = item.id;
    const check = document.createElement("span");
    check.className = "queue-check";
    check.textContent = item.selected ? "✓" : "";
    const name = document.createElement("span");
    name.className = "queue-name";
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.className = "queue-meta";
    meta.textContent = `${item.format || "?"} · ${formatFileSize(item.size)}`;
    const status = document.createElement("span");
    status.className = "queue-status";
    status.dataset.status = item.status;
    status.textContent = item.status;
    row.append(check, name, meta, status);
    row.addEventListener("click", () => {
      activeQueueItemId = item.id;
      renderFileQueue();
    });
    return row;
  }));
}

function registerQueuedFile(file, detectedFormat) {
  const existing = fileQueue.find((item) => item.name === file.name && item.size === file.size);
  if (existing) {
    activeQueueItemId = existing.id;
    existing.selected = true;
    existing.format = detectedFormat || existing.format;
    renderFileQueue();
    return existing;
  }
  const item = createQueueItem(file, detectedFormat);
  fileQueue.push(item);
  activeQueueItemId = item.id;
  renderFileQueue();
  return item;
}

function selectAllQueueItems() {
  const shouldSelect = fileQueue.some((item) => !item.selected);
  fileQueue = fileQueue.map((item) => ({ ...item, selected: shouldSelect }));
  renderFileQueue();
}

function retryFailedQueueItems() {
  let retries = 0;
  fileQueue = fileQueue.map((item) => {
    if (item.status !== "failed") {
      return item;
    }
    retries += 1;
    return { ...item, selected: true, status: "queued", error: "" };
  });
  renderFileQueue();
  setStatus(retries ? `已将 ${retries} 个失败任务放回队列` : "没有失败任务可重试", retries ? "success" : "info");
}

async function chooseOutputDirectory() {
  if (window.showDirectoryPicker) {
    const directory = await window.showDirectoryPicker({ mode: "readwrite" });
    outputDirectoryLabel = directory.name || "已选择目录";
    setStatus(`输出目录：${outputDirectoryLabel}`, "success");
    return;
  }
  outputDirectoryLabel = "浏览器默认下载目录";
  setStatus("当前环境不支持目录授权，将使用浏览器下载目录", "info");
}

function buildExportFileName(extension) {
  return buildWorkbenchExportFileName({
    pattern: exportNamingInput.value,
    baseName: currentFileName,
    extension,
  });
}

function renderDocumentModelPanel(model = null) {
  if (!documentModelPreview) {
    return;
  }
  if (!model) {
    documentModelPreview.textContent = "等待输入结构";
    return;
  }
  documentModelPreview.textContent = JSON.stringify({
    schemaVersion: model.schemaVersion,
    title: model.title,
    blocks: model.blocks,
    assets: model.assets,
    metadata: model.metadata,
  }, null, 2);
}

function renderBottomReports(model = null, output = "") {
  if (!warningsList || !qualityReportList || !diffSummary || !versionsList) {
    return;
  }
  if (!model) {
    warningsList.textContent = "无";
    qualityReportList.textContent = "等待转换";
    diffSummary.textContent = "尚无版本差异";
    versionsList.textContent = sessionVersions.length ? sessionVersions.map((item) => item.label).join("\n") : "v0 等待初始转换";
    return;
  }

  const warnings = model.metadata?.warnings || [];
  warningsList.textContent = warnings.length
    ? warnings.map((warning) => `${warning.severity || "info"} · ${warning.code}: ${warning.message}`).join("\n")
    : "无";

  const quality = summarizeQualityReport(model);
  qualityReportList.textContent = [
    `warnings: ${quality.warningCount}`,
    `structure: ${quality.structureFidelity}`,
    `asset: ${quality.assetFidelity}`,
    `text: ${quality.textFidelity}`,
  ].join("\n");

  const previous = sessionVersions.at(-1);
  diffSummary.textContent = previous
    ? `v${sessionVersions.length - 1} -> v${sessionVersions.length}: ${Math.abs(String(output).length - previous.outputLength)} chars`
    : "初始转换结果";
  versionsList.textContent = sessionVersions.map((item) => `${item.label} · ${item.outputLength} chars`).join("\n") || "v0 等待初始转换";
}

function addSessionVersion(output) {
  sessionVersions.push({
    label: `v${sessionVersions.length}`,
    outputLength: String(output || "").length,
    createdAt: new Date().toLocaleTimeString(),
  });
  if (sessionVersions.length > 8) {
    sessionVersions = sessionVersions.slice(-8);
  }
}

function setActiveWorkbenchTab(panelId) {
  document.querySelectorAll(".workbench-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === panelId);
  });
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === panelId);
  });
}

function showWorkbenchTab(panelId) {
  setActiveWorkbenchTab(panelId);
}

function updateConversionProgress({ stage = "idle", progress = 0, message = "" } = {}) {
  const normalizedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  const percent = Math.round(normalizedProgress * 100);
  conversionProgress.dataset.state = stage;
  progressStage.textContent = message || PROGRESS_STAGE_LABELS[stage] || stage;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
}

function sanitizeErrorDiagnostics(errorLike) {
  const normalized = normalizeConversionError(errorLike);
  return {
    category: normalized.category,
    code: normalized.code,
    format: normalized.format,
    message: normalized.message,
    warnings: Array.isArray(normalized.details?.warnings) ? normalized.details.warnings : [],
  };
}

function clearErrorDetails() {
  lastErrorDiagnostics = null;
  errorDetailsPanel.hidden = true;
  errorDetailsSummary.textContent = "等待转换";
  errorCategory.textContent = "-";
  errorCode.textContent = "-";
  errorFormat.textContent = "-";
  errorMessageText.textContent = "";
  errorDebugText.textContent = "";
}

function renderErrorDetails(errorLike) {
  const normalized = normalizeConversionError(errorLike);
  const diagnostics = sanitizeErrorDiagnostics(normalized);
  lastErrorDiagnostics = diagnostics;

  errorDetailsPanel.hidden = false;
  errorDetailsSummary.textContent = diagnostics.message || "转换失败";
  errorCategory.textContent = diagnostics.category || "-";
  errorCode.textContent = diagnostics.code || "-";
  errorFormat.textContent = diagnostics.format || "-";
  errorMessageText.textContent = diagnostics.message || "转换失败";
  errorDebugText.textContent = JSON.stringify({
    ...diagnostics,
    details: normalized.details || {},
  }, null, 2);
}

async function copyErrorDiagnostics() {
  if (!lastErrorDiagnostics) {
    setStatus("没有可复制的诊断信息", "info");
    return;
  }
  const text = JSON.stringify(lastErrorDiagnostics, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    setStatus("已复制脱敏诊断信息", "success");
    return;
  }
  errorDebugText.textContent = text;
  setStatus("浏览器不支持剪贴板写入，已在高级调试信息中显示脱敏诊断", "info");
}

function updateWordCount() {
  const text = inputContent.value;
  wordCountEl.textContent = `字数: ${text.length}`;
  lineCountEl.textContent = `行数: ${text.split("\n").length}`;
}

function revokeOutputUrl() {
  if (currentOutputBlobUrl) {
    URL.revokeObjectURL(currentOutputBlobUrl);
    currentOutputBlobUrl = "";
  }
}

function resetGeneratedOutput(metaMessage = "尚未生成") {
  revokeOutputUrl();
  currentPrintHtml = "";
  textOutputPreview.textContent = "";
  pdfPreview.removeAttribute("src");
  downloadOutputButton.textContent = "下载输出";
  updateOutputPreviewVisibility(false);
  updateDownloadState(false);
  setOutputMeta(metaMessage);
}

function setTransformBusy(isBusy) {
  transformButton.disabled = isBusy;
  cancelTransformButton.disabled = !isBusy;
  cancelTransformButton.hidden = !isBusy;
  if (!isBusy && conversionProgress.dataset.state !== "error" && conversionProgress.dataset.state !== "canceled") {
    updateConversionProgress({ stage: "idle", progress: 0 });
  }
}

function updateDownloadState(enabled) {
  if (enabled) {
    downloadOutputButton.classList.remove("disabled");
    openPdfPreviewButton.disabled = !lastOutputIsPdf;
  } else {
    downloadOutputButton.classList.add("disabled");
    downloadOutputButton.href = "#";
    openPdfPreviewButton.disabled = true;
  }
}

function updateOutputPreviewVisibility(isPdf) {
  lastOutputIsPdf = isPdf;
  if (isPdf) {
    pdfPreview.style.display = "block";
    openPdfPreviewButton.style.display = "block";
    openPdfPreviewButton.textContent = "打开 PDF 预览";
    textOutputPreview.style.display = "none";
  } else {
    pdfPreview.style.display = "none";
    openPdfPreviewButton.style.display = "none";
    textOutputPreview.style.display = "block";
  }
}

function getPayloadKey() {
  return JSON.stringify({
    content: inputContent.value,
    from: fromFormatSelect.value,
    file: currentFileName,
  });
}

function syncPdfPaperControl() {
  paperFormatSelect.disabled = toFormatSelect.value !== "pdf";
}

function updateFormatCapabilityNote() {
  const noteEl = document.getElementById("formatCapabilityNote");
  if (!noteEl) {
    return;
  }
  const from = formatCapabilities.find((item) => item.format === fromFormatSelect.value);
  const to = formatCapabilities.find((item) => item.format === toFormatSelect.value);
  noteEl.textContent = `${from?.label || fromFormatSelect.value} -> ${to?.label || toFormatSelect.value} · 本地处理`;
}

function syncFormatOptions() {
  const currentFrom = fromFormatSelect.value || "md";
  const currentTo = toFormatSelect.value || "html";
  fromFormatSelect.replaceChildren(...formatCapabilities
    .filter((item) => item.canRead)
    .map((item) => new Option(item.label, item.format)));
  toFormatSelect.replaceChildren(...formatCapabilities
    .filter((item) => item.canWrite)
    .map((item) => new Option(item.label, item.format)));
  fromFormatSelect.value = [...fromFormatSelect.options].some((option) => option.value === currentFrom) ? currentFrom : "md";
  toFormatSelect.value = [...toFormatSelect.options].some((option) => option.value === currentTo) ? currentTo : "html";
  updateFormatCapabilityNote();
}

function getBaseName(fileName) {
  return String(fileName || "document").replace(/\.[^.]+$/g, "") || "document";
}

function renderPreview() {
  const renderStart = Date.now();
  const payloadKey = getPayloadKey();
  if (payloadKey === lastRenderedPayload) {
    return;
  }

  setStatus("正在浏览器端渲染预览...");
  const model = toDocumentModel(inputContent.value, fromFormatSelect.value, currentFileName);
  const bodyHtml = renderPreviewHtml(inputContent.value, fromFormatSelect.value, currentFileName);
  htmlPreview.innerHTML = bodyHtml;
  renderDocumentModelPanel(model);
  renderBottomReports(model);
  lastRenderedPayload = payloadKey;
  setStatus(`浏览器端预览已更新 (${Date.now() - renderStart}ms)`, "success");
}

function renderPreviewWhenIdle() {
  cancelIdleTask(previewIdleHandle);
  setStatus("预览已排队，浏览器空闲时刷新", "info");
  previewIdleHandle = scheduleIdleTask(() => {
    previewIdleHandle = null;
    try {
      renderPreview();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

function schedulePreviewUpdate() {
  if (!autoPreviewEnabled) {
    setStatus("内容已更新，点击“刷新预览”查看", "info");
    return;
  }
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    renderPreviewWhenIdle();
  }, PREVIEW_DEBOUNCE_MS);
}

async function handleInputText(rawContent, fileName = currentFileName, { renderInitialPreview = true } = {}) {
  currentFileName = fileName;
  inputContent.value = rawContent;
  setFileMeta(fileName);
  resetGeneratedOutput();
  renderDocumentModelPanel(null);
  renderBottomReports(null);
  lastRenderedPayload = "";
  clearErrorDetails();
  updateWordCount();
  if (renderInitialPreview) {
    renderPreviewWhenIdle();
  } else {
    setStatus("大文件已载入，预览保持手动刷新以避免卡顿", "info");
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error || new Error("文件读取失败")), { once: true });
    reader.readAsDataURL(file);
  });
}

async function readFileAsTextChunked(file) {
  if (!file.stream || typeof TextDecoder === "undefined") {
    return file.text();
  }
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    loaded += value.byteLength;
    chunks.push(decoder.decode(value, { stream: true }));
    if (file.size >= LARGE_FILE_PREVIEW_BYTES) {
      setStatus(`正在分片读取大文件 ${Math.round((loaded / file.size) * 100)}%`, "info");
    }
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

async function handleFile(file) {
  if (!file) {
    return;
  }

  const detectedFormat = detectFormatFromName(file.name);
  if (!detectedFormat) {
    setStatus("请选择 .md / .html / .txt / .json / .csv / .xml / .png / .docx / .xlsx / .epub / .pdf / .pptx 文件", "error");
    return;
  }

  try {
    const queueItem = registerQueuedFile(file, detectedFormat);
    Object.assign(queueItem, { status: "reading", attempts: queueItem.attempts + 1, error: "" });
    renderFileQueue();
    const content = BINARY_INPUT_FORMATS.has(detectedFormat) ? await readFileAsDataUrl(file) : await readFileAsTextChunked(file);
    fromFormatSelect.value = detectedFormat;
    updateActiveQueueItem({ status: "ready" });
    await handleInputText(content, file.name, {
      renderInitialPreview: BINARY_INPUT_FORMATS.has(detectedFormat) || file.size < LARGE_FILE_PREVIEW_BYTES,
    });
  } catch (error) {
    updateActiveQueueItem({ status: "failed", error: error.message });
    setStatus(error.message, "error");
  }
}

function createDownloadUrl(outputText, mime) {
  revokeOutputUrl();
  currentOutputBlobUrl = URL.createObjectURL(new Blob([outputText], { type: mime }));
  return currentOutputBlobUrl;
}

function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return new Uint8Array();
  const binary = atob(match[1]);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function createBinaryDownloadUrl(dataUrl, mime) {
  revokeOutputUrl();
  currentOutputBlobUrl = URL.createObjectURL(new Blob([dataUrlToBytes(dataUrl)], { type: mime }));
  return currentOutputBlobUrl;
}

function createConvertWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }
  return new Worker("/workers/convert-worker.js", { type: "module" });
}

function convertWithWorker(payload) {
  const worker = createConvertWorker();
  if (!worker) {
    return Promise.resolve(convertInBrowser(payload));
  }

  const id = `convert-${Date.now()}-${++convertJobSeq}`;
  return new Promise((resolve, reject) => {
    function cleanup() {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      if (activeConversion?.id === id) {
        activeConversion = null;
      }
      worker.terminate();
    }

    function handleError(event) {
      cleanup();
      reject(new Error(event.message || "Worker 转换失败"));
    }

    function handleMessage(event) {
      const message = event.data || {};
      if (message.id !== id) {
        return;
      }
      if (message.type === "progress") {
        updateConversionProgress(message);
        setStatus(message.message || `转换进度 ${Math.round((message.progress || 0) * 100)}%`);
        return;
      }
      cleanup();
      if (message.type === "result") {
        resolve(message.result);
        return;
      }
      const workerError = new Error(message.error?.message || "转换失败");
      Object.assign(workerError, message.error || {});
      reject(workerError);
    }

    activeConversion = { id, worker, reject };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ id, payload });
  });
}

async function transformContent() {
  const content = inputContent.value;
  if (!content.trim()) {
    setStatus("请先上传或输入内容", "error");
    return;
  }

  const from = fromFormatSelect.value;
  const to = toFormatSelect.value;

  setTransformBusy(true);
  updateConversionProgress({ stage: "read", progress: 0.05, message: "准备读取输入" });
  setStatus("正在浏览器端执行转换...");
  resetGeneratedOutput("正在生成");
  clearErrorDetails();

  try {
    const title = getBaseName(currentFileName);
    const result = await convertWithWorker({ content, from, to, title, fileName: currentFileName });
    const model = toDocumentModel(content, from, currentFileName);
    renderDocumentModelPanel(model);
    renderBottomReports(model, result.data);
    addSessionVersion(result.data);

    if (result.type === "binary") {
      const outputUrl = createBinaryDownloadUrl(result.data, result.mime);
      downloadOutputButton.href = outputUrl;
      downloadOutputButton.download = buildExportFileName(getOutputExtension(result.format));
      downloadOutputButton.textContent = "下载二进制输出";
      textOutputPreview.textContent = `已生成 ${result.format.toUpperCase()} 二进制输出，可直接下载。`;
      if (result.format === "pdf") {
        pdfPreview.src = outputUrl;
        updateOutputPreviewVisibility(true);
      } else {
        updateOutputPreviewVisibility(false);
      }
      updateDownloadState(true);
      setOutputMeta(`二进制输出已生成 · ${result.mime} · ${outputDirectoryLabel}`);
      updateConversionProgress({ stage: "complete", progress: 1, message: "转换完成" });
      updateActiveQueueItem({ status: "done" });
      setStatus("浏览器端本地二进制转换成功", "success");
      return;
    }

    if (result.type === "print") {
      currentPrintHtml = result.data;
      const previewUrl = createDownloadUrl(currentPrintHtml, result.mime);
      pdfPreview.src = previewUrl;

      downloadOutputButton.href = previewUrl;
      downloadOutputButton.download = buildExportFileName("print.html");
      downloadOutputButton.textContent = "下载打印版 HTML";

      updateOutputPreviewVisibility(true);
      updateDownloadState(true);
      setOutputMeta(`已生成浏览器打印页面 · ${outputDirectoryLabel}`);
      updateConversionProgress({ stage: "complete", progress: 1, message: "转换完成" });
      updateActiveQueueItem({ status: "done" });
      setStatus("已生成打印页面，可用浏览器另存为 PDF", "success");
      return;
    }

    textOutputPreview.textContent = result.data;
    const outputUrl = createDownloadUrl(result.data, result.mime);
    downloadOutputButton.href = outputUrl;
    downloadOutputButton.download = buildExportFileName(getOutputExtension(result.format));
    downloadOutputButton.textContent = "下载输出";

    updateOutputPreviewVisibility(false);
    updateDownloadState(true);
    setOutputMeta(`文本输出已生成 · ${result.data.length} chars · ${outputDirectoryLabel}`);
    updateConversionProgress({ stage: "complete", progress: 1, message: "转换完成" });
    updateActiveQueueItem({ status: "done" });
    setStatus("浏览器端转换成功", "success");
  } catch (error) {
    if (error.message === "转换已取消") {
      updateConversionProgress({ stage: "canceled", progress: 0, message: "转换已取消" });
      setStatus("转换已取消", "info");
    } else {
      updateActiveQueueItem({ status: "failed", error: error.message });
      renderErrorDetails(error);
      updateConversionProgress({ stage: "error", progress: 0, message: "转换失败" });
      setStatus(error.message, "error");
    }
  } finally {
    setTransformBusy(false);
  }
}

function printCurrentPdf() {
  if (!currentPrintHtml && currentOutputBlobUrl) {
    window.open(currentOutputBlobUrl, "_blank");
    return;
  }
  if (!currentPrintHtml) {
    setStatus("当前没有可打印内容", "error");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setStatus("浏览器阻止了打印窗口，请允许弹窗后重试", "error");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(currentPrintHtml);
  printWindow.document.close();
  printWindow.addEventListener("load", () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
}

fileInput.addEventListener("change", (event) => {
  const files = [...event.target.files || []];
  files.forEach((file, index) => {
    if (index === 0) {
      handleFile(file);
      return;
    }
    registerQueuedFile(file, detectFormatFromName(file.name));
  });
});

inputContent.addEventListener("input", () => {
  schedulePreviewUpdate();
  updateWordCount();
  if (autoPreviewEnabled && inputContent.value.length > LARGE_DOC_THRESHOLD) {
    autoPreviewEnabled = false;
    autoPreviewCheckbox.checked = false;
    setStatus("文档较大，已自动切换为手动预览模式", "info");
  }
});

inputContent.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    transformContent();
  }
});

refreshPreviewButton.addEventListener("click", () => {
  renderPreviewWhenIdle();
});

autoPreviewCheckbox.addEventListener("change", () => {
  autoPreviewEnabled = autoPreviewCheckbox.checked;
  if (autoPreviewEnabled) {
    setStatus("已开启自动预览", "success");
    schedulePreviewUpdate();
  } else {
    window.clearTimeout(previewTimer);
    cancelIdleTask(previewIdleHandle);
    setStatus("已切换为手动预览模式", "info");
  }
});

fromFormatSelect.addEventListener("change", () => {
  lastRenderedPayload = "";
  schedulePreviewUpdate();
  updateFormatCapabilityNote();
});

toFormatSelect.addEventListener("change", () => {
  syncPdfPaperControl();
  updateOutputPreviewVisibility(toFormatSelect.value === "pdf");
  updateFormatCapabilityNote();
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-active");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-active");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-active");
  const files = [...event.dataTransfer.files || []];
  files.forEach((file, index) => {
    if (index === 0) {
      handleFile(file);
      return;
    }
    registerQueuedFile(file, detectFormatFromName(file.name));
  });
});

transformButton.addEventListener("click", transformContent);
selectAllQueueButton.addEventListener("click", selectAllQueueItems);
retryFailedButton.addEventListener("click", retryFailedQueueItems);
outputDirectoryButton.addEventListener("click", () => {
  chooseOutputDirectory().catch((error) => setStatus(error.message, "error"));
});
pluginManagerButton.addEventListener("click", () => {
  setStatus("插件管理入口已就绪，下载和更新面板位于底部", "info");
  document.getElementById("pluginDownloadPanel")?.scrollIntoView({ block: "nearest" });
});
securityCenterButton.addEventListener("click", () => {
  setStatus("local-only · 文档处理阶段禁联网 · 历史默认不落盘", "success");
});
workbenchTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab-target]");
  if (button) {
    showWorkbenchTab(button.dataset.tabTarget);
  }
});
copyErrorDiagnosticsButton.addEventListener("click", () => {
  copyErrorDiagnostics().catch((error) => setStatus(error.message, "error"));
});
cancelTransformButton.addEventListener("click", () => {
  if (!activeConversion) {
    return;
  }
  const { worker, reject } = activeConversion;
  activeConversion = null;
  worker.terminate();
  resetGeneratedOutput("已取消，未保留输出");
  reject(new Error("转换已取消"));
  setTransformBusy(false);
  updateConversionProgress({ stage: "canceled", progress: 0, message: "转换已取消" });
  setStatus("转换已取消", "info");
});
openPdfPreviewButton.addEventListener("click", printCurrentPdf);

downloadOutputButton.addEventListener("click", (event) => {
  if (downloadOutputButton.classList.contains("disabled")) {
    event.preventDefault();
  }
});

loadSampleButton.addEventListener("click", () => {
  fromFormatSelect.value = "md";
  toFormatSelect.value = "html";
  syncPdfPaperControl();
  handleInputText(sampleMarkdown, "sample.md");
});

function bootstrapInitialSample() {
  currentFileName = "sample.md";
  inputContent.value = sampleMarkdown;
  setFileMeta("sample.md");
  fileQueue = [{
    id: "sample",
    name: "sample.md",
    size: sampleMarkdown.length,
    format: "md",
    selected: true,
    status: "ready",
    attempts: 0,
    error: "",
  }];
  activeQueueItemId = "sample";
  renderFileQueue();
  updateOutputPreviewVisibility(false);
  resetGeneratedOutput();
  lastRenderedPayload = "";
  updateWordCount();
  renderPreview();
  setStatus("示例已加载，当前转换在浏览器端执行", "success");
}

syncFormatOptions();
bootstrapInitialSample();
autoPreviewCheckbox.checked = false;
syncPdfPaperControl();
openPdfPreviewButton.disabled = true;
updateConversionProgress({ stage: "idle", progress: 0 });
