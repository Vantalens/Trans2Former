import {
  convertContent as convertInBrowser,
  convertContentAsync as convertInBrowserAsync,
  detectFormatFromName,
  getAllowedOutputFormats,
  getFormatCapabilities,
  getOutputExtension,
  renderPreviewHtml,
  toConversionDocumentModel,
  toDocumentModel,
  ensurePaddleDefaultModels,
} from "./browser-transformer.js";
import { normalizeConversionError } from "./core/conversion-error.js";
import { getPlainText } from "./core/document-model.js";
import {
  createReadableInputDisplay as createReadableInputDisplayState,
  isBinaryInputFormat as isBinaryInputFormatState,
  shouldUseLargeTextPreview,
} from "./core/input-state.js";
import {
  formatFileSize,
  registerQueuedFileState,
  renderFileQueue as renderQueueList,
  retryFailedQueueItemsState,
  selectAllQueueItemsState,
} from "./core/file-queue-ui.js";
import {
  buildExportFileName as buildWorkbenchExportFileName,
  summarizeQualityReport,
} from "./core/workbench-state.js";
import { readBlobAsDecodedText } from "./core/text-decoding.js";
import { expandPdfContentForTextExtraction } from "./formats/pdf.js";
import { openPreview } from "./router.js";
import { renderMathIn } from "./katex-render.js";

const inputContent = document.getElementById("inputContent");
const sourcePane = document.querySelector(".source-pane");
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
const openStandalonePreviewButton = document.getElementById("openStandalonePreviewButton");
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
const verificationReportPanel = document.getElementById("verificationReportPanel");
const verificationReportBadge = document.getElementById("verificationReportBadge");
const verificationRepair = document.getElementById("verificationRepair");
const verificationRuleDiff = document.getElementById("verificationRuleDiff");
const verificationSsim = document.getElementById("verificationSsim");
const verificationOcrReadback = document.getElementById("verificationOcrReadback");
const verificationOcrRecognition = document.getElementById("verificationOcrRecognition");
const verificationOcrRecognitionRow = document.getElementById("verificationOcrRecognitionRow");
const verificationWarnings = document.getElementById("verificationWarnings");
const securityCenterButton = document.getElementById("securityCenterButton");
const workbenchTabs = document.getElementById("workbenchTabs");
const wordCountEl = document.getElementById("wordCount");
const lineCountEl = document.getElementById("lineCount");
const fromFormatSelect = document.getElementById("fromFormatSelect");
const toFormatSelect = document.getElementById("toFormatSelect");
const paperFormatSelect = document.getElementById("paperFormatSelect");
const paperField = paperFormatSelect?.closest(".paper-field");

const formatCapabilities = getFormatCapabilities();

const BINARY_INPUT_FORMATS = new Set(["doc", "docx", "xlsx", "epub", "pptx", "pdf", "png", "ofd"]);

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
let currentInputContent = sampleMarkdown;
let currentOutputBlobUrl = "";
let currentPrintHtml = "";
let previewTimer = null;
let previewIdleHandle = null;
let lastRenderedPayload = "";
let autoPreviewEnabled = true;
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
let currentConversionQuality = null;
let currentOutputFormat = "";
let currentOutputMime = "";
let currentOutputType = "none";
let outputDraftCommitTimer = null;
let markdownOutputProfile = "ai-ready";
let currentResolvedWarnings = new Set();
let historyPersistenceEnabled = false;

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
const INPUT_EDITOR_MIN_HEIGHT = 144;
const INPUT_EDITOR_MAX_HEIGHT = 420;
const BINARY_INPUT_EDITOR_MIN_HEIGHT = 118;
const BINARY_INPUT_EDITOR_MAX_HEIGHT = 280;
const HISTORY_PREFERENCE_KEY = "trans2former.history.optIn";
const MARKDOWN_PROFILE_PREFERENCE_KEY = "trans2former.markdown.profile";
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
  renderQueueList({
    listElement: fileQueueList,
    fileQueue,
    activeQueueItemId,
    onActivate: (id) => {
      activeQueueItemId = id;
      renderFileQueue();
    },
  });
}

function registerQueuedFile(file, detectedFormat) {
  const result = registerQueuedFileState(fileQueue, activeQueueItemId, file, detectedFormat);
  fileQueue = result.fileQueue;
  activeQueueItemId = result.activeQueueItemId;
  renderFileQueue();
  return result.item;
}

function selectAllQueueItems() {
  fileQueue = selectAllQueueItemsState(fileQueue);
  renderFileQueue();
}

function retryFailedQueueItems() {
  const result = retryFailedQueueItemsState(fileQueue);
  fileQueue = result.fileQueue;
  renderFileQueue();
  setStatus(result.retries ? `已将 ${result.retries} 个失败任务放回队列` : "没有失败任务可重试", result.retries ? "success" : "info");
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
    getActiveInputContent(),
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

function describeRuleDiff(ruleDiff, verification) {
  if (ruleDiff) {
    const score = typeof ruleDiff.overallScore === "number" ? ruleDiff.overallScore.toFixed(3) : "-";
    const struct = `+${ruleDiff.addedBlocks?.length || 0}/-${ruleDiff.removedBlocks?.length || 0}/~${ruleDiff.changedBlocks?.length || 0}`;
    return { state: ruleDiff.identical ? "ok" : "drift", text: `${ruleDiff.fidelity} · score ${score} · 块 ${struct}` };
  }
  const skip = (verification?.skipped || []).find((entry) => entry.layer === "rule-diff");
  return { state: "skip", text: `跳过：${skip?.reason || "未触发"}` };
}

function describeSsim(ssim, verification) {
  if (ssim) {
    const score = typeof ssim.score === "number" ? ssim.score.toFixed(3) : "-";
    return { state: ssim.passed ? "ok" : "drift", text: `score ${score} (阈值 ${ssim.threshold}) · ${ssim.sourceFormat}→${ssim.outputFormat}` };
  }
  const skip = (verification?.skipped || []).find((entry) => entry.layer === "ssim");
  return { state: "skip", text: `跳过：${skip?.reason || "未触发"}` };
}

function describeOcrReadback(ocrReadback, verification) {
  if (ocrReadback) {
    const f1 = typeof ocrReadback.f1 === "number" ? ocrReadback.f1.toFixed(3) : "-";
    const recall = typeof ocrReadback.recall === "number" ? ocrReadback.recall.toFixed(3) : "-";
    return { state: ocrReadback.passed ? "ok" : "drift", text: `f1 ${f1} · recall ${recall} (阈值 ${ocrReadback.threshold}) · ${ocrReadback.engineId}` };
  }
  const skip = (verification?.skipped || []).find((entry) => entry.layer === "ocr-readback");
  return { state: "skip", text: `跳过：${skip?.reason || "未触发"}` };
}

function applyVerificationRow(node, descriptor) {
  if (!node) return;
  node.textContent = descriptor.text;
  node.dataset.state = descriptor.state;
}

function renderVerificationReport(quality = currentConversionQuality) {
  if (!verificationReportPanel) return;
  if (!quality || !quality.qualityReport) {
    verificationReportPanel.hidden = true;
    return;
  }
  const report = quality.qualityReport;
  const verification = report.verification || { layers: [], skipped: [] };
  const autoRepair = quality.autoRepair || {};

  const repairStatus = report.repairStatus || (autoRepair.attempted ? "verified" : "not-attempted");
  const finalDecision = report.finalDecision || autoRepair.finalDecision || "pending";
  applyVerificationRow(verificationRepair, {
    state: finalDecision === "verified" ? "ok" : (finalDecision === "failed-quality-gate" ? "drift" : "skip"),
    text: `${repairStatus} · 结论 ${finalDecision}`,
  });

  applyVerificationRow(verificationRuleDiff, describeRuleDiff(report.ruleDiff, verification));
  applyVerificationRow(verificationSsim, describeSsim(report.ssim, verification));
  applyVerificationRow(verificationOcrReadback, describeOcrReadback(report.ocrReadback, verification));

  // OCR 识别质量（仅当本次转换跑了 OCR 识别才显示）
  const modelReview = quality.modelReview || {};
  if (verificationOcrRecognitionRow) {
    if (modelReview.ocr) {
      const ocr = modelReview.ocr;
      const q = modelReview.ocrQuality || {};
      const conf = typeof ocr.averageConfidence === "number" ? ocr.averageConfidence.toFixed(3) : "-";
      const parts = [`引擎 ${ocr.engine || "-"}`, `${ocr.lineCount ?? 0} 行`, `置信度 ${conf}`];
      if (q.grade) parts.push(`质量 ${q.grade}`);
      if (q.lowConfidenceLines) parts.push(`低置信 ${q.lowConfidenceLines}`);
      if (q.skewApplied) parts.push(`纠偏 ${q.skewApplied}°`);
      if (q.rotatedLines) parts.push(`方向校正 ${q.rotatedLines}`);
      if (q.denoised) parts.push("已去噪");
      const state = q.grade === "low" ? "drift" : (q.grade === "medium" ? "skip" : "ok");
      applyVerificationRow(verificationOcrRecognition, { state, text: parts.join(" · ") });
      verificationOcrRecognitionRow.hidden = false;
    } else {
      verificationOcrRecognitionRow.hidden = true;
    }
  }

  const severity = report.warningsBySeverity || {};
  const severityText = Object.keys(severity).length > 0
    ? Object.entries(severity).map(([level, count]) => `${level}:${count}`).join(" · ")
    : "无";
  applyVerificationRow(verificationWarnings, { state: (report.downgradeCount || 0) > 0 ? "drift" : "ok", text: `${report.warningCount || 0} 条（${severityText}）` });

  const activeLayers = (verification.layers || []).length;
  if (verificationReportBadge) {
    verificationReportBadge.textContent = activeLayers > 0 ? `${activeLayers} 层已检验` : "未触发检验层";
    verificationReportBadge.dataset.state = activeLayers > 0 ? "ok" : "skip";
  }
  verificationReportPanel.hidden = false;
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
    renderMathIn(textOutputPreview);
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

function fitInputEditorHeight() {
  const isBinary = inputContent.classList.contains("is-binary-input");
  const minHeight = isBinary ? BINARY_INPUT_EDITOR_MIN_HEIGHT : INPUT_EDITOR_MIN_HEIGHT;
  const maxHeight = isBinary ? BINARY_INPUT_EDITOR_MAX_HEIGHT : INPUT_EDITOR_MAX_HEIGHT;
  inputContent.style.height = "auto";
  const nextHeight = Math.min(maxHeight, Math.max(minHeight, inputContent.scrollHeight + 2));
  inputContent.style.height = `${nextHeight}px`;
  inputContent.style.overflowY = inputContent.scrollHeight > maxHeight ? "auto" : "hidden";
}

function isBinaryInputFormat(format = fromFormatSelect.value) {
  return isBinaryInputFormatState(format, BINARY_INPUT_FORMATS);
}

function getActiveInputContent() {
  return currentInputContent || inputContent.value;
}

function syncInputEditorMode(format = fromFormatSelect.value) {
  const binary = isBinaryInputFormat(format);
  inputContent.readOnly = binary;
  inputContent.classList.toggle("is-binary-input", binary);
  sourcePane?.classList.toggle("is-binary-input", binary);
  fitInputEditorHeight();
}

function createReadableInputDisplay(rawContent, format, fileName) {
  return createReadableInputDisplayState({
    rawContent,
    format,
    fileName,
    binaryFormats: BINARY_INPUT_FORMATS,
    toDocumentModel,
    getPlainText,
  });
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
  currentConversionQuality = null;
  if (verificationReportPanel) {
    verificationReportPanel.hidden = true;
  }
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
    if (openStandalonePreviewButton) openStandalonePreviewButton.disabled = false;
  } else {
    downloadOutputButton.classList.add("disabled");
    downloadOutputButton.href = "#";
    openPdfPreviewButton.disabled = true;
    if (openStandalonePreviewButton) openStandalonePreviewButton.disabled = true;
  }
}

function openCurrentOutputInPreview() {
  if (!currentOutputType || currentOutputType === "none") return;
  const payload = {
    source: {
      format: fromFormatSelect?.value || "",
      fileName: currentFileName || "",
    },
    output: {
      type: currentOutputType,
      format: currentOutputFormat || "",
      mime: currentOutputMime || "",
      text: outputEditor?.value || textOutputPreview?.textContent || "",
      blobUrl: currentOutputBlobUrl || "",
      printHtml: currentPrintHtml || "",
      isPdf: Boolean(lastOutputIsPdf),
    },
    meta: { generatedAt: Date.now() },
  };
  try {
    openPreview(payload);
  } catch (error) {
    setStatus(`无法打开独立预览：${error?.message || error}`, "error");
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
    content: getActiveInputContent(),
    from: fromFormatSelect.value,
    file: currentFileName,
  });
}

function syncPdfPaperControl() {
  paperFormatSelect.disabled = toFormatSelect.value !== "pdf";
  if (paperField) {
    paperField.hidden = toFormatSelect.value !== "pdf";
  }
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
  fromFormatSelect.value = [...fromFormatSelect.options].some((option) => option.value === currentFrom) ? currentFrom : "md";
  const allowedOutputs = new Set(getAllowedOutputFormats(fromFormatSelect.value));
  toFormatSelect.replaceChildren(...formatCapabilities
    .filter((item) => item.canWrite && allowedOutputs.has(item.format))
    .map((item) => new Option(item.label, item.format)));
  toFormatSelect.value = [...toFormatSelect.options].some((option) => option.value === currentTo) ? currentTo : toFormatSelect.options[0]?.value || "html";
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
  renderMathIn(htmlPreview);
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
  const content = getActiveInputContent();
  if (shouldUseLargeTextPreview({
    format: fromFormatSelect.value,
    contentLength: content.length,
    threshold: LARGE_PROGRESSIVE_PREVIEW_BYTES,
    binaryFormats: BINARY_INPUT_FORMATS,
  })) {
    renderLargeDocumentPreview(content, currentFileName);
    return;
  }
  const model = toDocumentModel(content, fromFormatSelect.value, currentFileName);
  const bodyHtml = renderPreviewHtml(content, fromFormatSelect.value, currentFileName);
  htmlPreview.innerHTML = bodyHtml;
  renderMathIn(htmlPreview);
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
  currentInputContent = String(rawContent ?? "");
  inputContent.value = createReadableInputDisplay(currentInputContent, fromFormatSelect.value, fileName);
  syncInputEditorMode();
  fitInputEditorHeight();
  setFileMeta(fileName);
  updateLargePreviewControls(currentInputContent.length);
  currentDocumentModel = null;
  resetGeneratedOutput();
  renderDocumentModelPanel(null);
  renderBottomReports(null);
  lastRenderedPayload = "";
  clearErrorDetails();
  updateWordCount();
  if (shouldUseLargeTextPreview({
    format: fromFormatSelect.value,
    contentLength: currentInputContent.length,
    threshold: LARGE_PROGRESSIVE_PREVIEW_BYTES,
    binaryFormats: BINARY_INPUT_FORMATS,
  })) {
    renderLargeDocumentPreview(currentInputContent, fileName);
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
  if (file.size >= LARGE_FILE_PREVIEW_BYTES) {
    setStatus(`正在读取大文件 ${formatFileSize(file.size)} 并检测文本编码`, "info");
  }
  const decoded = await readBlobAsDecodedText(file, { fileName: file.name, mime: file.type });
  if (decoded.encoding && decoded.encoding !== "utf-8") {
    setStatus(`已按 ${decoded.encoding.toUpperCase()} 解码文本文件`, "info");
  }
  return decoded.text;
}

async function handleFile(file) {
  if (!file) {
    return;
  }

  const detectedFormat = detectFormatFromName(file.name);
  if (!detectedFormat) {
    setStatus("请选择 .md / .html / .txt / .json / .csv / .xml / .png / .doc / .docx / .xlsx / .epub / .pdf / .pptx / .ofd 文件", "error");
    return;
  }

  try {
    const queueItem = registerQueuedFile(file, detectedFormat);
    Object.assign(queueItem, { status: "reading", attempts: queueItem.attempts + 1, error: "" });
    renderFileQueue();
    let content = BINARY_INPUT_FORMATS.has(detectedFormat) ? await readFileAsDataUrl(file) : await readFileAsTextChunked(file);
    if (detectedFormat === "pdf") {
      setStatus("正在解压 PDF 文本流", "info");
      content = await expandPdfContentForTextExtraction(content);
    }
    fromFormatSelect.value = detectedFormat;
    syncFormatOptions();
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
  const fromFmt = String(payload?.from || "").toLowerCase();
  // OCR 适用输入（图片 / PDF）必须走主线程的异步管线：OCR 需要 canvas 解码图像 +
  // onnxruntime 推理，这些在转换 Web Worker 里不可用。直接走 convertContentAsync——
  // 图片与扫描 PDF 触发 OCR；文本 PDF 仍走常规文本路径。
  if (fromFmt === "png" || fromFmt === "pdf") {
    // 先确保随包 PP-OCRv5 模型已载入本地缓存（幂等），再跑异步转换/OCR。
    return ensurePaddleDefaultModels().catch(() => {}).then(() => convertInBrowserAsync(payload));
  }
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
  const content = getActiveInputContent();
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
  showWorkbenchTab("inputPreviewPanel"); // 转换开始时切换回预览标签页

  try {
    const title = getBaseName(currentFileName);
    const result = await convertWithWorker({ content, from, to, title, fileName: currentFileName, options: { profile: markdownOutputProfile } });
    const model = toConversionDocumentModel(content, from, to, currentFileName, currentFileName);
    currentDocumentModel = model;
    currentConversionQuality = result.quality || null;
    renderDocumentModelPanel(model);
    currentOutputType = result.type;
    currentOutputFormat = result.format;
    currentOutputMime = result.mime;
    clearOutputHistory();
    updateOutputVersionControls();
    renderBottomReports(model, result.type === "text" ? result.data : "");
    renderVerificationReport(currentConversionQuality);

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
      showWorkbenchTab("outputPreviewPanel");
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
      showWorkbenchTab("outputPreviewPanel");
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
    showWorkbenchTab("outputPreviewPanel");
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
  if (!inputContent.readOnly) {
    currentInputContent = inputContent.value;
  }
  schedulePreviewUpdate();
  updateWordCount();
  fitInputEditorHeight();
  if (autoPreviewEnabled && inputContent.value.length > LARGE_DOC_THRESHOLD) {
    autoPreviewEnabled = false;
    setStatus("文档较大，已暂停自动预览，请点击“刷新预览”查看", "info");
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

fromFormatSelect.addEventListener("change", () => {
  syncInputEditorMode();
  syncFormatOptions();
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
securityCenterButton.addEventListener("click", () => {
  setStatus("local-only · 所有内置转换在浏览器本地执行，不上传用户文档", "success");
});
document.getElementById("bottomReportPanel")?.addEventListener("click", (event) => {
  const drawerTab = event.target.closest("[data-drawer-tab]");
  if (drawerTab) {
    activateDrawerTab(drawerTab.dataset.drawerTab);
  }
});

function activateDrawerTab(targetId) {
  const drawer = document.getElementById("bottomReportPanel");
  if (!drawer) return;
  drawer.querySelectorAll(".drawer-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.drawerTab === targetId);
  });
  drawer.querySelectorAll(".drawer-group").forEach((group) => {
    group.classList.toggle("is-active", group.id === targetId);
  });
}

function openDrawerOnTab(targetId) {
  const drawer = document.getElementById("bottomReportPanel");
  if (!drawer) return;
  drawer.open = true;
  activateDrawerTab(targetId);
}
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
if (openStandalonePreviewButton) {
  openStandalonePreviewButton.addEventListener("click", openCurrentOutputInPreview);
}

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
  currentInputContent = sampleMarkdown;
  inputContent.value = sampleMarkdown;
  syncInputEditorMode("md");
  fitInputEditorHeight();
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
bootstrapInitialSample();
syncMarkdownProfileControl();
syncPdfPaperControl();
openPdfPreviewButton.disabled = true;
if (openStandalonePreviewButton) openStandalonePreviewButton.disabled = true;
updateConversionProgress({ stage: "idle", progress: 0 });

// 后台开箱即用加载随包 PP-OCRv5 模型（同源 vendor → 本地缓存），让高级 OCR 无需手动导入。
// 失败/缺失静默（仍可经安全中心手动导入），不阻塞 UI。
ensurePaddleDefaultModels().catch(() => {});
