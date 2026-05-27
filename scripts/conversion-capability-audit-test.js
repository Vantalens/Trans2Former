import assert from "node:assert/strict";

import {
  convertContent,
  getAllowedOutputFormats,
  getFormatCapabilities,
  getRouteTemperature,
  isModelReachable,
  listFormats,
  toConversionDocumentModel,
} from "../public/browser-transformer.js";
import { decodeTextBytes } from "../public/core/text-decoding.js";
import { createDocumentModel, createHeading, createParagraph, getPlainText } from "../public/core/document-model.js";
import { createReadableInputDisplay, shouldUseLargeTextPreview } from "../public/core/input-state.js";
import { readZipEntries } from "../public/core/zip-container.js";
import { writeStoredZip } from "../public/core/zip-writer.js";
import { bytesToDataUrl } from "../public/core/binary-utils.js";
import { writePptx } from "../public/formats/pptx.js";

const gbkChineseBytes = Uint8Array.from([0xD6, 0xD0, 0xCE, 0xC4, 0x2C, 0xB2, 0xE2, 0xCA, 0xD4]);
const decoded = decodeTextBytes(gbkChineseBytes, { fileName: "sample-gbk.csv", mime: "text/csv" });
assert.equal(decoded.text, "中文,测试");
assert.equal(decoded.encoding, "gb18030");

const utf8Bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("中文,测试")]);
assert.equal(decodeTextBytes(utf8Bom, { fileName: "sample-utf8.csv" }).text, "中文,测试");

const utf8Markdown = new TextEncoder().encode("# Uploaded\n\nhello from browser");
const decodedMarkdown = decodeTextBytes(utf8Markdown, { fileName: "uploaded.md", mime: "text/markdown" });
assert.equal(decodedMarkdown.text, "# Uploaded\n\nhello from browser");
assert.equal(decodedMarkdown.encoding, "utf-8");

const utf16le = Uint8Array.from([0x2d, 0x4e, 0x87, 0x65]);
assert.equal(decodeTextBytes(utf16le, { fileName: "sample.txt", mime: "text/plain" }).text, "中文");

const writableFormats = listFormats().output;
assert.deepEqual(writableFormats, ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "epub", "pptx", "pdf"]);
const binaryInputFormats = new Set(["doc", "docx", "xlsx", "epub", "pptx", "pdf", "png", "ofd"]);

function createLegacyDocFixture() {
  const encoder = new TextEncoder();
  const utf16le = (text) => Uint8Array.from([...text].flatMap((char) => [char.charCodeAt(0), 0x00]));
  return Uint8Array.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ...encoder.encode("DOC noise\n"),
    ...utf16le("Legacy Doc Title\n\n中文测试内容"),
    ...encoder.encode("\nmore noise"),
  ]);
}

const sourceByFormat = {
  md: "# 标题\n\n中文测试",
  html: '<!doctype html><meta charset="utf-8"><h1>标题</h1><p>中文测试</p>',
  txt: "标题\n\n中文测试",
  json: JSON.stringify({ title: "标题", text: "中文测试" }),
  csv: "列A,列B\n中文,测试\n",
  xml: '<?xml version="1.0" encoding="UTF-8"?><root><p>中文测试</p></root>',
  doc: createLegacyDocFixture(),
  ofd: '<?xml version="1.0" encoding="UTF-8"?><ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016"><ofd:DocBody><ofd:DocInfo><ofd:Title>标题</ofd:Title></ofd:DocInfo><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>',
};

for (const [from, content] of Object.entries(sourceByFormat)) {
  for (const to of writableFormats) {
    if (!getAllowedOutputFormats(from).includes(to)) {
      continue;
    }
    const result = convertContent({ content, from, to, title: `case.${from}`, fileName: `case.${from}` });
    assert.equal(result.format, to, `${from} -> ${to} should report the requested output format`);
    if (result.type === "text") {
      if (from === "doc") {
        assert.equal(result.data.includes("Legacy Doc Title"), true, `${from} -> ${to} should preserve readable legacy DOC text`);
      } else {
        assert.equal(/[�ï¿½]/.test(result.data), false, `${from} -> ${to} should not contain mojibake markers`);
      }
    }
  }
}

const xlsx = convertContent({ content: sourceByFormat.md, from: "md", to: "xlsx", title: "中文.xlsx" });
assert.equal(readZipEntries(xlsx.data).has("xl/workbook.xml"), true);
assert.equal(readZipEntries(xlsx.data).has("xl/sharedStrings.xml"), true);
assert.match(readZipEntries(xlsx.data).getText("xl/sharedStrings.xml"), /中文测试/);

const docxForDisplay = convertContent({ content: sourceByFormat.md, from: "md", to: "docx", title: "中文.docx" });
const docxDisplay = createReadableInputDisplay({
  rawContent: docxForDisplay.data,
  format: "docx",
  fileName: "中文.docx",
  binaryFormats: binaryInputFormats,
  toDocumentModel: (content, format, fileName) => convertContent({ content, from: format, to: "json", title: fileName, fileName }),
  getPlainText: (modelResult) => JSON.parse(modelResult.data).plainText || getPlainText(JSON.parse(modelResult.data)),
});
assert.match(docxDisplay, /中文测试/, "binary DOCX uploads should show extracted readable text in the editor");
assert.equal(docxDisplay.startsWith("data:"), false, "binary DOCX uploads must not display data URLs in the editor");
assert.equal(shouldUseLargeTextPreview({
  format: "docx",
  contentLength: 120 * 1024 * 1024,
  threshold: 50 * 1024 * 1024,
  binaryFormats: binaryInputFormats,
}), false, "binary inputs should parse through their reader instead of entering text-only large preview mode");

const epub = convertContent({ content: sourceByFormat.md, from: "md", to: "epub", title: "中文.epub" });
const epubZip = readZipEntries(epub.data);
assert.equal(epubZip.has("OEBPS/content.opf"), true);
assert.match(epubZip.getText("OEBPS/nav.xhtml"), /xmlns:epub="http:\/\/www\.idpf\.org\/2007\/ops"/);
assert.match(epubZip.getText("OEBPS/chapter.xhtml"), /中文测试/);
const chapterXhtml = epubZip.getText("OEBPS/chapter.xhtml");
const chapterHtmlTag = chapterXhtml.match(/<html\b[^>]*>/)?.[0] || "";
assert.equal((chapterHtmlTag.match(/(?:^|\s)lang=/g) || []).length, 1, "EPUB chapter.xhtml must not duplicate lang attributes");
assert.equal(/<[^>]+\/\/>/.test(chapterXhtml), false, "EPUB chapter.xhtml must not corrupt self-closing XML tags");

const pptx = writePptx({
  model: createDocumentModel({
    title: "中文.pptx",
    sourceFormat: "manual",
    blocks: [createHeading(1, "标题"), createParagraph("中文测试")],
  }),
  title: "中文.pptx",
});
const pptxZip = readZipEntries(pptx.data);
assert.equal(pptxZip.has("ppt/presentation.xml"), true);
assert.match(pptxZip.getText("ppt/slides/slide1.xml"), /中文测试/);
assert.equal(pptxZip.has("docProps/app.xml"), true, "PPTX output should include extended app properties for Office compatibility");
assert.match(pptxZip.getText("[Content_Types].xml"), /extended-properties\+xml/, "PPTX content types should register docProps/app.xml");
assert.match(pptxZip.getText("ppt/slideMasters/slideMaster1.xml"), /<p:sldLayoutIdLst>/, "PPTX slide master must declare its slide layouts");
assert.match(pptxZip.getText("ppt/slideMasters/_rels/slideMaster1.xml.rels"), /Target="\.\.\/slideLayouts\/slideLayout1\.xml"/, "PPTX slide master must relate to slideLayout1.xml");
assert.match(pptxZip.getText("ppt/slideLayouts/_rels/slideLayout1.xml.rels"), /Target="\.\.\/theme\/theme1\.xml"/, "PPTX slide layout theme relationship must stay inside ppt/theme");
assert.match(pptxZip.getText("ppt/theme/theme1.xml"), /<a:lnStyleLst><a:ln /, "PPTX theme must include concrete line styles instead of empty schema nodes");

assert.throws(
  () => convertContent({ content: sourceByFormat.md, from: "docx", to: "pptx", title: "blocked.pptx" }),
  /不支持此转换路径: docx -> pptx/
);

const ofdContainer = bytesToDataUrl(writeStoredZip([{ name: "OFD.xml", data: sourceByFormat.ofd }]), "application/ofd");
const ofdResult = JSON.parse(convertContent({ content: ofdContainer, from: "ofd", to: "json", title: "container.ofd" }).data);
assert.equal(ofdResult.metadata.ofd.container, "zip");
assert.match(ofdResult.plainText, /标题/);

console.log("Conversion capability audit passed: writable matrix is stable, placeholder image outputs are hidden, and GBK/UTF-8 text decoding preserves Chinese content.");

// Capability Registry / RoutePlanner（P8-M1）：声明每个格式归属的规范模型，
// 跨模型走 mapper。这里断言路径温度计算和 capability 暴露字段满足设计。
const capabilities = getFormatCapabilities();
const capabilityByFormat = new Map(capabilities.map((entry) => [entry.format, entry]));
assert.deepEqual(capabilityByFormat.get("md").inputModels, ["SemanticDoc"]);
assert.deepEqual(capabilityByFormat.get("md").outputModels, ["SemanticDoc"]);
assert.deepEqual(capabilityByFormat.get("csv").inputModels, ["WorkbookModel"]);
assert.deepEqual(capabilityByFormat.get("xlsx").outputModels, ["WorkbookModel"]);
assert.deepEqual(capabilityByFormat.get("pptx").inputModels, ["SlideModel"]);
assert.deepEqual(capabilityByFormat.get("pdf").inputModels, ["FixedLayoutModel"]);
assert.deepEqual(capabilityByFormat.get("ofd").inputModels, ["FixedLayoutModel"]);

// hot：reader / writer 共享同一模型
assert.equal(getRouteTemperature("md", "html"), "hot");
assert.equal(getRouteTemperature("md", "docx"), "hot");
assert.equal(getRouteTemperature("csv", "xlsx"), "hot");
assert.equal(getRouteTemperature("pptx", "pptx"), "hot");

// warm：经过一次 low-loss mapper（WorkbookModel ↔ SemanticDoc）
assert.equal(getRouteTemperature("csv", "md"), "warm");
assert.equal(getRouteTemperature("md", "csv"), "warm");
assert.equal(getRouteTemperature("xlsx", "html"), "warm");

// cold：经过一次 medium/high-loss mapper（SlideModel/FixedLayoutModel → SemanticDoc）
assert.equal(getRouteTemperature("pptx", "md"), "cold");
assert.equal(getRouteTemperature("pdf", "md"), "cold");
assert.equal(getRouteTemperature("pdf", "docx"), "cold");

// 模型可达性：当前所有产品矩阵中允许的路径在新机制下也都可达
for (const from of listFormats().input) {
  for (const to of getAllowedOutputFormats(from)) {
    assert.equal(
      isModelReachable(from, to),
      true,
      `RoutePlanner 应当能通过模型 + mapper 找到 ${from} -> ${to} 的路径`
    );
  }
}

const baseTemperature = getRouteTemperature("pdf", "docx");
assert.equal(baseTemperature, "cold", "PDF -> DOCX 默认走 FixedLayoutModel→SemanticDoc 应当为 cold");

const csvMarkdownModel = toConversionDocumentModel(sourceByFormat.csv, "csv", "md", "route.csv");
assert.equal(
  csvMarkdownModel.metadata.warnings.some((warning) => warning.code === "MODEL_STYLE_DROPPED"),
  true,
  "warm cross-model routes must expose their forced loss warning in the conversion quality report"
);
assert.equal(csvMarkdownModel.metadata.conversion.routeTemperature, "warm");

const pdfDocxModel = toConversionDocumentModel(sourceByFormat.md, "pdf", "docx", "route.pdf");
assert.equal(
  pdfDocxModel.metadata.warnings.some((warning) => warning.code === "MODEL_VISUAL_FIDELITY_LOST"),
  true,
  "cold fixed-layout routes must expose fidelity loss warnings before export"
);
assert.equal(pdfDocxModel.metadata.conversion.routeTemperature, "cold");

console.log("Capability Registry / RoutePlanner test passed: core model annotations and route temperatures cover the current product matrix.");
