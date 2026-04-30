import { ConverterRegistry, normalizeFormat } from "./core/format-registry.js";
import { readCsv, writeCsv } from "./formats/csv.js";
import { readDocx } from "./formats/docx.js";
import { readEpub } from "./formats/epub.js";
import { readHtml, writeHtml, writePdfPrintHtml } from "./formats/html.js";
import { readJson, writeJson } from "./formats/json.js";
import { modelToBodyHtml, readMarkdown, writeMarkdown } from "./formats/markdown.js";
import { readPdf } from "./formats/pdf.js";
import { readPng } from "./formats/png.js";
import { readText, writeText } from "./formats/plain-text.js";
import { readPptx } from "./formats/pptx.js";
import { readXml, writeXml } from "./formats/xml.js";
import { readXlsx } from "./formats/xlsx.js";

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
  docx: "docx",
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
  note: "当前支持作为输入图片资源导入 DocumentModel",
});

registry.registerFormat("docx", {
  read: readDocx,
  extension: "docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  label: "DOCX",
  note: "P3：浏览器端读取 OOXML 文本、标题、表格、链接、图片、列表、页眉页脚、脚注和批注",
});

registry.registerFormat("xlsx", {
  read: readXlsx,
  extension: "xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  label: "XLSX",
  note: "P3：浏览器端读取工作表文本、公式缓存、日期和合并单元格 warning",
});

registry.registerFormat("epub", {
  read: readEpub,
  extension: "epub",
  mime: "application/epub+zip",
  label: "EPUB",
  note: "P3：读取 OPF spine 和 XHTML 内容结构",
});

registry.registerFormat("pptx", {
  read: readPptx,
  extension: "pptx",
  mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  label: "PPTX",
  note: "P3：读取幻灯片标题、文本框、图片、表格和备注",
});

registry.registerFormat("pdf", {
  read: readPdf,
  write: writePdfPrintHtml,
  extension: "html",
  mime: "text/html;charset=utf-8",
  label: "PDF",
  note: "当前通过浏览器打印/另存为 PDF 输出",
});

export function listFormats() {
  return registry.listFormats();
}

export { normalizeFormat };

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

export function convertContent({ content, from, to, title = "document", fileName = "" }) {
  return registry.convert({ content, from, to, title, fileName });
}
