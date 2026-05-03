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
  createPluginRecord,
  discoverPluginCapabilities,
  importLocalPluginPackage,
  openPluginRelease,
  rollbackPlugin,
  setPluginEnabled,
  uninstallPlugin,
} from "./core/plugin-runtime.js";
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
const outputEditorPanel = document.getElementById("outputEditorPanel");
const outputEditor = document.getElementById("outputEditor");
const outputDraftMeta = document.getElementById("outputDraftMeta");
const outputPreviewNotice = document.getElementById("outputPreviewNotice");
const outputUndoButton = document.getElementById("outputUndoButton");
const outputRedoButton = document.getElementById("outputRedoButton");
const outputCheckpointButton = document.getElementById("outputCheckpointButton");
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
const markdownProfileSelect = document.getElementById("markdownProfileSelect");
const persistHistoryCheckbox = document.getElementById("persistHistoryCheckbox");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const autoPreviewCheckbox = document.getElementById("autoPreviewCheckbox");
const refreshPreviewButton = document.getElementById("refreshPreviewButton");
const largePreviewModeSelect = document.getElementById("largePreviewModeSelect");
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
const resolveWarningsButton = document.getElementById("resolveWarningsButton");
const clearResolvedWarningsButton = document.getElementById("clearResolvedWarningsButton");
const qualityReportList = document.getElementById("qualityReportList");
const diffSummary = document.getElementById("diffSummary");
const versionsList = document.getElementById("versionsList");
const pluginManagerButton = document.getElementById("pluginManagerButton");
const securityCenterButton = document.getElementById("securityCenterButton");
const importPluginInput = document.getElementById("importPluginInput");
const importPluginButton = document.getElementById("importPluginButton");
const pluginDownloadList = document.getElementById("pluginDownloadList");
const pluginInstalledList = document.getElementById("pluginInstalledList");
const pluginUpdateList = document.getElementById("pluginUpdateList");
const pluginCapabilityList = document.getElementById("pluginCapabilityList");
const pluginSecuritySummary = document.getElementById("pluginSecuritySummary");
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
let outputVersionIndex = -1;
let currentDocumentModel = null;
let currentOutputFormat = "";
let currentOutputMime = "";
let currentOutputType = "none";
let outputDraftCommitTimer = null;
let markdownOutputProfile = "ai-ready";
let currentResolvedWarnings = new Set();
let historyPersistenceEnabled = false;
let installedPlugins = [];

const PREVIEW_DEBOUNCE_MS = 300;
const LARGE_DOC_THRESHOLD = 12000;
const LARGE_FILE_PREVIEW_BYTES = 2 * 1024 * 1024;
const LARGE_PROGRESSIVE_PREVIEW_BYTES = 50 * 1024 * 1024;
const LARGE_DEGRADED_PREVIEW_BYTES = 100 * 1024 * 1024;
const LARGE_PREVIEW_SAMPLE_BYTES = 512 * 1024;
const LARGE_PREVIEW_BLOCK_LIMIT = 80;
const WORKER_TRANSFERABLE_THRESHOLD_BYTES = 1024 * 1024;
const VIRTUAL_LIST_ITEM_LIMIT = 160;
const EDITABLE_OUTPUT_FORMATS = new Set(["md", "html", "txt", "json", "csv", "xml"]);
const HISTORY_PREFERENCE_KEY = "trans2former.history.optIn";
const MARKDOWN_PROFILE_PREFERENCE_KEY = "trans2former.markdown.profile";
const PLUGIN_STATE_KEY = "trans2former.plugins.state";
const TRUSTED_PLUGIN_CATALOG = [
  {
    schemaVersion: "trans2former.plugin.v1",
    id: "ofd-local-reader",
    name: "OFD Local Reader",
    version: "0.2.0",
    kind: "format-plugin",
    entry: "plugins/ofd-local-reader/index.js",
    releaseUrl: "https://github.com/Vantalens/trans2former-ofd-plugin/releases",
    formats: [{ format: "ofd", canRead: true, canWrite: false }],
    permissions: ["install-network", "cache-plugin", "process-document", "read-assets", "write-output"],
    resources: { downloadBytes: 4_000_000, maxRuntimeMemoryMb: 768 },
    integrity: { sha256: "0".repeat(64) },
    security: { installMode: "network-only-no-documents", processingMode: "local-only-no-network" },
    fallback: {
      code: "OFD_PLUGIN_UNAVAILABLE",
      message: "OFD plugin unavailable; keep the document local and show a fallback warning.",
    },
    updates: {
      latestVersion: "0.3.0",
      releaseNotes: "Improves OFD page tree extraction and warning details.",
      permissions: ["process-document", "read-assets", "write-output"],
      resources: { downloadBytes: 4_500_000, maxRuntimeMemoryMb: 768 },
    },
  },
  {
    schemaVersion: "trans2former.plugin.v1",
    id: "local-ocr-basic",
    name: "Local OCR Basic",
    version: "0.1.0",
    kind: "local-model-plugin",
    entry: "plugins/local-ocr-basic/index.js",
    releaseUrl: "https://github.com/Vantalens/trans2former-local-ocr/releases",
    formats: [{ format: "png", canRead: true, canWrite: false }],
    permissions: ["process-document", "read-assets", "write-output"],
    resources: { downloadBytes: 120_000_000, maxRuntimeMemoryMb: 2048 },
    integrity: { sha256: "0".repeat(64) },
    security: { installMode: "network-only-no-documents", processingMode: "local-only-no-network" },
    install: { manual: true, removable: true },
    fallback: {
      code: "LOCAL_OCR_MODEL_MISSING",
      message: "Local OCR model is unavailable; keep the original image and explain the limitation.",
    },
    updates: {
      latestVersion: "0.1.1",
      releaseNotes: "Updates model metadata and resource budget notes.",
      permissions: ["process-document", "read-assets", "write-output"],
      resources: { downloadBytes: 118_000_000, maxRuntimeMemoryMb: 2048 },
    },
  },
];
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

function pluginPermissionText(permissions = []) {
  return permissions.join(", ") || "none";
}

function pluginResourceText(resources = {}) {
  return `${formatFileSize(Number(resources.downloadBytes || 0))} / ${Number(resources.maxRuntimeMemoryMb || 0)} MB`;
}

function readPluginState() {
  if (typeof window.localStorage === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PLUGIN_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePluginState() {
  if (typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PLUGIN_STATE_KEY, JSON.stringify(installedPlugins));
  } catch {
    setStatus("插件状态保存失败，浏览器可能禁用了本地存储", "info");
  }
}

function renderPluginDownloadCenter() {
  if (!pluginDownloadList) {
    return;
  }
  pluginDownloadList.replaceChildren(...TRUSTED_PLUGIN_CATALOG.map((manifest) => {
    const row = document.createElement("div");
    row.className = "plugin-row";
    const formats = manifest.formats.map((item) => `${item.format}${item.canRead ? " read" : ""}${item.canWrite ? " write" : ""}`).join(", ");
    row.innerHTML = `
      <div>
        <strong>${manifest.name}</strong>
        <span>${manifest.version} · ${manifest.kind} · ${formats}</span>
        <small>权限：${pluginPermissionText(manifest.permissions)} · 预算：${pluginResourceText(manifest.resources)} · ${manifest.security.installMode}</small>
      </div>
      <button class="mini-button" type="button" data-plugin-download="${manifest.id}">Release</button>
    `;
    return row;
  }));
}

function renderInstalledPlugins() {
  if (!pluginInstalledList) {
    return;
  }
  if (!installedPlugins.length) {
    pluginInstalledList.textContent = "尚未导入本地插件包";
    return;
  }
  pluginInstalledList.replaceChildren(...installedPlugins.map((plugin) => {
    const row = document.createElement("div");
    row.className = "plugin-row";
    row.innerHTML = `
      <div>
        <strong>${plugin.name}</strong>
        <span>${plugin.version} · ${plugin.status} · ${plugin.integrityVerified ? "hash verified" : "hash pending"}</span>
        <small>${plugin.manifest.security.processingMode} · ${pluginResourceText(plugin.manifest.resources)}</small>
      </div>
      <div class="plugin-actions">
        <button class="mini-button" type="button" data-plugin-toggle="${plugin.id}">${plugin.enabled ? "禁用" : "启用"}</button>
        <button class="mini-button" type="button" data-plugin-rollback="${plugin.id}">回滚</button>
        <button class="mini-button" type="button" data-plugin-uninstall="${plugin.id}">卸载</button>
      </div>
    `;
    return row;
  }));
}

function renderPluginUpdates() {
  if (!pluginUpdateList) {
    return;
  }
  const rows = installedPlugins
    .filter((plugin) => plugin.manifest.updates?.latestVersion && plugin.manifest.updates.latestVersion !== plugin.version)
    .map((plugin) => {
      const update = plugin.manifest.updates;
      const row = document.createElement("div");
      row.className = "plugin-row";
      row.innerHTML = `
        <div>
          <strong>${plugin.name}</strong>
          <span>${plugin.version} -> ${update.latestVersion}</span>
          <small>${update.releaseNotes || "No release notes"} · 权限变化：${pluginPermissionText(update.permissions || [])} · 预算变化：${pluginResourceText(update.resources || {})}</small>
        </div>
        <button class="mini-button" type="button" data-plugin-download="${plugin.id}">查看 Release</button>
      `;
      return row;
    });
  pluginUpdateList.replaceChildren(...(rows.length ? rows : [document.createTextNode("暂无可更新插件")]));
}

function renderPluginCapabilities() {
  if (!pluginCapabilityList || !pluginSecuritySummary) {
    return;
  }
  const capabilities = installedPlugins.flatMap((plugin) => discoverPluginCapabilities(plugin));
  if (!capabilities.length) {
    pluginCapabilityList.textContent = "尚无插件能力";
  } else {
    pluginCapabilityList.textContent = capabilities
      .map((item) => `${item.pluginName} · ${item.format} · read:${item.canRead} write:${item.canWrite} · ${item.mode} · fallback:${item.fallback?.code || "none"}`)
      .join("\n");
  }
  pluginSecuritySummary.textContent = [
    "install mode: network allowed, documents blocked",
    "processing mode: documents allowed, network blocked",
    `enabled plugins: ${installedPlugins.filter((plugin) => plugin.enabled).length}`,
    `installed plugins: ${installedPlugins.filter((plugin) => plugin.status !== "uninstalled").length}`,
  ].join("\n");
}

function renderPluginRuntime() {
  renderPluginDownloadCenter();
  renderInstalledPlugins();
  renderPluginUpdates();
  renderPluginCapabilities();
}

function findPluginById(id) {
  return installedPlugins.find((plugin) => plugin.id === id) || null;
}

function upsertPlugin(record) {
  installedPlugins = [
    ...installedPlugins.filter((plugin) => plugin.id !== record.id),
    record,
  ];
  writePluginState();
  renderPluginRuntime();
}

async function importPluginFromFile(file) {
  const text = await file.text();
  const manifest = JSON.parse(text);
  const bytes = new TextEncoder().encode(text);
  const record = await importLocalPluginPackage({ manifest, bytes });
  upsertPlugin(record);
  setStatus(`插件已导入并完成 manifest/hash 校验：${record.name}`, "success");
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

function hashString(text) {
  let hash = 0;
  for (let index = 0; index < String(text || "").length; index += 1) {
    hash = (hash << 5) - hash + String(text)[index].charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getWarningSignature(warning) {
  return [warning?.severity || "info", warning?.code || "CONVERSION_NOTICE", warning?.message || ""].join("|");
}

function getCurrentWarningSignatures(model = currentDocumentModel) {
  return (model?.metadata?.warnings || []).map((warning) => getWarningSignature(warning));
}

function getCurrentBlockIds(model = currentDocumentModel) {
  return (model?.blocks || []).map((block) => String(block?.id || ""))
    .filter(Boolean);
}

function compareIdSets(previousIds = [], nextIds = []) {
  const previousSet = new Set(previousIds);
  const nextSet = new Set(nextIds);
  let shared = 0;
  for (const id of nextSet) {
    if (previousSet.has(id)) {
      shared += 1;
    }
  }
  return {
    shared,
    added: [...nextSet].filter((id) => !previousSet.has(id)).length,
    removed: [...previousSet].filter((id) => !nextSet.has(id)).length,
  };
}

function getHistoryStorageKey() {
  return `trans2former.output-history.${hashString([
    currentFileName,
    fromFormatSelect.value,
    toFormatSelect.value,
    markdownOutputProfile,
    inputContent.value,
  ].join("\u001f"))}`;
}

function readPersistentHistory() {
  if (!historyPersistenceEnabled || typeof window.localStorage === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(getHistoryStorageKey());
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistentHistory() {
  if (!historyPersistenceEnabled || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(getHistoryStorageKey(), JSON.stringify({
      sessionVersions,
      outputVersionIndex,
      currentResolvedWarnings: [...currentResolvedWarnings],
      markdownOutputProfile,
    }));
  } catch {
    setStatus("本地历史保存失败，浏览器可能禁用了存储", "info");
  }
}

function clearPersistentHistory() {
  if (typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(getHistoryStorageKey());
  } catch {
    // ignore
  }
}

function readHistoryPersistencePreference() {
  if (typeof window.localStorage === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(HISTORY_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

function readMarkdownProfilePreference() {
  if (typeof window.localStorage === "undefined") {
    return "ai-ready";
  }
  try {
    return window.localStorage.getItem(MARKDOWN_PROFILE_PREFERENCE_KEY) || "ai-ready";
  } catch {
    return "ai-ready";
  }
}

function writeMarkdownProfilePreference(profile) {
  if (typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(MARKDOWN_PROFILE_PREFERENCE_KEY, String(profile || "ai-ready"));
  } catch {
    // ignore
  }
}

function writeHistoryPersistencePreference(enabled) {
  if (typeof window.localStorage === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(HISTORY_PREFERENCE_KEY, "true");
    } else {
      window.localStorage.removeItem(HISTORY_PREFERENCE_KEY);
    }
  } catch {
    // ignore
  }
}

function applyPersistentHistoryIfAny() {
  const persisted = readPersistentHistory();
  if (!persisted) {
    return false;
  }
  sessionVersions = Array.isArray(persisted.sessionVersions) ? persisted.sessionVersions : [];
  outputVersionIndex = Math.min(
    Math.max(0, Number(persisted.outputVersionIndex || 0)),
    Math.max(0, sessionVersions.length - 1)
  );
  currentResolvedWarnings = new Set(Array.isArray(persisted.currentResolvedWarnings) ? persisted.currentResolvedWarnings : []);
  if (markdownProfileSelect && typeof persisted.markdownOutputProfile === "string") {
    markdownOutputProfile = persisted.markdownOutputProfile;
    markdownProfileSelect.value = markdownOutputProfile;
  }
  return sessionVersions.length > 0;
}

function updateWarningsResolvedControls(model = currentDocumentModel) {
  const warningCount = getCurrentWarningSignatures(model).length;
  const resolvedCount = [...currentResolvedWarnings].filter((signature) => getCurrentWarningSignatures(model).includes(signature)).length;
  if (resolveWarningsButton) {
    resolveWarningsButton.disabled = warningCount === 0;
  }
  if (clearResolvedWarningsButton) {
    clearResolvedWarningsButton.disabled = currentResolvedWarnings.size === 0;
  }
  if (warningsList && warningCount > 0) {
    warningsList.dataset.resolvedCount = String(resolvedCount);
  }
}

function markCurrentWarningsResolved() {
  const warningSignatures = getCurrentWarningSignatures();
  if (!warningSignatures.length) {
    setStatus("当前没有可标记的 warnings", "info");
    return;
  }
  warningSignatures.forEach((signature) => currentResolvedWarnings.add(signature));
  updateWarningsResolvedControls();
  renderBottomReports(currentDocumentModel, getCurrentOutputContent());
  writePersistentHistory();
  setStatus("已标记当前 warnings 为已处理", "success");
}

function clearWarningsResolved() {
  currentResolvedWarnings.clear();
  updateWarningsResolvedControls();
  renderBottomReports(currentDocumentModel, getCurrentOutputContent());
  writePersistentHistory();
  setStatus("已清除 warnings 已处理标记", "info");
}

function renderDocumentModelPanel(model = null) {
  currentDocumentModel = model;
  if (!documentModelPreview) {
    return;
  }
  if (!model) {
    documentModelPreview.textContent = "等待输入结构";
    return;
  }
  const blocks = Array.isArray(model.blocks) ? model.blocks : [];
  const virtualized = blocks.length > VIRTUAL_LIST_ITEM_LIMIT;
  documentModelPreview.dataset.virtualized = virtualized ? "true" : "false";
  documentModelPreview.textContent = JSON.stringify({
    schemaVersion: model.schemaVersion,
    title: model.title,
    blocks: virtualized ? blocks.slice(0, VIRTUAL_LIST_ITEM_LIMIT) : blocks,
    omittedBlocks: virtualized ? blocks.length - VIRTUAL_LIST_ITEM_LIMIT : 0,
    assets: model.assets,
    metadata: model.metadata,
  }, null, 2);
}

function renderVirtualTextList(target, rows, emptyText) {
  if (!target) {
    return;
  }
  const normalizedRows = rows.filter((row) => String(row || "").trim());
  target.dataset.virtualized = normalizedRows.length > VIRTUAL_LIST_ITEM_LIMIT ? "true" : "false";
  if (!normalizedRows.length) {
    target.textContent = emptyText;
    return;
  }
  const visibleRows = normalizedRows.slice(0, VIRTUAL_LIST_ITEM_LIMIT);
  const omitted = normalizedRows.length - visibleRows.length;
  target.textContent = omitted > 0
    ? [...visibleRows, `... 已隐藏 ${omitted} 条，滚动/筛选视图将在后续批量任务中心加载`].join("\n")
    : visibleRows.join("\n");
}

function renderBottomReports(model = null, output = "") {
  if (!warningsList || !qualityReportList || !diffSummary || !versionsList) {
    return;
  }
  if (!model) {
    renderVirtualTextList(warningsList, [], "无");
    renderVirtualTextList(qualityReportList, [], "等待转换");
    diffSummary.textContent = currentOutputType === "text" ? "尚无版本差异" : "非文本输出不参与文本 diff";
    renderVirtualTextList(versionsList,
      sessionVersions.map((item) => `${item.label}${item.kind === "checkpoint" ? " · checkpoint" : ""} · ${item.outputLength} chars · ${item.lineCount} lines`),
      currentOutputType === "text" ? "v0 等待初始转换" : "当前输出不是可编辑文本，暂无会话版本历史"
    );
    updateWarningsResolvedControls(model);
    return;
  }

  const warnings = model.metadata?.warnings || [];
  renderVirtualTextList(
    warningsList,
    warnings.map((warning) => {
      const signature = getWarningSignature(warning);
      const resolved = currentResolvedWarnings.has(signature) ? "✓ 已处理" : "待处理";
      return `${resolved} · ${warning.severity || "info"} · ${warning.code}: ${warning.message}`;
    }),
    "无"
  );

  const quality = summarizeQualityReport(model);
  renderVirtualTextList(qualityReportList, [
    `warnings: ${quality.warningCount}`,
    `structure: ${quality.structureFidelity}`,
    `asset: ${quality.assetFidelity}`,
    `text: ${quality.textFidelity}`,
  ], "等待转换");

  const current = sessionVersions.at(outputVersionIndex) || sessionVersions.at(-1);
  const previous = outputVersionIndex > 0 ? sessionVersions.at(outputVersionIndex - 1) : null;
  const blockDiff = current && previous ? compareIdSets(previous.blockIds, current.blockIds) : null;
  const textDiff = current && previous
    ? `${previous.label} -> ${current.label}: ${Math.abs(current.outputLength - previous.outputLength)} chars, ${Math.abs(current.lineCount - previous.lineCount)} lines`
    : (current ? "初始转换结果" : (currentOutputType === "text" ? "尚无版本差异" : "非文本输出不参与文本 diff"));
  diffSummary.textContent = blockDiff
    ? `${textDiff}\nblock ids: +${blockDiff.added} / -${blockDiff.removed} / =${blockDiff.shared}`
    : textDiff;
  renderVirtualTextList(versionsList,
    sessionVersions.map((item) => `${item.label}${item.kind === "checkpoint" ? " · checkpoint" : ""} · ${item.outputLength} chars · ${item.lineCount} lines · ${item.blockIds?.length || 0} blocks`),
    currentOutputType === "text" ? "v0 等待初始转换" : "当前输出不是可编辑文本，暂无会话版本历史"
  );
  updateWarningsResolvedControls(model);
}

function getOutputLineCount(output) {
  return String(output || "").split("\n").length;
}

function isEditableOutput() {
  return currentOutputType === "text" && EDITABLE_OUTPUT_FORMATS.has(currentOutputFormat);
}

function getCurrentOutputContent() {
  return outputEditor ? outputEditor.value : "";
}

function clearOutputHistory() {
  sessionVersions = [];
  outputVersionIndex = -1;
}

function updateOutputVersionControls() {
  if (!outputUndoButton || !outputRedoButton || !outputCheckpointButton || !outputDraftMeta || !outputEditorPanel || !outputEditor) {
    return;
  }

  const editable = isEditableOutput();
  outputEditorPanel.hidden = !editable;
  outputEditor.disabled = !editable;
  outputUndoButton.disabled = !editable || outputVersionIndex <= 0;
  outputRedoButton.disabled = !editable || outputVersionIndex < 0 || outputVersionIndex >= sessionVersions.length - 1;
  outputCheckpointButton.disabled = !editable || outputVersionIndex < 0;

  if (!editable) {
    if (currentOutputType === "binary") {
      outputDraftMeta.textContent = "二进制输出不提供文本编辑器";
    } else if (currentOutputType === "print") {
      outputDraftMeta.textContent = "打印 HTML 仅提供预览";
    } else {
      outputDraftMeta.textContent = "等待转换";
    }
    return;
  }

  const snapshot = sessionVersions.at(outputVersionIndex) || null;
  outputDraftMeta.textContent = snapshot
    ? `${snapshot.label}${snapshot.kind === "checkpoint" ? " · checkpoint" : ""} · ${snapshot.outputLength} chars · ${snapshot.lineCount} lines`
    : "等待初始转换";
}

function renderOutputPreview(content = "") {
  if (!outputPreviewNotice || !textOutputPreview) {
    return;
  }

  if (!isEditableOutput()) {
    outputPreviewNotice.hidden = true;
    textOutputPreview.textContent = content || (currentOutputType === "binary" ? "二进制输出可直接下载" : "输出");
    return;
  }

  try {
    textOutputPreview.innerHTML = renderPreviewHtml(content, currentOutputFormat, currentFileName);
    outputPreviewNotice.hidden = true;
    outputPreviewNotice.textContent = "";
  } catch (error) {
    textOutputPreview.textContent = content;
    outputPreviewNotice.textContent = `预览失败：${error.message}`;
    outputPreviewNotice.hidden = false;
  }
}

function updateOutputDownloadLink(output) {
  if (currentOutputType === "binary") {
    return;
  }

  const outputUrl = createDownloadUrl(output, currentOutputMime || "text/plain");
  downloadOutputButton.href = outputUrl;
  downloadOutputButton.download = buildExportFileName(getOutputExtension(currentOutputFormat || "txt"));
}

function commitOutputVersion(output, { kind = "edit", forceNew = false } = {}) {
  const normalized = String(output || "");
  const current = sessionVersions.at(outputVersionIndex) || null;
  const blockIds = getCurrentBlockIds();
  if (current && current.content === normalized && !forceNew) {
    current.kind = kind;
    current.outputLength = normalized.length;
    current.lineCount = getOutputLineCount(normalized);
    current.blockIds = blockIds;
  } else {
    sessionVersions = sessionVersions.slice(0, outputVersionIndex + 1);
    const version = {
      label: `v${sessionVersions.length}`,
      content: normalized,
      outputLength: normalized.length,
      lineCount: getOutputLineCount(normalized),
      blockIds,
      kind,
      createdAt: new Date().toLocaleTimeString(),
    };
    sessionVersions.push(version);
    outputVersionIndex = sessionVersions.length - 1;
  }
  renderBottomReports(currentDocumentModel, normalized);
  updateOutputVersionControls();
  writePersistentHistory();
}

function applyOutputVersion(index) {
  const snapshot = sessionVersions[index];
  if (!snapshot || !outputEditor || !isEditableOutput()) {
    return;
  }
  outputVersionIndex = index;
  outputEditor.value = snapshot.content;
  renderOutputPreview(snapshot.content);
  updateOutputDownloadLink(snapshot.content);
  renderBottomReports(currentDocumentModel, snapshot.content);
  updateOutputVersionControls();
  writePersistentHistory();
  setStatus(`已切换到 ${snapshot.label}`, "info");
}

function scheduleOutputVersionCommit(kind = "edit") {
  if (!isEditableOutput()) {
    return;
  }
  window.clearTimeout(outputDraftCommitTimer);
  outputDraftCommitTimer = window.setTimeout(() => {
    outputDraftCommitTimer = null;
    const content = getCurrentOutputContent();
    renderOutputPreview(content);
    updateOutputDownloadLink(content);
    commitOutputVersion(content, { kind });
    setOutputMeta(`文本输出草稿已同步 · ${content.length} chars · ${outputDirectoryLabel}`);
  }, PREVIEW_DEBOUNCE_MS);
}

function initializeOutputDraft(result) {
  currentOutputType = result.type;
  currentOutputFormat = result.format;
  currentOutputMime = result.mime;
  clearOutputHistory();
  updateOutputVersionControls();

  if (result.type === "text" && isEditableOutput()) {
    if (historyPersistenceEnabled && applyPersistentHistoryIfAny()) {
      const snapshot = sessionVersions.at(outputVersionIndex) || null;
      if (snapshot) {
        if (outputEditor) {
          outputEditor.value = snapshot.content;
        }
        renderOutputPreview(snapshot.content);
        updateOutputDownloadLink(snapshot.content);
        updateOutputVersionControls();
        renderBottomReports(currentDocumentModel, snapshot.content);
        setOutputMeta(`已恢复 ${sessionVersions.length} 个历史版本 · ${outputDirectoryLabel}`);
        return;
      }
    }
    if (outputEditor) {
      outputEditor.value = result.data;
    }
    updateOutputPreviewVisibility(false);
    renderOutputPreview(result.data);
    commitOutputVersion(result.data, { kind: "checkpoint", forceNew: true });
    updateOutputDownloadLink(result.data);
    setOutputMeta(`文本输出已生成 · v0 checkpoint · ${result.data.length} chars · ${outputDirectoryLabel}`);
    return;
  }

  if (outputEditor) {
    outputEditor.value = "";
  }
  updateOutputPreviewVisibility(result.type === "print");
  updateOutputVersionControls();
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
  releaseConversionResources();
  currentPrintHtml = "";
  currentOutputMime = "";
  currentOutputFormat = "";
  currentOutputType = "none";
  currentResolvedWarnings = new Set();
  textOutputPreview.textContent = "";
  pdfPreview.removeAttribute("src");
  downloadOutputButton.textContent = "下载输出";
  if (outputEditor) {
    outputEditor.value = "";
  }
  if (outputPreviewNotice) {
    outputPreviewNotice.hidden = true;
    outputPreviewNotice.textContent = "";
  }
  if (outputDraftMeta) {
    outputDraftMeta.textContent = metaMessage;
  }
  clearOutputHistory();
  updateOutputPreviewVisibility(false);
  updateOutputVersionControls();
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

function syncMarkdownProfileControl() {
  if (!markdownProfileSelect) {
    return;
  }
  markdownProfileSelect.disabled = toFormatSelect.value !== "md";
}

function updateFormatCapabilityNote() {
  const noteEl = document.getElementById("formatCapabilityNote");
  if (!noteEl) {
    return;
  }
  const from = formatCapabilities.find((item) => item.format === fromFormatSelect.value);
  const to = formatCapabilities.find((item) => item.format === toFormatSelect.value);
  const profileNote = toFormatSelect.value === "md" ? ` · ${markdownOutputProfile}` : "";
  noteEl.textContent = `${from?.label || fromFormatSelect.value} -> ${to?.label || toFormatSelect.value} · 本地处理${profileNote}`;
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

function updateLargePreviewControls(contentSize = 0) {
  if (!largePreviewModeSelect) {
    return;
  }
  const wrapper = largePreviewModeSelect.closest(".large-preview-field");
  if (wrapper) {
    wrapper.hidden = contentSize < LARGE_PROGRESSIVE_PREVIEW_BYTES;
  }
  if (contentSize >= LARGE_DEGRADED_PREVIEW_BYTES && !["structure", "sample", "full"].includes(largePreviewModeSelect.value)) {
    largePreviewModeSelect.value = "structure";
  }
}

function getLargePreviewSample(rawContent, mode) {
  if (mode === "full") {
    return rawContent;
  }
  if (mode === "sample") {
    return rawContent.slice(0, LARGE_PREVIEW_SAMPLE_BYTES);
  }
  return rawContent
    .slice(0, LARGE_PREVIEW_SAMPLE_BYTES)
    .split(/\r?\n/)
    .slice(0, LARGE_PREVIEW_BLOCK_LIMIT)
    .join("\n");
}

function renderLargeDocumentPreview(rawContent, fileName = currentFileName) {
  updateLargePreviewControls(rawContent.length);
  const mode = largePreviewModeSelect?.value || "structure";
  const previewContent = getLargePreviewSample(rawContent, mode);
  const model = toDocumentModel(previewContent, fromFormatSelect.value, fileName);
  const totalLines = rawContent ? rawContent.split(/\r?\n/).length : 0;
  const summary = [
    `<p><strong>大文件渐进预览</strong></p>`,
    `<p>模式：${mode} · 大小：${formatFileSize(rawContent.length)} · 行数：${totalLines}</p>`,
    `<p>当前仅渲染前 ${Math.min(model.blocks.length, LARGE_PREVIEW_BLOCK_LIMIT)} 个结构块，转换仍在 Worker 中完整执行。</p>`,
  ].join("");
  htmlPreview.innerHTML = summary + renderPreviewHtml(previewContent, fromFormatSelect.value, fileName);
  renderDocumentModelPanel({
    ...model,
    blocks: model.blocks.slice(0, LARGE_PREVIEW_BLOCK_LIMIT),
    metadata: {
      ...model.metadata,
      progressivePreview: {
        mode,
        sampledBytes: previewContent.length,
        totalBytes: rawContent.length,
        fullTextAvailable: mode === "full",
      },
    },
  });
  renderBottomReports(model);
  lastRenderedPayload = getPayloadKey();
  setStatus(`大文件${rawContent.length >= LARGE_DEGRADED_PREVIEW_BYTES ? "降级" : "渐进"}预览已更新`, "success");
}

function renderPreview() {
  const renderStart = Date.now();
  const payloadKey = getPayloadKey();
  if (payloadKey === lastRenderedPayload) {
    return;
  }

  setStatus("正在浏览器端渲染预览...");
  if (inputContent.value.length >= LARGE_PROGRESSIVE_PREVIEW_BYTES) {
    renderLargeDocumentPreview(inputContent.value, currentFileName);
    return;
  }
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
  updateLargePreviewControls(rawContent.length);
  currentDocumentModel = null;
  resetGeneratedOutput();
  renderDocumentModelPanel(null);
  renderBottomReports(null);
  lastRenderedPayload = "";
  clearErrorDetails();
  updateWordCount();
  if (rawContent.length >= LARGE_PROGRESSIVE_PREVIEW_BYTES) {
    renderLargeDocumentPreview(rawContent, fileName);
  } else if (renderInitialPreview) {
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

function buildWorkerPayload(payload) {
  const workerPayload = { ...payload };
  const transferList = [];
  if (typeof payload.content === "string" && payload.content.length >= WORKER_TRANSFERABLE_THRESHOLD_BYTES) {
    const bytes = new TextEncoder().encode(payload.content);
    workerPayload.contentBuffer = bytes.buffer;
    workerPayload.contentEncoding = "utf-8";
    workerPayload.content = "";
    transferList.push(workerPayload.contentBuffer);
  }
  return { workerPayload, transferList };
}

function releaseConversionResources() {
  revokeOutputUrl();
  if (activeConversion?.worker) {
    activeConversion.worker.terminate();
    activeConversion = null;
  }
}

function convertWithWorker(payload) {
  const worker = createConvertWorker();
  if (!worker) {
    return Promise.resolve(convertInBrowser(payload));
  }

  const id = `convert-${Date.now()}-${++convertJobSeq}`;
  const { workerPayload, transferList } = buildWorkerPayload(payload);
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
    worker.postMessage({ id, payload: workerPayload }, transferList);
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
    const result = await convertWithWorker({ content, from, to, title, fileName: currentFileName, options: { profile: markdownOutputProfile } });
    const model = toDocumentModel(content, from, currentFileName);
    currentDocumentModel = model;
    renderDocumentModelPanel(model);
    currentOutputType = result.type;
    currentOutputFormat = result.format;
    currentOutputMime = result.mime;
    clearOutputHistory();
    updateOutputVersionControls();
    renderBottomReports(model, result.type === "text" ? result.data : "");

    if (result.type === "binary") {
      currentOutputType = "binary";
      currentOutputFormat = result.format;
      currentOutputMime = result.mime;
      clearOutputHistory();
      updateOutputVersionControls();
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
      currentOutputType = "print";
      currentOutputFormat = result.format;
      currentOutputMime = result.mime;
      clearOutputHistory();
      updateOutputVersionControls();
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

    currentOutputType = "text";
    currentOutputFormat = result.format;
    currentOutputMime = result.mime;
    downloadOutputButton.textContent = "下载输出";
    initializeOutputDraft(result);

    updateDownloadState(true);
    renderOutputPreview(result.data);
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

markdownProfileSelect?.addEventListener("change", () => {
  markdownOutputProfile = markdownProfileSelect.value;
  writeMarkdownProfilePreference(markdownOutputProfile);
  updateFormatCapabilityNote();
  setStatus(`Markdown profile 已切换为 ${markdownOutputProfile}`, "info");
});

persistHistoryCheckbox?.addEventListener("change", () => {
  historyPersistenceEnabled = persistHistoryCheckbox.checked;
  writeHistoryPersistencePreference(historyPersistenceEnabled);
  if (!historyPersistenceEnabled) {
    clearPersistentHistory();
    setStatus("已关闭本地历史持久化", "info");
    return;
  }
  writePersistentHistory();
  setStatus("已开启本地历史持久化", "success");
});

clearHistoryButton?.addEventListener("click", () => {
  clearPersistentHistory();
  clearOutputHistory();
  currentResolvedWarnings.clear();
  updateWarningsResolvedControls();
  updateOutputVersionControls();
  setOutputMeta("已清除本地历史记录");
  setStatus("已清除本地历史记录", "info");
});

if (outputEditor) {
  outputEditor.addEventListener("input", () => {
    if (!isEditableOutput()) {
      return;
    }
    scheduleOutputVersionCommit("edit");
  });
}

inputContent.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    transformContent();
  }
});

refreshPreviewButton.addEventListener("click", () => {
  renderPreviewWhenIdle();
});

largePreviewModeSelect?.addEventListener("change", () => {
  lastRenderedPayload = "";
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
  syncMarkdownProfileControl();
});

toFormatSelect.addEventListener("change", () => {
  syncPdfPaperControl();
  updateOutputPreviewVisibility(toFormatSelect.value === "pdf");
  updateFormatCapabilityNote();
  syncMarkdownProfileControl();
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
  setStatus("local-only · 插件 install mode 不读文档 · processing mode 禁联网", "success");
  document.getElementById("pluginSecurityPanel")?.scrollIntoView({ block: "nearest" });
});
importPluginButton?.addEventListener("click", () => {
  importPluginInput?.click();
});
importPluginInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  importPluginFromFile(file).catch((error) => setStatus(error.message, "error"));
  event.target.value = "";
});
document.getElementById("bottomReportPanel")?.addEventListener("click", (event) => {
  const downloadButton = event.target.closest("[data-plugin-download]");
  if (downloadButton) {
    const id = downloadButton.dataset.pluginDownload;
    const manifest = TRUSTED_PLUGIN_CATALOG.find((item) => item.id === id) || findPluginById(id)?.manifest;
    try {
      openPluginRelease(manifest, {
        openExternal: (url) => window.open(url, "_blank", "noopener,noreferrer"),
        documentContext: { fileName: currentFileName },
      });
      setStatus("已打开插件 GitHub Release；安装模式不会读取当前文档", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
    return;
  }

  const toggleButton = event.target.closest("[data-plugin-toggle]");
  if (toggleButton) {
    const plugin = findPluginById(toggleButton.dataset.pluginToggle);
    if (plugin) {
      upsertPlugin(setPluginEnabled(plugin, !plugin.enabled));
      setStatus(`${plugin.name} 已${plugin.enabled ? "禁用" : "启用"}`, "success");
    }
    return;
  }

  const rollbackButton = event.target.closest("[data-plugin-rollback]");
  if (rollbackButton) {
    const plugin = findPluginById(rollbackButton.dataset.pluginRollback);
    if (plugin) {
      upsertPlugin(rollbackPlugin(plugin));
      setStatus(`${plugin.name} 已回滚到上一可用版本`, "success");
    }
    return;
  }

  const uninstallButton = event.target.closest("[data-plugin-uninstall]");
  if (uninstallButton) {
    const plugin = findPluginById(uninstallButton.dataset.pluginUninstall);
    if (plugin) {
      upsertPlugin(uninstallPlugin(plugin));
      setStatus(`${plugin.name} 已卸载`, "info");
    }
  }
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
resolveWarningsButton?.addEventListener("click", () => {
  markCurrentWarningsResolved();
});
clearResolvedWarningsButton?.addEventListener("click", () => {
  clearWarningsResolved();
});
cancelTransformButton.addEventListener("click", () => {
  if (!activeConversion) {
    return;
  }
  const { reject } = activeConversion;
  releaseConversionResources();
  activeConversion = null;
  resetGeneratedOutput("已取消，未保留输出");
  reject(new Error("转换已取消"));
  setTransformBusy(false);
  updateConversionProgress({ stage: "canceled", progress: 0, message: "转换已取消" });
  setStatus("转换已取消", "info");
});
openPdfPreviewButton.addEventListener("click", printCurrentPdf);

outputUndoButton?.addEventListener("click", () => {
  if (outputVersionIndex > 0) {
    applyOutputVersion(outputVersionIndex - 1);
  }
});

outputRedoButton?.addEventListener("click", () => {
  if (outputVersionIndex < sessionVersions.length - 1) {
    applyOutputVersion(outputVersionIndex + 1);
  }
});

outputCheckpointButton?.addEventListener("click", () => {
  if (!isEditableOutput()) {
    return;
  }
  const content = getCurrentOutputContent();
  commitOutputVersion(content, { kind: "checkpoint", forceNew: true });
  setOutputMeta(`已保存检查点 · v${outputVersionIndex} · ${content.length} chars · ${outputDirectoryLabel}`);
});

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
  currentDocumentModel = null;
  updateOutputPreviewVisibility(false);
  resetGeneratedOutput();
  lastRenderedPayload = "";
  updateWordCount();
  renderPreview();
  setStatus("示例已加载，当前转换在浏览器端执行", "success");
}

syncFormatOptions();
historyPersistenceEnabled = readHistoryPersistencePreference();
if (persistHistoryCheckbox) {
  persistHistoryCheckbox.checked = historyPersistenceEnabled;
}
markdownOutputProfile = readMarkdownProfilePreference();
if (markdownProfileSelect) {
  markdownProfileSelect.value = markdownOutputProfile;
}
installedPlugins = readPluginState();
renderPluginRuntime();
bootstrapInitialSample();
autoPreviewCheckbox.checked = false;
syncMarkdownProfileControl();
syncPdfPaperControl();
openPdfPreviewButton.disabled = true;
updateConversionProgress({ stage: "idle", progress: 0 });
