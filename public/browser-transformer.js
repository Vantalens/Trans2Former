import { ConverterRegistry, getAllowedOutputFormats, getKnownInputFormats, normalizeFormat } from "./core/format-registry.js";
import { readCsv, writeCsv } from "./formats/csv.js";
import { readDoc } from "./formats/doc.js";
import { readDocx } from "./formats/docx.js";
import { readEpub, writeEpub } from "./formats/epub.js";
import { readHtml, writeHtml } from "./formats/html.js";
import { writeDocx } from "./formats/docx-output.js";
import { readJson, writeJson } from "./formats/json.js";
import { modelToBodyHtml, readMarkdown, writeMarkdown } from "./formats/markdown.js";
import { expandPdfContentForTextExtraction, readPdf } from "./formats/pdf.js";
import { writePdfBinary } from "./formats/pdf-output.js";
import { readPng } from "./formats/png.js";
import { readText, writeText } from "./formats/plain-text.js";
import { readPptx, writePptx } from "./formats/pptx.js";
import { readXml, writeXml } from "./formats/xml.js";
import { readXlsx, writeXlsx } from "./formats/xlsx.js";
import { readOfdL0 } from "./formats/ofd.js";
import { semanticToWorkbook, workbookToSemantic } from "./core/models/mappers.js";

const EXT_TO_FORMAT = {
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  txt: "txt",
  text: "txt",
  json: "json",
  csv: "csv",
  xml: "xml",
  png: "png",
  ofd: "ofd",
  docx: "docx",
  doc: "doc",
  xlsx: "xlsx",
  epub: "epub",
  pdf: "pdf",
  pptx: "pptx",
};

const registry = new ConverterRegistry();

registry.registerFormat("md", {
  read: readMarkdown,
  write: writeMarkdown,
  extension: "md",
  mime: "text/markdown;charset=utf-8",
  label: "Markdown",
  inputModels: ["SemanticDoc"],
  outputModels: ["SemanticDoc"],
});

registry.registerFormat("html", {
  read: readHtml,
  write: writeHtml,
  extension: "html",
  mime: "text/html;charset=utf-8",
  label: "HTML",
  inputModels: ["SemanticDoc"],
  outputModels: ["SemanticDoc"],
});

registry.registerFormat("txt", {
  read: readText,
  write: writeText,
  extension: "txt",
  mime: "text/plain;charset=utf-8",
  label: "TXT",
  inputModels: ["SemanticDoc"],
  outputModels: ["SemanticDoc"],
});

registry.registerFormat("json", {
  read: readJson,
  write: writeJson,
  extension: "json",
  mime: "application/json;charset=utf-8",
  label: "JSON",
  inputModels: ["SemanticDoc"],
  outputModels: ["SemanticDoc"],
});

registry.registerFormat("csv", {
  read: readCsv,
  write: writeCsv,
  extension: "csv",
  mime: "text/csv;charset=utf-8",
  label: "CSV",
  note: "以第一行作为表头导入 DocumentModel table",
  producesModels: ["WorkbookModel", "SemanticDoc"],
  primaryModel: "WorkbookModel",
  acceptsModels: ["SemanticDoc"],
});

registry.registerFormat("xml", {
  read: readXml,
  write: writeXml,
  extension: "xml",
  mime: "application/xml;charset=utf-8",
  label: "XML",
  note: "当前保留 raw XML 并提取可读文本结构",
  inputModels: ["SemanticDoc"],
  outputModels: ["SemanticDoc"],
});

registry.registerFormat("png", {
  read: readPng,
  extension: "png",
  mime: "image/png",
  label: "PNG",
  note: "支持作为输入图片资源导入 DocumentModel；图片文本识别走核心内置路线，不再要求插件安装",
  qualityGrade: "basic",
  warnings: ["PNG_INPUT_ASSET_ONLY", "PNG_OCR_CORE_LIMITED"],
  resourceBudget: { maxInputBytes: 25 * 1024 * 1024, maxRuntimeMemoryMb: 512 },
  degradation: "输入作为图片资产保存；当前核心包不伪造 OCR 文本，后续 OCR 引擎直接并入核心而不是插件安装。",
  inputModels: ["SemanticDoc"],
});

registry.registerFormat("docx", {
  read: readDocx,
  write: writeDocx,
  extension: "docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  label: "DOCX",
  note: "P3：浏览器端读取 OOXML 文本、标题、表格、链接、图片、列表、页眉页脚、脚注和批注",
  qualityGrade: "enhanced",
  warnings: ["DOCX_COMPLEX_LAYOUT_APPROXIMATED", "DOCX_FLOATING_OBJECTS_DEGRADED"],
  resourceBudget: { maxInputBytes: 50 * 1024 * 1024, maxRuntimeMemoryMb: 768 },
  degradation: "保留正文结构和基础样式；复杂分页、修订、浮动对象和宏不进入核心包。",
  inputModels: ["SemanticDoc"],
  outputModels: ["SemanticDoc"],
});

registry.registerFormat("doc", {
  read: readDoc,
  extension: "doc",
  mime: "application/msword",
  label: "DOC",
  note: "旧版 Word 二进制文档的最佳努力纯文本抽取；布局、表格和图片降级为可读文本",
  qualityGrade: "basic",
  warnings: ["DOC_TEXT_EXTRACTED", "DOC_LAYOUT_APPROXIMATED"],
  resourceBudget: { maxInputBytes: 50 * 1024 * 1024, maxRuntimeMemoryMb: 256 },
  degradation: "旧版 DOC 仅做尽力文本抽取；复杂排版、表格、图片和修订降级为纯文本。",
  inputModels: ["SemanticDoc"],
});

registry.registerFormat("xlsx", {
  read: readXlsx,
  write: writeXlsx,
  extension: "xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  label: "XLSX",
  note: "支持读取工作表文本、公式缓存、日期和合并单元格 warning；支持基础 XLSX 输出",
  qualityGrade: "enhanced",
  warnings: ["XLSX_FORMULA_CACHE_ONLY", "XLSX_MERGED_CELLS_APPROXIMATED"],
  resourceBudget: { maxInputBytes: 30 * 1024 * 1024, maxRuntimeMemoryMb: 512 },
  degradation: "读取单元格显示值和表格结构；公式执行、图表和宏不进入核心包。",
  producesModels: ["WorkbookModel", "SemanticDoc"],
  primaryModel: "WorkbookModel",
  acceptsModels: ["WorkbookModel", "SemanticDoc"],
});

registry.registerFormat("epub", {
  read: readEpub,
  write: writeEpub,
  extension: "epub",
  mime: "application/epub+zip",
  label: "EPUB",
  note: "支持读取 OPF spine 和 XHTML 内容结构；支持基础 EPUB 输出",
  qualityGrade: "enhanced",
  warnings: ["EPUB_CSS_APPROXIMATED", "EPUB_MEDIA_REFERENCED"],
  resourceBudget: { maxInputBytes: 80 * 1024 * 1024, maxRuntimeMemoryMb: 768 },
  degradation: "按 spine 读取 XHTML 结构；交互脚本、复杂 CSS 和 DRM 内容降级。",
  inputModels: ["SemanticDoc"],
  outputModels: ["SemanticDoc"],
});

registry.registerFormat("pptx", {
  read: readPptx,
  write: writePptx,
  extension: "pptx",
  mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  label: "PPTX",
  note: "支持读取幻灯片标题、文本框、图片、表格和备注；支持基础 PPTX 输出",
  qualityGrade: "enhanced",
  warnings: ["PPTX_LAYOUT_APPROXIMATED", "PPTX_ANIMATION_IGNORED"],
  resourceBudget: { maxInputBytes: 80 * 1024 * 1024, maxRuntimeMemoryMb: 1024 },
  degradation: "读取幻灯片文本、表格和图片引用；动画、母版精确布局和媒体播放降级。",
  producesModels: ["SlideModel", "SemanticDoc"],
  primaryModel: "SlideModel",
  acceptsModels: ["SemanticDoc"],
  writerMode: "generated",
});

registry.registerFormat("pdf", {
  read: readPdf,
  write: writePdfBinary,
  extension: "pdf",
  mime: "application/pdf",
  label: "PDF",
  note: "P4：文本型 PDF 输入和程序化 PDF 二进制输出",
  qualityGrade: "enhanced",
  warnings: ["PDF_TEXT_ORDER_APPROXIMATED", "PDF_SCAN_OCR_CORE_LIMITED"],
  resourceBudget: { maxInputBytes: 50 * 1024 * 1024, maxRuntimeMemoryMb: 1024 },
  degradation: "文本型 PDF 可抽取；扫描件 OCR、复杂版面和表格恢复后续直接进入核心，不走插件安装。",
  producesModels: ["FixedLayoutModel", "SemanticDoc"],
  primaryModel: "FixedLayoutModel",
  acceptsModels: ["FixedLayoutModel", "SemanticDoc"],
});

registry.registerFormat("ofd", {
  read: readOfdL0,
  extension: "ofd",
  mime: "application/ofd",
  label: "OFD",
  note: "P6：OFD 容器、manifest 和 metadata 由核心包直接读取；后续页面树、文本对象和渲染继续并入核心",
  qualityGrade: "basic",
  warnings: ["OFD_L1_CORE_LIMITED", "OFD_RENDER_CORE_LIMITED"],
  resourceBudget: { maxInputBytes: 80 * 1024 * 1024, maxRuntimeMemoryMb: 1024 },
  degradation: "核心包直接登记 OFD 容器和 metadata；页面树、文本、图片、签章和渲染仍是核心内置路线的后续增强，不再提示安装插件。",
  producesModels: ["SemanticDoc"],
  primaryModel: "SemanticDoc",
  readerMaturity: "placeholder",
});

// 跨模型路由图：reader 仍提供可写出的 DocumentModel，同时保留 workbook /
// slide / fixedLayout 附加模型。RoutePlanner 用该拓扑计算 warm/cold 温度并将
// forcedWarnings 注入转换 QualityReport，让跨类转换的损失在工作台可见。
// 详见 docs/CONVERSION_ROUTING.md。
registry.registerMapper({ name: "workbookToSemantic", from: "WorkbookModel", to: "SemanticDoc", fn: workbookToSemantic, lossLevel: "low",
  forcedWarnings: ["MODEL_STYLE_DROPPED", "MODEL_FORMULA_AS_VALUE"] });
registry.registerMapper({ name: "semanticToWorkbook", from: "SemanticDoc", to: "WorkbookModel", fn: semanticToWorkbook, lossLevel: "low",
  forcedWarnings: ["MODEL_NO_FORMULA_INFO"] });
registry.registerMapper({ from: "SlideModel", to: "SemanticDoc", lossLevel: "medium",
  forcedWarnings: ["MODEL_VISUAL_LAYOUT_DROPPED"] });
registry.registerMapper({ from: "SemanticDoc", to: "SlideModel", lossLevel: "medium",
  forcedWarnings: ["MODEL_LAYOUT_AUTO_GENERATED"] });
registry.registerMapper({ from: "FixedLayoutModel", to: "SemanticDoc", lossLevel: "high",
  forcedWarnings: ["MODEL_VISUAL_FIDELITY_LOST", "MODEL_TEXT_ORDER_HEURISTIC"] });
registry.registerMapper({ from: "SemanticDoc", to: "FixedLayoutModel", lossLevel: "medium",
  forcedWarnings: ["MODEL_PAGINATION_AUTO_GENERATED"] });
registry.registerMapper({ from: "WorkbookModel", to: "FixedLayoutModel", lossLevel: "medium",
  forcedWarnings: ["MODEL_SHEET_TO_PAGE_PRINT_ONLY"] });
registry.registerMapper({ from: "SlideModel", to: "FixedLayoutModel", lossLevel: "medium",
  forcedWarnings: ["MODEL_ANIMATION_DROPPED"] });

export function listFormats() {
  return registry.listFormats();
}

export { normalizeFormat };
export { getAllowedOutputFormats };
export { getKnownInputFormats };
export { expandPdfContentForTextExtraction };
export { defaultRepairEngine, RepairEngine, MIN_CONFIDENCE } from "./core/repair-engine.js";
export { REPAIR_ACTION_TYPES, createRepairAction, validateRepairAction } from "./core/repair-actions.js";
export {
  ROUND_TRIP_FORMATS,
  blockFingerprint,
  modelFingerprint,
  getBlockKey,
  extractBlockFields,
  BLOCK_FIELDS_BY_TYPE,
} from "./core/verification/block-fingerprint.js";
export {
  diffSemanticDocs,
  MAJOR_WEIGHT,
  MINOR_WEIGHT,
  STRUCTURAL_PENALTY,
} from "./core/verification/rule-diff.js";
export {
  runVerificationStage,
  runVerificationStageAsync,
  runSsimLayer,
  RULE_DIFF_DRIFT,
  RULE_DIFF_READBACK_FAILED,
  SSIM_VISUAL_DRIFT,
  SSIM_SOURCE_UNAVAILABLE,
  DEFAULT_SSIM_THRESHOLD,
} from "./core/verification/verification-stage.js";
export {
  computeSSIM,
  compareImages,
  rgbaToGrayscale,
  resampleGrayscale,
  SSIM_C1,
  SSIM_C2,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_TARGET_WIDTH,
} from "./core/verification/ssim.js";
export {
  defaultPageImageSource,
  setPageImageSource,
  resetPageImageSource,
  RASTERIZABLE_FORMATS,
  VERIFICATION_IMAGE_SOURCE_UNAVAILABLE,
  VERIFICATION_IMAGE_SOURCE_FAILED,
} from "./core/verification/page-image-source.js";
export {
  compareText,
  normalizeText,
  extractModelText,
  runOcrReadbackLayer,
  OCR_READBACK_DRIFT,
  OCR_READBACK_FAILED,
  DEFAULT_OCR_READBACK_THRESHOLD,
} from "./core/verification/ocr-readback.js";
export {
  MODEL_MANIFEST_SCHEMA_VERSION,
  MODEL_TASKS,
  MODEL_ENGINES,
  MODEL_QUANTIZATIONS,
  FALLBACK_STRATEGIES,
  createModelManifest,
  validateModelManifest,
  summarizeManifest,
} from "./core/model-cache/manifest.js";
export { sha256Hex, verifyChecksum } from "./core/model-cache/checksum.js";
export {
  MODEL_CACHE_ROOT,
  getCacheKey,
  getCacheDirectory,
  parseCacheKey,
  getCacheFilePath,
} from "./core/model-cache/cache-paths.js";
export {
  STATUS_NOT_DOWNLOADED,
  STATUS_IMPORTING,
  STATUS_VERIFYING,
  STATUS_AVAILABLE,
  STATUS_DEGRADED,
  STATUS_DISABLED,
  MODEL_CACHE_STATUSES,
  ModelCacheRegistry,
  defaultModelCache,
} from "./core/model-cache/availability.js";
export {
  getFirstEnableHint,
  getOfflineFallbackHint,
  getClearCacheHint,
  getStatusLabel,
  getTaskLabel,
  listKnownTaskLabels,
} from "./core/model-cache/ui-text.js";
import "./core/ocr/ocr-bootstrap.js";
import "./core/ocr/tesseract-bootstrap.js";
import "./core/ocr/paddle-ocr-bootstrap.js";
export {
  OCR_RESULT_SCHEMA_VERSION,
  OCR_LANGUAGES,
  createOCRResult,
  validateOCRResult,
  summarizeOCRResult,
} from "./core/ocr/ocr-result.js";
export {
  OCREngineRegistry,
  defaultOCRRegistry,
} from "./core/ocr/ocr-engine.js";
export {
  placeholderOCREngine,
  PLACEHOLDER_OCR_MANIFEST_ID,
} from "./core/ocr/placeholder-engine.js";
export {
  OCR_UNAVAILABLE,
  OCR_LOW_CONFIDENCE,
  OCR_ENGINE_FAILED,
  OCR_DEGRADED_ROUTE,
  OCR_WARNING_CODES,
  createOCRUnavailableWarning,
  createOCREngineFailedWarning,
  createOCRLowConfidenceWarning,
  createOCRDegradedRouteWarning,
} from "./core/ocr/ocr-warnings.js";
export { ensureOCRBootstrap } from "./core/ocr/ocr-bootstrap.js";
export {
  tesseractOCREngine,
  TESSERACT_MANIFEST_ID,
  markTesseractVendorReady,
} from "./core/ocr/tesseract-engine.js";
export { ensureTesseractBootstrap } from "./core/ocr/tesseract-bootstrap.js";
export {
  paddleOcrEngine,
  PADDLE_OCR_MANIFEST_ID,
  PADDLE_OCR_MODEL_FILES,
  markPaddleOcrVendorReady,
} from "./core/ocr/paddle-ocr-engine.js";
export { ensurePaddleOcrBootstrap } from "./core/ocr/paddle-ocr-bootstrap.js";
export { ensurePaddleDefaultModels } from "./core/ocr/paddle-default-models.js";
export {
  loadOnnxRuntime,
  pickExecutionProviders,
  createOcrSession,
  disposeOcrSession,
  resetOnnxRuntimeCache,
  PADDLE_VENDOR_PATHS,
} from "./core/ocr/paddle-ocr-runtime.js";
export {
  runPaddlePipeline,
  parseCharDictionary,
  preprocessForDetection,
  preprocessForRecognition,
  dbPostProcess,
  ctcGreedyDecode,
  cropImageData,
  resizeRgba,
  rotateImageData90,
  rotateImageData180,
  rotateImageDataByAngle,
  estimateSkewAngle,
  interpretClsOutput,
  denoiseImageData,
  estimateNoiseLevel,
  DET_LIMIT_SIDE_LEN,
  REC_IMAGE_HEIGHT,
} from "./core/ocr/paddle-ocr-pipeline.js";
export {
  InMemoryStorage,
  createIndexedDBStorage,
  defaultOCRStorage,
} from "./core/ocr/ocr-storage.js";
export { IndexedDBStorage } from "./core/ocr/indexeddb-storage.js";
export {
  OCR_VENDOR_LOAD_FAILED,
  TESSERACT_VENDOR_PATHS,
  loadTesseractRuntime,
  createTesseractWorker,
  runRecognize,
  disposeWorker,
} from "./core/ocr/tesseract-runtime.js";
export { enhanceWithOCR } from "./core/ocr/png-ocr.js";
export { runOCRStage, getDefaultOCRLanguage } from "./core/ocr/ocr-stage.js";
export { detectOCRLowConfidence } from "./core/ocr/ocr-validator.js";
export {
  isScannedPdf,
  defaultPdfPageRasterizer,
  setPdfPageRasterizer,
  resetPdfPageRasterizer,
  OCR_RASTERIZER_UNAVAILABLE,
  OCR_RASTERIZER_FAILED,
} from "./core/ocr/pdf-rasterizer.js";
export {
  runScannedPdfOCRStage,
  MODEL_VISUAL_FIDELITY_LOST,
  MODEL_TEXT_ORDER_HEURISTIC,
} from "./core/ocr/scan-pdf-stage.js";
export {
  ocrResultToFixedLayoutPage,
  mergeOCRResultsToFixedLayout,
  READING_ORDER_HEURISTIC,
} from "./core/ocr/ocr-to-fixed-layout.js";
export { createBrowserPdfPageRasterizer } from "./core/ocr/pdf-rasterizer-browser.js";
export {
  createFixedLayoutModel,
  createPage as createFixedLayoutPage,
  createTextRun as createFixedLayoutTextRun,
  createBbox as createFixedLayoutBbox,
  getFixedLayoutSummary,
} from "./core/models/fixed-layout.js";
export { fixedLayoutToSemantic } from "./core/models/mappers.js";

export function getRouteTemperature(from, to) {
  return registry.getRouteTemperature(from, to);
}

export function getRouteDetails(from, to) {
  return registry.getRouteDetails(from, to);
}

export function isModelReachable(from, to) {
  return registry.isModelReachable(from, to);
}

export function detectFormatFromName(fileName) {
  const ext = String(fileName || "").split(".").pop()?.toLowerCase() || "";
  return EXT_TO_FORMAT[ext] || "";
}

export function getOutputExtension(format) {
  return registry.getOutputExtension(format);
}

export function getFormatCapabilities() {
  return registry.getCapabilities();
}

export function toDocumentModel(content, fromFormat, title = "document") {
  return registry.read({ content, from: fromFormat, title });
}

export function toConversionDocumentModel(content, fromFormat, toFormat, title = "document", fileName = "") {
  return registry.prepareConversionModel({ content, from: fromFormat, to: toFormat, title, fileName });
}

export function renderPreviewHtml(content, fromFormat, title = "document") {
  const model = toDocumentModel(content, fromFormat, title);
  return modelToBodyHtml(model);
}

export function convertContent({ content, from, to, title = "document", fileName = "", options = {} }) {
  return registry.convert({ content, from, to, title, fileName, options });
}

export async function convertContentAsync({ content, from, to, title = "document", fileName = "", options = {} }) {
  return registry.convertAsync({ content, from, to, title, fileName, options });
}
