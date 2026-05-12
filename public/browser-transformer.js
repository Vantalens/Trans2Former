import { ConverterRegistry, getAllowedOutputFormats, normalizeFormat } from "./core/format-registry.js";
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
});

registry.registerFormat("html", {
  read: readHtml,
  write: writeHtml,
  extension: "html",
  mime: "text/html;charset=utf-8",
  label: "HTML",
});

registry.registerFormat("txt", {
  read: readText,
  write: writeText,
  extension: "txt",
  mime: "text/plain;charset=utf-8",
  label: "TXT",
});

registry.registerFormat("json", {
  read: readJson,
  write: writeJson,
  extension: "json",
  mime: "application/json;charset=utf-8",
  label: "JSON",
});

registry.registerFormat("csv", {
  read: readCsv,
  write: writeCsv,
  extension: "csv",
  mime: "text/csv;charset=utf-8",
  label: "CSV",
  note: "以第一行作为表头导入 DocumentModel table",
});

registry.registerFormat("xml", {
  read: readXml,
  write: writeXml,
  extension: "xml",
  mime: "application/xml;charset=utf-8",
  label: "XML",
  note: "当前保留 raw XML 并提取可读文本结构",
});

registry.registerFormat("png", {
  read: readPng,
  extension: "png",
  mime: "image/png",
  label: "PNG",
  note: "支持作为输入图片资源导入 DocumentModel；图片渲染输出在真实视觉保真前不作为可下载格式开放",
  qualityGrade: "basic",
  warnings: ["PNG_INPUT_ASSET_ONLY"],
  resourceBudget: { maxInputBytes: 25 * 1024 * 1024, maxRuntimeMemoryMb: 512 },
  degradation: "输入作为图片资产保存；文档到图片输出必须等待真实本地渲染器，不能用占位图冒充。",
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
});

registry.registerFormat("pdf", {
  read: readPdf,
  write: writePdfBinary,
  extension: "pdf",
  mime: "application/pdf",
  label: "PDF",
  note: "P4：文本型 PDF 输入和程序化 PDF 二进制输出",
  qualityGrade: "enhanced",
  warnings: ["PDF_TEXT_ORDER_APPROXIMATED", "PDF_SCAN_REQUIRES_LOCAL_OCR_PLUGIN"],
  resourceBudget: { maxInputBytes: 50 * 1024 * 1024, maxRuntimeMemoryMb: 1024 },
  degradation: "文本型 PDF 可抽取；扫描件、复杂版面和表格恢复依赖本地插件。",
});

registry.registerFormat("ofd", {
  read: readOfdL0,
  extension: "ofd",
  mime: "application/ofd",
  label: "OFD",
  note: "P6：核心包只读取 L0 容器/manifest/metadata，L1+ 由本地插件承载",
  qualityGrade: "plugin-required",
  warnings: ["OFD_L1_PLUGIN_REQUIRED", "OFD_RENDER_PLUGIN_REQUIRED"],
  resourceBudget: { maxInputBytes: 80 * 1024 * 1024, maxRuntimeMemoryMb: 1024 },
  degradation: "核心包仅登记容器和 metadata；页面树、文本、图片、签章和渲染必须走本地 OFD 插件。",
});

export function listFormats() {
  return registry.listFormats();
}

export { normalizeFormat };
export { getAllowedOutputFormats };
export { expandPdfContentForTextExtraction };

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

export function renderPreviewHtml(content, fromFormat, title = "document") {
  const model = toDocumentModel(content, fromFormat, title);
  return modelToBodyHtml(model);
}

export function convertContent({ content, from, to, title = "document", fileName = "", options = {} }) {
  return registry.convert({ content, from, to, title, fileName, options });
}
