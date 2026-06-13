#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  convertContent,
  getAllowedOutputFormats,
  getOutputExtension,
  listFormats,
} from "../public/browser-transformer.js";
import { readZipEntries } from "../public/core/zip-container.js";

const textFixture = `# 标题

中文测试内容

| 字段 | 值 |
| --- | --- |
| 城市 | 上海 |
| 状态 | 正常 |
`;

const csvFixture = "字段,值\n城市,上海\n状态,正常\n";
const jsonFixture = JSON.stringify({
  title: "标题",
  blocks: [
    { type: "heading", level: 1, text: "标题" },
    { type: "paragraph", text: "中文测试内容" },
    { type: "table", headers: ["字段", "值"], rows: [["城市", "上海"], ["状态", "正常"]] },
  ],
});

const sourceByFormat = {
  md: textFixture,
  html: `<!doctype html><meta charset="utf-8"><h1>标题</h1><p>中文测试内容</p><table><tr><th>字段</th><th>值</th></tr><tr><td>城市</td><td>上海</td></tr></table>`,
  txt: "标题\n\n中文测试内容\n城市 上海\n",
  csv: csvFixture,
  json: jsonFixture,
  xml: '<?xml version="1.0" encoding="UTF-8"?><root><title>标题</title><p>中文测试内容</p></root>',
};

function bytesFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/);
  assert.ok(match, "binary outputs must be base64 data URLs with a concrete MIME type");
  return {
    mime: match[1],
    bytes: new Uint8Array(Buffer.from(match[2], "base64")),
  };
}

function assertZipOutput(result, requiredEntries, { ooxml = false } = {}) {
  const { bytes } = bytesFromDataUrl(result.data);
  assert.equal(bytes[0], 0x50, `${result.format} must start with ZIP local file header`);
  assert.equal(bytes[1], 0x4b, `${result.format} must start with ZIP local file header`);
  const zip = readZipEntries(result.data);
  for (const entry of requiredEntries) {
    assert.equal(zip.has(entry), true, `${result.format} missing ${entry}`);
  }
  if (ooxml) {
    assert.equal(zip.has("[Content_Types].xml"), true, `${result.format} missing content types`);
  }
  return zip;
}

function assertPdfOutput(result) {
  const { mime, bytes } = bytesFromDataUrl(result.data);
  assert.equal(mime, "application/pdf");
  const pdfText = Buffer.from(bytes).toString("latin1");
  assert.equal(pdfText.startsWith("%PDF-"), true, "PDF must start with a PDF header");
  assert.match(pdfText, /\/Type0|\/CIDFontType0|\/UniGB-UCS2-H/, "PDF must use a Unicode/CJK-capable font path");
  assert.match(pdfText, /\/Title <FEFF/, "PDF metadata title must use UTF-16BE hex to avoid mojibake in browser viewers");
  assert.doesNotMatch(pdfText, /\/Title \([^)]*[\x80-\xff]/, "PDF title must not write non-ASCII text as a literal string");
  assert.match(pdfText, /%%EOF\s*$/, "PDF must end with EOF marker");
}

function assertImageOutputNotExposed(from, to) {
  assert.equal(
    getAllowedOutputFormats(from).includes(to),
    false,
    `${from} -> ${to} must stay hidden until visual rendering preserves document content`
  );
}

const requiredZipEntries = {
  docx: ["word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "docProps/core.xml"],
  xlsx: ["xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/sharedStrings.xml", "xl/styles.xml", "docProps/core.xml"],
  epub: ["mimetype", "META-INF/container.xml", "OEBPS/content.opf", "OEBPS/chapter.xhtml"],
  pptx: [
    "ppt/presentation.xml",
    "ppt/slides/slide1.xml",
    "ppt/slides/_rels/slide1.xml.rels",
    "ppt/slideMasters/slideMaster1.xml",
    "ppt/slideLayouts/slideLayout1.xml",
    "ppt/theme/theme1.xml",
    "docProps/app.xml",
  ],
};

const outputs = listFormats().output;
assert.equal(outputs.includes("jpeg"), false, "JPEG must not be advertised while it is only a placeholder writer");

for (const [from, source] of Object.entries(sourceByFormat)) {
  for (const to of getAllowedOutputFormats(from)) {
    const result = convertContent({ content: source, from, to, title: `case.${from}`, fileName: `case.${from}` });
    assert.equal(result.format, to, `${from} -> ${to} should report target format`);
    assert.equal(getOutputExtension(to).length > 0, true, `${to} must have an extension`);

    if (result.type === "text") {
      assert.equal(/[�ï¿½]/.test(result.data), false, `${from} -> ${to} should not contain mojibake`);
      assert.match(result.data, /标题|中文|字段|城市|上海/, `${from} -> ${to} should preserve readable content`);
    } else {
      if (requiredZipEntries[to]) {
        const zip = assertZipOutput(result, requiredZipEntries[to], { ooxml: ["docx", "xlsx", "pptx"].includes(to) });
        const combinedXml = requiredZipEntries[to].map((entry) => zip.getText(entry)).join("\n");
        assert.match(combinedXml, /标题|中文|字段|城市|上海/, `${from} -> ${to} should preserve content inside package XML`);
      } else if (to === "pdf") {
        assertPdfOutput(result);
      } else {
        throw new Error(`${from} -> ${to} has no strict integrity assertion`);
      }
    }
  }
}

const chinesePdfTitle = convertContent({
  content: textFixture,
  from: "md",
  to: "pdf",
  title: "期中考试备考指导.md",
  fileName: "期中考试备考指导.md",
});
const chinesePdfText = Buffer.from(bytesFromDataUrl(chinesePdfTitle.data).bytes).toString("latin1");
assert.match(
  chinesePdfText,
  /\/Title <FEFF671F4E2D80038BD55907800363075BFC002E006D0064>/,
  "Chinese PDF titles must be encoded as UTF-16BE hex with BOM"
);
assert.equal(chinesePdfText.includes("/Title (期中考试备考指导.md)"), false, "Chinese PDF titles must not be literal strings");

for (const from of ["md", "html", "txt", "json", "xml", "csv", "docx", "xlsx", "epub", "pdf", "pptx", "png"]) {
  assertImageOutputNotExposed(from, "jpeg");
}

assertImageOutputNotExposed("docx", "pptx");
assertImageOutputNotExposed("pdf", "pptx");

// issue #92: DOCX w:tab/w:br/w:cr 提取
const docxBreaksXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Line</w:t><w:tab/><w:t>one</w:t><w:br/><w:t>line</w:t><w:cr/><w:t>two</w:t></w:r></w:p>
  </w:body>
</w:document>`;
const { writeStoredZip } = await import("../public/core/zip-writer.js");
const { bytesToDataUrl } = await import("../public/core/binary-utils.js");
const docxBreaksZip = bytesToDataUrl(writeStoredZip([
  { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: "word/document.xml", data: docxBreaksXml },
  { name: "word/_rels/document.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>' },
]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
const docxBreaksModel = JSON.parse(convertContent({ content: docxBreaksZip, from: "docx", to: "json", title: "breaks.docx" }).data);
const docxBreaksText = docxBreaksModel.blocks.map((b) => b.text || "").join(" ");
assert.match(docxBreaksText, /Line\tone/, "DOCX w:tab must decode as tab character");
assert.match(docxBreaksText, /one[\s\n]+line/, "DOCX w:br must decode as newline or space");

// issue #93: DOCX 嵌套表格平衡扫描
const docxNestedXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Outer A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Outer A2</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc>
        <w:tbl>
          <w:tr><w:tc><w:p><w:r><w:t>Inner B1</w:t></w:r></w:p></w:tc></w:tr>
        </w:tbl>
      </w:tc><w:tc><w:p><w:r><w:t>Outer B2</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>Post-table text</w:t></w:r></w:p>
  </w:body>
</w:document>`;
const docxNestedZip = bytesToDataUrl(writeStoredZip([
  { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: "word/document.xml", data: docxNestedXml },
  { name: "word/_rels/document.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>' },
]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
const docxNestedModel = JSON.parse(convertContent({ content: docxNestedZip, from: "docx", to: "json", title: "nested.docx" }).data);
assert.equal(docxNestedModel.blocks.filter((b) => b.type === "table").length, 1, "DOCX nested tables must be flattened into the parent cell");
assert.ok(docxNestedModel.blocks.some((b) => b.text === "Post-table text"), "DOCX post-table paragraphs must not be swallowed by unclosed table parsing");

// issue #95: EPUB 列表/引用/代码块识别
const epubRich = convertContent({
  content: `# Title
- Item 1
- Item 2

> Quote text

\`\`\`js
const x = 1;
\`\`\``,
  from: "md",
  to: "epub",
  title: "rich.epub",
});
const epubZip = readZipEntries(epubRich.data);
const epubChapter = epubZip.getText("OEBPS/chapter.xhtml");
assert.match(epubChapter, /<ul\b/, "EPUB chapter must contain <ul> for list");
assert.match(epubChapter, /<blockquote\b/, "EPUB chapter must contain <blockquote>");
assert.match(epubChapter, /<pre\b/, "EPUB chapter must contain <pre> for code");
const epubRoundtrip = JSON.parse(convertContent({ content: epubRich.data, from: "epub", to: "json", title: "rt.epub" }).data);
assert.ok(epubRoundtrip.blocks.some((b) => b.type === "list"), "EPUB reader must extract lists");
assert.ok(epubRoundtrip.blocks.some((b) => b.type === "quote"), "EPUB reader must extract blockquotes");
assert.ok(epubRoundtrip.blocks.some((b) => b.type === "code"), "EPUB reader must extract code blocks");

// issue #96: XML 控制字符过滤端到端
const dirtyText = "clean\tkeepstrip￾";
const xmlDirty = convertContent({ content: `# Test\n\n${dirtyText}`, from: "md", to: "xml", title: "dirty.xml" });
assert.equal(xmlDirty.data.includes(""), false, "XML output must not contain U+0001");
assert.equal(xmlDirty.data.includes(""), false, "XML output must not contain U+0007");
assert.equal(xmlDirty.data.includes(""), false, "XML output must not contain U+000B");
assert.equal(xmlDirty.data.includes("￾"), false, "XML output must not contain U+FFFE");
assert.match(xmlDirty.data, /clean.*\t.*keep/, "XML output must preserve tab character");
const docxDirty = convertContent({ content: `# Test\n\n${dirtyText}`, from: "md", to: "docx", title: "dirty.docx" });
const docxDirtyZip = readZipEntries(docxDirty.data);
const docxDirtyDoc = docxDirtyZip.getText("word/document.xml");
assert.equal(docxDirtyDoc.includes(""), false, "DOCX document.xml must not contain control chars");
const epubDirty = convertContent({ content: `# Test\n\n${dirtyText}`, from: "md", to: "epub", title: "dirty.epub" });
const epubDirtyZip = readZipEntries(epubDirty.data);
const epubDirtyChapter = epubDirtyZip.getText("OEBPS/chapter.xhtml");
assert.equal(epubDirtyChapter.includes(""), false, "EPUB chapter.xhtml must not contain control chars");

console.log("Format integrity test passed: advertised outputs are structurally valid and placeholder visual outputs are hidden.");
