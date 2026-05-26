import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync, deflateSync } from "node:zlib";

import {
  convertContent,
  expandPdfContentForTextExtraction,
  getAllowedOutputFormats,
  listFormats,
  renderPreviewHtml,
  toDocumentModel,
} from "../public/browser-transformer.js";
import {
  chunkTextByLines,
  compareDocumentModelsForEquivalence,
  mergePartialDocumentModels,
} from "../public/core/chunking.js";
import { ConversionError, normalizeConversionError } from "../public/core/conversion-error.js";
import { assertValidDocumentModel, validateDocumentModel } from "../public/core/document-schema.js";
import { readZipEntries } from "../public/core/zip-container.js";

const SAMPLE_ROOT = path.resolve("samples");
const INPUT_FORMATS = ["md", "html", "txt", "json", "csv", "xml", "png", "docx", "doc", "xlsx", "epub", "pptx", "pdf", "ofd"];
const OUTPUT_FORMATS = ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "epub", "pptx", "pdf"];
const TEXT_OUTPUT_FORMATS = ["md", "html", "txt", "json", "xml"];
const EXPECTED_BLOCK_TYPES = ["heading", "paragraph", "list", "code", "table", "quote", "image", "asset", "raw"];

const SAMPLE_MATRIX = {
  md: ["chinese.md", "table-code.md", "image-link.md"],
  html: ["article.html", "table-list.html", "inline-media.html"],
  txt: ["chinese.txt", "long-lines.txt", "code-list.txt"],
  json: ["object.json", "array.json", "document-model.json"],
  csv: ["basic.csv", "quoted.csv", "unicode.csv"],
  xml: ["basic.xml", "attributes.xml", "namespace.xml"],
  png: ["tiny-red.data-url.txt", "tiny-green.data-url.txt", "tiny-blue.data-url.txt"],
};

const tests = [];
const encoder = new TextEncoder();

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`Smoke test passed: ${tests.length} test groups completed.`);
}

async function readSample(format, fileName) {
  return readFile(path.join(SAMPLE_ROOT, format, fileName), "utf8");
}

async function readSamples() {
  const samples = [];
  for (const [format, fileNames] of Object.entries(SAMPLE_MATRIX)) {
    for (const fileName of fileNames) {
      samples.push({
        format,
        fileName,
        content: await readSample(format, fileName),
      });
    }
  }
  return samples;
}

function uint32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function uint16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/)?.[1] || "";
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function createStoredZip(entries) {
  return createZip(entries, { compression: "store" });
}

function createDeflatedZip(entries) {
  return createZip(entries, { compression: "deflate" });
}

function createCentralZip(entries, options = {}) {
  return createZip(entries, { ...options, centralDirectory: true });
}

function createZip(entries, { compression = "store", centralDirectory = false, centralNameOverride = null } = {}) {
  const chunks = [];
  const centralChunks = [];
  let localOffset = 0;
  for (const [name, textOrBytes] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const centralNameBytes = encoder.encode(centralNameOverride || name);
    const data = textOrBytes instanceof Uint8Array ? textOrBytes : encoder.encode(textOrBytes);
    const compressed = compression === "deflate" ? new Uint8Array(deflateRawSync(data)) : data;
    const method = compression === "deflate" ? 8 : 0;
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(method),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(compressed.length),
      ...uint32(data.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
    ]);
    chunks.push(localHeader);
    chunks.push(nameBytes, compressed);
    if (centralDirectory) {
      centralChunks.push(new Uint8Array([
        ...uint32(0x02014b50),
        ...uint16(20),
        ...uint16(20),
        ...uint16(0),
        ...uint16(method),
        ...uint16(0),
        ...uint16(0),
        ...uint32(0),
        ...uint32(compressed.length),
        ...uint32(data.length),
        ...uint16(centralNameBytes.length),
        ...uint16(0),
        ...uint16(0),
        ...uint16(0),
        ...uint16(0),
        ...uint32(0),
        ...uint32(localOffset),
      ]));
      centralChunks.push(centralNameBytes);
    }
    localOffset += localHeader.length + nameBytes.length + compressed.length;
  }
  if (centralDirectory) {
    const centralOffset = localOffset;
    const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(...centralChunks);
    chunks.push(new Uint8Array([
      ...uint32(0x06054b50),
      ...uint16(0),
      ...uint16(0),
      ...uint16(Object.keys(entries).length),
      ...uint16(Object.keys(entries).length),
      ...uint32(centralSize),
      ...uint32(centralOffset),
      ...uint16(0),
    ]));
  }
  return concatBytes(chunks);
}

function createLegacyDocFixture() {
  const prefix = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const utf16le = (text) => Uint8Array.from([...text].flatMap((char) => [char.charCodeAt(0), 0x00]));
  return concatBytes([
    prefix,
    encoder.encode("legacy binary noise\n"),
    utf16le("Legacy Doc Title\n\nBody text from a legacy DOC file."),
    encoder.encode("\nmore noise\n"),
    utf16le("Appendix line"),
  ]);
}

function createDocxFixture() {
  return createStoredZip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
  <Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Docx Title</w:t></w:r></w:p>
    <w:p><w:r><w:t>Hello </w:t></w:r><w:hyperlink r:id="rIdLink"><w:r><w:t>Example</w:t></w:r></w:hyperlink></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:drawing><a:blip r:embed="rIdImage"/></w:drawing></w:r></w:p>
  </w:body>
</w:document>`,
    "word/media/image1.png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  });
}

function createAdvancedDocxFixture() {
  return createDeflatedZip({
    "[Content_Types].xml": "<Types></Types>",
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rImg" Type="image" Target="media/image1.png"/>
  <Relationship Id="rHeader" Type="header" Target="header1.xml"/>
  <Relationship Id="rFooter" Type="footer" Target="footer1.xml"/>
</Relationships>`,
    "word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Advanced Docx</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First item</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Nested item</w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Merged</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  <w:p><w:r><w:t>Main body</w:t></w:r><w:footnoteReference w:id="2"/><w:commentReference w:id="4"/></w:p>
  <w:p><w:r><w:drawing><wp:inline><wp:docPr id="9" name="Logo" descr="Logo alt text"/><a:graphic><a:graphicData><a:blip r:embed="rImg"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
</w:body></w:document>`,
    "word/footnotes.xml": `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="2"><w:p><w:r><w:t>Footnote text</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    "word/comments.xml": `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="4"><w:p><w:r><w:t>Comment text</w:t></w:r></w:p></w:comment></w:comments>`,
    "word/header1.xml": `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header text</w:t></w:r></w:p></w:hdr>`,
    "word/footer1.xml": `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Footer text</w:t></w:r></w:p></w:ftr>`,
    "word/media/image1.png": new Uint8Array([137, 80, 78, 71]),
  });
}

function createXlsxFixture() {
  return createStoredZip({
    "[Content_Types].xml": "<Types></Types>",
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet One" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si><si><t>Value</t></si><si><t>A</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1</v></c></row></sheetData></worksheet>`,
  });
}

function createAdvancedXlsxFixture() {
  return createDeflatedZip({
    "[Content_Types].xml": "<Types></Types>",
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Finance" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Date</t></si><si><t>Total</t></si></sst>`,
    "xl/styles.xml": `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" s="1"><v>44927</v></c><c r="B2"><f>SUM(1,2)</f><v>3</v></c></row>
  </sheetData>
</worksheet>`,
  });
}

function createEpubFixture() {
  return createStoredZip({
    "mimetype": "application/epub+zip",
    "META-INF/container.xml": `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    "OEBPS/content.opf": `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">EPUB Title</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`,
    "OEBPS/chapter.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter One</h1><p>Hello EPUB.</p><table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table></body></html>`,
  });
}

function createPptxFixture() {
  return createStoredZip({
    "[Content_Types].xml": "<Types></Types>",
    "ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Slide Title</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Bullet one</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  });
}

function createAdvancedPptxFixture() {
  return createDeflatedZip({
    "[Content_Types].xml": "<Types></Types>",
    "ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/></Relationships>`,
    "ppt/slides/_rels/slide1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rImg" Type="image" Target="../media/image1.png"/>
  <Relationship Id="rNotes" Type="notesSlide" Target="../notesSlides/notesSlide1.xml"/>
  <Relationship Id="rMaster" Type="slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
    "ppt/slides/slide1.xml": `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:cSld><p:spTree>
  <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Advanced Slide</a:t></a:r></a:p></p:txBody></p:sp>
  <p:pic><p:nvPicPr><p:cNvPr id="3" name="Picture" descr="Chart image alt"/></p:nvPicPr><p:blipFill><a:blip r:embed="rImg"/></p:blipFill></p:pic>
  <p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Value</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Speed</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Fast</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`,
    "ppt/notesSlides/notesSlide1.xml": `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker notes text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    "ppt/slideMasters/slideMaster1.xml": `<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:sldMaster>`,
    "ppt/media/image1.png": new Uint8Array([137, 80, 78, 71]),
  });
}

function createPdfFixture() {
  return `%PDF-1.4
1 0 obj
<< /Type /Catalog >>
endobj
2 0 obj
<< /Length 60 >>
stream
BT
(PDF Title) Tj
(Hello PDF text extraction) Tj
ET
endstream
endobj
%%EOF`;
}

function assertValidOutput(result, toFormat, label) {
  assert.equal(result.format, toFormat, `${label} should output ${toFormat}`);
  assert.equal(typeof result.data, "string", `${label} should return string data`);
  assert.equal(result.data.trim().length > 0, true, `${label} should not return empty data`);
  if (["docx", "pdf"].includes(toFormat)) {
    assert.equal(result.type, "binary", `${label} should use binary output`);
    assert.equal(result.data.startsWith("data:"), true, `${label} should return a data URL`);
  } else {
    assert.equal(result.type, "text", `${label} should use text output`);
  }
}

test("format registry exposes the supported input and output matrix", () => {
  const formats = listFormats();
  assert.deepEqual(formats.input, INPUT_FORMATS);
  assert.deepEqual(formats.output, OUTPUT_FORMATS);
});

test("ZIP/OOXML container reader exposes stored entries and text payloads", () => {
  const docxBytes = createDocxFixture();
  const zip = readZipEntries(docxBytes);
  assert.equal(zip.has("[Content_Types].xml"), true);
  assert.equal(zip.has("word/document.xml"), true);
  assert.equal(zip.getText("word/document.xml").includes("Docx Title"), true);
  assert.equal(zip.getBytes("word/media/image1.png")[1], 80);
});

test("ZIP/OOXML container reader inflates deflated entries and rejects unsafe paths", () => {
  const zip = readZipEntries(createDeflatedZip({ "word/document.xml": "<root>deflated</root>" }));
  assert.equal(zip.getText("word/document.xml"), "<root>deflated</root>");
  assert.equal(readZipEntries(createCentralZip({ "word/document.xml": "<root>central</root>" })).getText("word/document.xml"), "<root>central</root>");

  assert.throws(
    () => readZipEntries(createStoredZip({ "../escape.txt": "bad" })),
    (error) => error instanceof ConversionError && error.code === "ZIP_UNSAFE_ENTRY_PATH"
  );
  assert.throws(
    () => readZipEntries(createCentralZip({ "word/document.xml": "<root />" }, { centralNameOverride: "word/missing.xml" })),
    (error) => error instanceof ConversionError && error.code === "ZIP_CENTRAL_DIRECTORY_MISMATCH"
  );
});

test("DOC input best-effort extraction converts legacy binary text to DocumentModel", () => {
  const docBytes = createLegacyDocFixture();
  const model = toDocumentModel(docBytes, "doc", "fixture.doc");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks.some((block) => String(block.text || "").includes("Legacy Doc Title")), true);

  const markdown = convertContent({ content: docBytes, from: "doc", to: "md", title: "fixture.doc" });
  assertValidOutput(markdown, "md", "doc to markdown");
  assert.equal(markdown.data.includes("Legacy Doc Title"), true);
});

test("DOCX input MVP extracts headings, paragraphs, tables, links, and image assets", () => {
  const docxBytes = createDocxFixture();
  const model = toDocumentModel(docxBytes, "docx", "fixture.docx");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks[0].type, "heading");
  assert.equal(model.blocks[0].text, "Docx Title");
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("Hello Example")), true);
  assert.equal(model.blocks.some((block) => block.type === "table" && block.headers[0] === "Name"), true);
  assert.equal(model.assets.length, 1);
  assert.equal(model.assets[0].mime, "image/png");
  assert.equal(model.metadata.ooxml.relationshipCount, 2);

  const markdown = convertContent({ content: docxBytes, from: "docx", to: "md", title: "fixture.docx" });
  assertValidOutput(markdown, "md", "docx to markdown");
  assert.equal(markdown.data.includes("# Docx Title"), true);
  assert.equal(markdown.data.includes("| Name | Value |"), true);

  const html = convertContent({ content: docxBytes, from: "docx", to: "html", title: "fixture.docx" });
  assertValidOutput(html, "html", "docx to html");
  assert.equal(html.data.includes("<h1>Docx Title</h1>"), true);

  const json = convertContent({ content: docxBytes, from: "docx", to: "json", title: "fixture.docx" });
  assertValidOutput(json, "json", "docx to json");
  assert.equal(JSON.parse(json.data).from, "docx");
});

test("DOCX reader emits structured inline nodes for runs and hyperlinks (P9-C)", () => {
  const docxBytes = createDocxFixture();
  const model = toDocumentModel(docxBytes, "docx", "fixture.docx");
  const helloParagraph = model.blocks.find((block) => block.type === "paragraph" && (block.text || "").startsWith("Hello"));
  assert.equal(helloParagraph !== undefined, true);
  assert.equal(Array.isArray(helloParagraph.inlines), true);
  const link = helloParagraph.inlines.find((node) => node.type === "link");
  assert.equal(link !== undefined, true);
  assert.equal(link.href, "https://example.com");
  assert.equal(link.inlines[0].type, "text");
  assert.equal(link.inlines[0].value, "Example");

  const md = convertContent({ content: docxBytes, from: "docx", to: "md", title: "fixture.docx" }).data;
  assert.match(md, /Hello \[Example\]\(https:\/\/example\.com\)/);
});

test("DOCX input enhancement extracts lists, header/footer, footnotes, comments, merge warnings, and image alt text", () => {
  const model = toDocumentModel(createAdvancedDocxFixture(), "docx", "advanced.docx");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks.some((block) => block.type === "list" && block.items.includes("First item")), true);
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("Header text")), true);
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("Footer text")), true);
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("Footnote text")), true);
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("Comment text")), true);
  assert.equal(model.blocks.some((block) => block.type === "asset" && block.alt === "Logo alt text"), true);
  assert.equal(model.metadata.warnings.some((warning) => warning.code === "DOCX_TABLE_MERGE_APPROXIMATED"), true);
  assert.equal(model.metadata.ooxml.compressionMethods.includes(8), true);
});

test("XLSX input MVP extracts worksheets into DocumentModel tables", () => {
  const xlsxBytes = createXlsxFixture();
  const model = toDocumentModel(xlsxBytes, "xlsx", "fixture.xlsx");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks[0].type, "heading");
  assert.equal(model.blocks[0].text, "Sheet One");
  const table = model.blocks.find((block) => block.type === "table");
  assert.deepEqual(table.headers, ["Name", "Value"]);
  assert.deepEqual(table.rows[0], ["A", "1"]);

  const markdown = convertContent({ content: xlsxBytes, from: "xlsx", to: "md", title: "fixture.xlsx" });
  assertValidOutput(markdown, "md", "xlsx to markdown");
  assert.equal(markdown.data.includes("| Name | Value |"), true);
});

test("XLSX input enhancement preserves formulas, dates, merged-cell warnings, and metadata", () => {
  const model = toDocumentModel(createAdvancedXlsxFixture(), "xlsx", "advanced.xlsx");
  assert.equal(validateDocumentModel(model).ok, true);
  const table = model.blocks.find((block) => block.type === "table");
  assert.deepEqual(table.headers, ["Date", "Total"]);
  assert.deepEqual(table.rows[0], ["2023-01-01", "=SUM(1,2) => 3"]);
  assert.equal(model.metadata.warnings.some((warning) => warning.code === "XLSX_MERGED_CELLS_APPROXIMATED"), true);
  assert.equal(model.metadata.ooxml.formulaCellCount, 1);
});

test("XLSX writer preserves formula cache and merge ranges from WorkbookModel (P9-B)", () => {
  const fixture = createAdvancedXlsxFixture();
  const model = toDocumentModel(fixture, "xlsx", "advanced.xlsx");
  assert.equal(model.workbook.sheets[0].formulas.length, 1);
  assert.equal(model.workbook.sheets[0].merges.length, 1);

  const output = convertContent({ content: fixture, from: "xlsx", to: "xlsx", title: "advanced.xlsx" });
  const outZip = readZipEntries(output.data);
  const sheetXmlOut = outZip.getText("xl/worksheets/sheet1.xml");
  // 公式表达式 + 缓存值都应当回写
  assert.match(sheetXmlOut, /<f>SUM\(1,2\)<\/f><v>3<\/v>/);
  // mergeCells 节点应当存在
  assert.match(sheetXmlOut, /<mergeCells count="1">[\s\S]*<mergeCell ref="A1:B1"\/>[\s\S]*<\/mergeCells>/);
});

test("EPUB input MVP follows OPF spine and extracts XHTML structure", () => {
  const epubBytes = createEpubFixture();
  const model = toDocumentModel(epubBytes, "epub", "fixture.epub");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks.some((block) => block.type === "heading" && block.text === "EPUB Title"), true);
  assert.equal(model.blocks.some((block) => block.type === "heading" && block.text === "Chapter One"), true);
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text === "Hello EPUB."), true);

  const html = convertContent({ content: epubBytes, from: "epub", to: "html", title: "fixture.epub" });
  assertValidOutput(html, "html", "epub to html");
  assert.equal(html.data.includes("Chapter One"), true);
});

test("PDF text extraction MVP reads literal text operators", () => {
  const pdf = createPdfFixture();
  const model = toDocumentModel(pdf, "pdf", "fixture.pdf");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks[0].type, "heading");
  assert.equal(model.blocks[0].text, "PDF Title");
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("Hello PDF")), true);
});

test("PDF reader does not expose binary object noise as text", () => {
  const noisyPdf = `%PDF-1.7
1 0 obj
<< /Length 95 >>
stream
binary prefix (Ó3□FC\u0000\u0001mió7×□|Ô±fRª³□}2□H$□µÑ˜=□m5ÉáUô) Tj binary suffix
endstream
endobj
%%EOF`;
  const model = toDocumentModel(noisyPdf, "pdf", "binary-noise.pdf");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks.some((block) => String(block.text || "").includes("Ó3□FC")), false);
  assert.equal(model.blocks[0].type, "paragraph");
  assert.match(model.blocks[0].text, /这是有效 PDF/);
  assert.equal(model.blocks.some((block) => block.type === "raw" && block.format === "html" && block.content.includes("application/pdf")), true);
  assert.equal(model.metadata.warnings.some((warning) => warning.code === "PDF_NO_CREDIBLE_TEXT"), true);

  const html = convertContent({ content: noisyPdf, from: "pdf", to: "html", title: "binary-noise.pdf" });
  assert.equal(html.data.includes('type="application/pdf"'), true);
  assert.equal(html.data.includes("Ó3□FC"), false);
});

test("PDF reader rejects font Glyph ID noise as text", () => {
  const fragments = ["yX", "RX", "kX", "jX", "9X", "8X", "eX", "dX", "RX", "RXR", "RXk", "URV", "UkV", "UjV"];
  const operators = fragments.map((value) => `(${value}) Tj`).join("\n");
  const glyphIdPdf = `%PDF-1.7
1 0 obj
<< /Length ${operators.length + 8} >>
stream
BT
${operators}
ET
endstream
endobj
%%EOF`;
  const model = toDocumentModel(glyphIdPdf, "pdf", "glyph-noise.pdf");
  assert.equal(validateDocumentModel(model).ok, true);
  // 短碎片整体被拦下，不应进入 paragraph blocks。
  for (const fragment of fragments) {
    assert.equal(
      model.blocks.some((block) => block.type === "paragraph" && (block.text || "").includes(fragment) && (block.text || "").length < 40),
      false,
      `font GID fragment "${fragment}" must not surface as a paragraph`
    );
  }
  assert.equal(model.metadata.warnings.some((warning) => warning.code === "PDF_FONT_GLYPH_ID_NOISE"), true);
  assert.equal(model.metadata.pdf.extraction, "embedded-original-pdf-glyph-noise");
});

test("PDF reader consumes pdfjs-layout payload with structured blocks", () => {
  const layoutPayload = {
    engine: "pdfjs-layout",
    pages: [
      {
        pageNumber: 1,
        blocks: [
          { type: "heading", level: 1, text: "线性代数复习讲义" },
          { type: "heading", level: 2, text: "第一章 向量空间" },
          { type: "paragraph", text: "向量空间的定义和基本性质。" },
          { type: "list", ordered: false, items: ["线性独立", "线性相关", "基与维数"] },
          { type: "paragraph", text: "下面给出若干例题。" },
        ],
        layout: {
          pageNumber: 1,
          size: { width: 595, height: 842, unit: "pt" },
          textRuns: [
            { text: "线性代数复习讲义", bbox: { x: 80, y: 760, w: 350, h: 28 }, fontName: "STSong", fontSize: 28 },
            { text: "向量空间的定义和基本性质。", bbox: { x: 80, y: 600, w: 350, h: 12 }, fontName: "STSong", fontSize: 12 },
          ],
          annotations: [],
        },
      },
    ],
  };
  const sentinelStart = "% Trans2Former PDFJS_TEXT_START";
  const sentinelEnd = "% Trans2Former PDFJS_TEXT_END";
  const encoded = `base64:${Buffer.from(JSON.stringify(layoutPayload), "utf8").toString("base64")}`;
  const fakePdfWithLayout = `%PDF-1.7\n%%EOF\n${sentinelStart}\n${encoded}\n${sentinelEnd}\n`;
  const model = toDocumentModel(fakePdfWithLayout, "pdf", "layout.pdf");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks[0].type, "heading");
  assert.equal(model.blocks[0].level, 1);
  assert.equal(model.blocks[0].text, "线性代数复习讲义");
  assert.equal(model.blocks[1].type, "heading");
  assert.equal(model.blocks[1].level, 2);
  assert.equal(model.blocks.find((block) => block.type === "list" && block.items.includes("线性独立")) !== undefined, true);
  assert.equal(model.metadata.pdf.extraction, "pdfjs-layout");
  assert.equal(model.metadata.warnings.some((warning) => warning.code === "PDF_LAYOUT_HEURISTIC"), true);
  assert.equal(model.metadata.warnings.some((warning) => warning.code === "PDF_NO_CREDIBLE_TEXT"), false);

  // P8-M4：FixedLayoutModel 应当一并挂在顶层
  assert.equal(model.fixedLayout.schemaVersion, "trans2former.fixedlayout.v1");
  assert.equal(model.fixedLayout.pages.length, 1);
  assert.equal(model.fixedLayout.pages[0].size.width, 595);
  assert.equal(model.fixedLayout.pages[0].textRuns.length, 2);
  assert.equal(model.fixedLayout.pages[0].textRuns[0].fontSize, 28);
});

test("PDF text extraction expands FlateDecode text streams", async () => {
  const compressedStream = deflateSync(Buffer.from("BT\n(Compressed PDF Title) Tj\n(Readable text from a normal compressed PDF.) Tj\nET", "latin1"));
  const pdf = `%PDF-1.7
1 0 obj
<< /Length ${compressedStream.length} /Filter /FlateDecode >>
stream
${compressedStream.toString("latin1")}
endstream
endobj
%%EOF`;
  const expanded = await expandPdfContentForTextExtraction(pdf);
  const model = toDocumentModel(expanded, "pdf", "compressed.pdf");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks[0].type, "heading");
  assert.equal(model.blocks[0].text, "Compressed PDF Title");
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("normal compressed PDF")), true);
});

test("PDF text extraction decodes ToUnicode CMap hex text streams", async () => {
  const cmapStream = `2 beginbfchar
<0001> <7EBF>
<0002> <6027>
endbfchar`;
  const textStream = "BT\n<00010002> Tj\nET";
  const compressedCmap = deflateSync(Buffer.from(cmapStream, "latin1"));
  const compressedText = deflateSync(Buffer.from(textStream, "latin1"));
  const pdf = `%PDF-1.7
1 0 obj
<< /Length ${compressedCmap.length} /Filter /FlateDecode >>
stream
${compressedCmap.toString("latin1")}
endstream
endobj
2 0 obj
<< /Length ${compressedText.length} /Filter /FlateDecode >>
stream
${compressedText.toString("latin1")}
endstream
endobj
%%EOF`;
  const expanded = await expandPdfContentForTextExtraction(pdf);
  const model = toDocumentModel(expanded, "pdf", "cmap.pdf");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks[0].text, "线性");
});

test("PDF text extraction does not apply unrelated ToUnicode CMaps globally", async () => {
  const firstCmap = `1 beginbfchar
<0001> <9519>
endbfchar`;
  const secondCmap = `1 beginbfchar
<0001> <5BF9>
endbfchar`;
  const textStream = "BT\n/F2 12 Tf\n<0001> Tj\nET";
  const compressedFirst = deflateSync(Buffer.from(firstCmap, "latin1"));
  const compressedSecond = deflateSync(Buffer.from(secondCmap, "latin1"));
  const compressedText = deflateSync(Buffer.from(textStream, "latin1"));
  const pdf = `%PDF-1.7
10 0 obj
<< /Length ${compressedFirst.length} /Filter /FlateDecode >>
stream
${compressedFirst.toString("latin1")}
endstream
endobj
11 0 obj
<< /Length ${compressedSecond.length} /Filter /FlateDecode >>
stream
${compressedSecond.toString("latin1")}
endstream
endobj
20 0 obj
<< /Type /Font /BaseFont /F1 /ToUnicode 10 0 R >>
endobj
21 0 obj
<< /Type /Font /BaseFont /F2 /ToUnicode 11 0 R >>
endobj
30 0 obj
<< /Length ${compressedText.length} /Filter /FlateDecode >>
stream
${compressedText.toString("latin1")}
endstream
endobj
%%EOF`;
  const expanded = await expandPdfContentForTextExtraction(pdf);
  const model = toDocumentModel(expanded, "pdf", "font-scoped-cmap.pdf");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks[0].text, "对");
});

test("P4 DOCX output generates a local OOXML package from DocumentModel", () => {
  const output = convertContent({ content: "# Export Title\n\nHello **DOCX**.\n\n| Name | Value |\n| --- | --- |\n| A | 1 |", from: "md", to: "docx", title: "export.docx" });
  assertValidOutput(output, "docx", "markdown to docx");
  assert.equal(output.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const zip = readZipEntries(output.data);
  assert.equal(zip.has("word/document.xml"), true);
  assert.equal(zip.getText("word/document.xml").includes("Export Title"), true);
  assert.equal(zip.getText("word/document.xml").includes("<w:tbl>"), true);
});

test("P4 programmatic PDF output returns a real PDF data URL instead of print HTML", () => {
  const output = convertContent({ content: "# PDF Export\n\nHello PDF binary.", from: "md", to: "pdf", title: "export.pdf" });
  assertValidOutput(output, "pdf", "markdown to pdf");
  assert.equal(output.mime, "application/pdf");
  const bytes = dataUrlToBytes(output.data);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.equal(output.data.includes("@media print"), false);
});

test("P8-M4 high-fidelity PDF output preserves FixedLayoutModel coordinates", () => {
  // 构造一个包含 FixedLayoutModel 的模型
  const layoutPayload = {
    engine: "pdfjs-layout",
    pages: [
      {
        pageNumber: 1,
        blocks: [
          { type: "heading", level: 1, text: "高保真 PDF 标题" },
          { type: "paragraph", text: "这是一段测试文本。" },
        ],
        layout: {
          pageNumber: 1,
          size: { width: 595, height: 842, unit: "pt" },
          textRuns: [
            { text: "高保真 PDF 标题", bbox: { x: 72, y: 760, w: 200, h: 24 }, fontName: "STSong", fontSize: 24, fontWeight: "bold" },
            { text: "这是一段测试文本。", bbox: { x: 72, y: 720, w: 180, h: 12 }, fontName: "STSong", fontSize: 12, fontWeight: "regular" },
          ],
          annotations: [
            { type: "link", bbox: { x: 72, y: 700, w: 100, h: 12 }, target: "https://example.com" },
          ],
        },
      },
    ],
  };
  const sentinelStart = "% Trans2Former PDFJS_TEXT_START";
  const sentinelEnd = "% Trans2Former PDFJS_TEXT_END";
  const encoded = `base64:${Buffer.from(JSON.stringify(layoutPayload), "utf8").toString("base64")}`;
  const fakePdfWithLayout = `%PDF-1.7\n%%EOF\n${sentinelStart}\n${encoded}\n${sentinelEnd}\n`;

  // 读取 PDF，应该产生 FixedLayoutModel
  const model = toDocumentModel(fakePdfWithLayout, "pdf", "high-fidelity.pdf");
  assert.equal(model.fixedLayout.pages.length, 1);
  assert.equal(model.fixedLayout.pages[0].textRuns.length, 2);
  assert.equal(model.fixedLayout.pages[0].textRuns[0].fontSize, 24);
  assert.equal(model.fixedLayout.pages[0].annotations.length, 1);

  // 转换为 PDF，应该使用高保真路径
  const output = convertContent({ content: fakePdfWithLayout, from: "pdf", to: "pdf", title: "high-fidelity.pdf" });
  assertValidOutput(output, "pdf", "pdf high-fidelity round-trip");
  const bytes = dataUrlToBytes(output.data);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");

  // 验证输出包含 "High-Fidelity" producer 标记
  const pdfText = new TextDecoder().decode(bytes);
  assert.match(pdfText, /Trans2Former High-Fidelity/);
  assert.match(pdfText, /72\.00 760\.00 Tm/, "first text run should use an absolute text matrix");
  assert.match(pdfText, /72\.00 720\.00 Tm/, "new lines should reset to their absolute page coordinates");
  assert.equal(pdfText.includes("72.00 760.00 Td"), false, "absolute coordinates must not be emitted through relative Td moves");
});

test("placeholder image rendering outputs are not advertised as supported conversions", () => {
  assert.equal(getAllowedOutputFormats("md").includes("png"), false);
  assert.equal(getAllowedOutputFormats("md").includes("jpeg"), false);
  assert.throws(
    () => convertContent({ content: "# Image Export\n\nHello image.", from: "md", to: "jpeg", title: "export.jpeg" }),
    /输出格式不支持|不支持此转换路径/
  );
});

test("PPTX input MVP extracts slide titles and body text", () => {
  const pptxBytes = createPptxFixture();
  const model = toDocumentModel(pptxBytes, "pptx", "fixture.pptx");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks.some((block) => block.type === "heading" && block.text === "Slide 1: Slide Title"), true);
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text === "Bullet one"), true);

  const markdown = convertContent({ content: pptxBytes, from: "pptx", to: "md", title: "fixture.pptx" });
  assertValidOutput(markdown, "md", "pptx to markdown");
  assert.equal(markdown.data.includes("Slide 1: Slide Title"), true);
});

test("PPTX input enhancement extracts images, tables, notes, and master references", () => {
  const model = toDocumentModel(createAdvancedPptxFixture(), "pptx", "advanced.pptx");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.blocks.some((block) => block.type === "asset" && block.alt === "Chart image alt"), true);
  assert.equal(model.blocks.some((block) => block.type === "table" && block.headers[0] === "Metric"), true);
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("Speaker notes text")), true);
  assert.equal(model.metadata.ooxml.notesSlideCount, 1);
  assert.equal(model.metadata.ooxml.masterReferenceCount, 1);
});

test("DocumentModel validation accepts generated models and rejects invalid models", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.\n\n- One\n- Two\n\n```js\nconsole.log('ok');\n```";
  const model = toDocumentModel(markdown, "md", "sample");
  assert.equal(model.schemaVersion, "trans2former.document.v1");
  assert.equal(model.blocks[0].type, "heading");
  assert.equal(model.blocks[0].text, "Title");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.doesNotThrow(() => assertValidDocumentModel(model));
  assert.throws(() => assertValidDocumentModel({ schemaVersion: "bad", blocks: [] }), /schema validation failed/);
});

test("DocumentModel audit layer adds stable ids, source spans, metadata, and quality report", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.\n\n- One\n- Two";
  const model = toDocumentModel(markdown, "md", "audit.md");

  assert.equal(model.blocks.every((block) => /^block-[0-9]+-[a-z0-9]{8}$/.test(block.id)), true);
  assert.equal(model.blocks.every((block) => block.sourceSpan && Number.isInteger(block.sourceSpan.startLine)), true);
  assert.equal(model.blocks.every((block) => Array.isArray(block.warnings)), true);
  assert.equal(model.metadata.conversion.reader, "md");
  assert.equal(model.metadata.conversion.schemaVersion, "trans2former.document.v1");
  assert.equal(model.metadata.qualityReport.warningCount, 0);
  assert.equal(model.metadata.qualityReport.structureFidelity, "high");
});

test("DocumentModel records block warnings, asset provenance, and conversion metadata", () => {
  const markdown = "Footnote reference[^safe].\n\n[^safe]: Footnote body";
  const model = toDocumentModel(markdown, "md", "warnings.md");

  assert.equal(model.metadata.warnings.some((warning) => warning.code === "MARKDOWN_FOOTNOTE"), true);
  assert.equal(model.blocks.some((block) => block.warnings.some((warning) => warning.code === "MARKDOWN_FOOTNOTE")), true);
  assert.equal(model.metadata.qualityReport.warningCount > 0, true);

  const pngData = "data:image/png;base64,iVBORw0KGgo=";
  const pngModel = toDocumentModel(pngData, "png", "tiny.png");
  assert.equal(pngModel.assets[0].provenance.sourceFormat, "png");
  assert.equal(pngModel.assets[0].provenance.fileName, "tiny.png");
});

test("chunked DocumentModel merge is equivalent to direct conversion for markdown", () => {
  const markdown = "# A\n\nFirst paragraph.\n\n## B\n\nSecond paragraph.";
  const direct = toDocumentModel(markdown, "md", "chunked.md");
  const chunks = chunkTextByLines(markdown, { maxLines: 3 });
  const partials = chunks.map((chunk, index) => toDocumentModel(chunk.content, "md", `chunk-${index + 1}.md`));
  const merged = mergePartialDocumentModels(partials, {
    title: "chunked.md",
    sourceFormat: "md",
    originalContent: markdown,
  });

  const comparison = compareDocumentModelsForEquivalence(direct, merged);
  assert.deepEqual(comparison, { ok: true, differences: [] });
});

test("chunked DocumentModel merge has baseline fixtures for CSV and XML", () => {
  for (const { content, format } of [
    { format: "csv", content: "Name,Value\nA,1\nB,2" },
    { format: "xml", content: "<root>\n  <item>A</item>\n  <item>B</item>\n</root>" },
  ]) {
    const direct = toDocumentModel(content, format, `chunked.${format}`);
    const chunks = chunkTextByLines(content, { maxLines: 100 });
    const partials = chunks.map((chunk, index) => toDocumentModel(chunk.content, format, `chunk-${index + 1}.${format}`));
    const merged = mergePartialDocumentModels(partials, {
      title: `chunked.${format}`,
      sourceFormat: format,
      originalContent: content,
    });
    assert.deepEqual(compareDocumentModelsForEquivalence(direct, merged), { ok: true, differences: [] });
  }
});

test("ConversionError normalizes parse, validate, and convert failures", () => {
  assert.throws(
    () => convertContent({ content: "{", from: "json", to: "md", title: "invalid" }),
    (error) => error instanceof ConversionError
      && error.category === "parse"
      && error.code === "JSON_PARSE_ERROR"
      && error.format === "json"
  );

  assert.throws(
    () => assertValidDocumentModel({ schemaVersion: "bad", blocks: [] }),
    (error) => error instanceof ConversionError
      && error.category === "validate"
      && error.code === "DOCUMENT_MODEL_SCHEMA_ERROR"
  );

  assert.throws(
    () => convertContent({ content: "# Title", from: "md", to: "webp", title: "unsupported" }),
    (error) => error instanceof ConversionError
      && error.category === "convert"
      && error.code === "UNSUPPORTED_OUTPUT_FORMAT"
      && error.format === "webp"
  );

  const normalized = normalizeConversionError(new Error("plain failure"), {
    category: "render",
    code: "PREVIEW_RENDER_ERROR",
  });
  assert.equal(normalized instanceof ConversionError, true);
  assert.equal(normalized.category, "render");
  assert.equal(normalized.code, "PREVIEW_RENDER_ERROR");
});

test("CSV reader attaches WorkbookModel (P8-M3)", () => {
  const csv = "name,score\n张三,90\n李四,85\n";
  const model = toDocumentModel(csv, "csv", "scores.csv");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.workbook.schemaVersion, "trans2former.workbook.v1");
  assert.equal(model.workbook.sheets.length, 1);
  assert.deepEqual(model.workbook.sheets[0].headers, ["name", "score"]);
  assert.deepEqual(model.workbook.sheets[0].rows, [["张三", "90"], ["李四", "85"]]);
});

test("Cross-model mappers preserve table / slide / fixed-layout content (P9-A)", async () => {
  const { workbookToSemantic, semanticToWorkbook, slideToSemantic, semanticToSlide, fixedLayoutToSemantic, semanticToFixedLayout } = await import("../public/core/models/mappers.js");
  const { createWorkbookModel } = await import("../public/core/models/workbook-model.js");
  const { createSlideModel } = await import("../public/core/models/slide-model.js");
  const { createFixedLayoutModel } = await import("../public/core/models/fixed-layout.js");

  // workbookToSemantic
  const workbook = createWorkbookModel({
    sheets: [{ name: "工资", headers: ["姓名", "金额"], rows: [["张三", "1000"], ["李四", "2000"]] }],
  });
  const semantic = workbookToSemantic(workbook, { title: "wb.xlsx" });
  assert.equal(semantic.blocks[0].type, "heading");
  assert.equal(semantic.blocks[0].text, "工资");
  assert.equal(semantic.blocks[1].type, "table");
  assert.deepEqual(semantic.blocks[1].headers, ["姓名", "金额"]);

  // semanticToWorkbook（反向）
  const back = semanticToWorkbook(semantic);
  assert.equal(back.sheets.length, 1);
  assert.deepEqual(back.sheets[0].headers, ["姓名", "金额"]);

  // slideToSemantic
  const slides = createSlideModel({
    slides: [
      { pageNumber: 1, title: "Cover", shapes: [{ type: "text", text: "Cover" }, { type: "text", text: "Subtitle" }], notes: "讲三分钟" },
      { pageNumber: 2, title: "Body", shapes: [{ type: "text", text: "Body" }], notes: "" },
    ],
  });
  const slideModel = slideToSemantic(slides);
  assert.equal(slideModel.blocks.find((block) => block.type === "heading" && block.text === "Slide 1: Cover") !== undefined, true);
  assert.equal(slideModel.blocks.find((block) => block.type === "paragraph" && block.text === "Subtitle") !== undefined, true);
  assert.equal(slideModel.blocks.find((block) => block.type === "quote" && block.text.includes("讲三分钟")) !== undefined, true);

  // semanticToSlide
  const semanticForSlide = {
    blocks: [
      { type: "heading", level: 1, text: "标题一" },
      { type: "paragraph", text: "段落 A" },
      { type: "heading", level: 2, text: "标题二" },
      { type: "paragraph", text: "段落 B" },
    ],
  };
  const slideOut = semanticToSlide(semanticForSlide);
  assert.equal(slideOut.slides.length, 2);
  assert.equal(slideOut.slides[0].title, "标题一");
  assert.equal(slideOut.slides[1].shapes.find((shape) => shape.text === "段落 B") !== undefined, true);

  // fixedLayoutToSemantic
  const layout = createFixedLayoutModel({
    pages: [{
      pageNumber: 1,
      size: { width: 595, height: 842, unit: "pt" },
      textRuns: [
        { text: "标题", bbox: { x: 80, y: 800, w: 200, h: 18 }, fontSize: 18, fontWeight: "bold" },
        { text: "正文段落。", bbox: { x: 80, y: 770, w: 200, h: 11 }, fontSize: 11, fontWeight: "regular" },
      ],
    }],
  });
  const layoutSemantic = fixedLayoutToSemantic(layout);
  assert.equal(layoutSemantic.blocks.length, 2);
  assert.equal(layoutSemantic.blocks[0].text, "标题");
  assert.equal(layoutSemantic.blocks[1].text, "正文段落。");

  // semanticToFixedLayout
  const layoutBack = semanticToFixedLayout({
    blocks: [
      { type: "heading", level: 1, text: "Heading" },
      { type: "paragraph", text: "Body content." },
    ],
  });
  assert.equal(layoutBack.pages.length, 1);
  assert.equal(layoutBack.pages[0].textRuns.length, 2);
  assert.equal(layoutBack.pages[0].textRuns[0].fontWeight, "bold");
});

test("HTML reader emits structured inline nodes (P8-M2)", () => {
  const html = `<!doctype html><html><body>
    <h1>Title with <em>emphasis</em></h1>
    <p>Hello <strong>bold</strong> and <a href="https://example.com">link</a> with <code>inlineCode</code>.</p>
    <ul><li>Item with <strong>bold</strong></li></ul>
  </body></html>`;
  const model = toDocumentModel(html, "html", "inline.html");
  assert.equal(validateDocumentModel(model).ok, true);

  const heading = model.blocks.find((block) => block.type === "heading");
  assert.equal(heading.text, "Title with emphasis");
  assert.equal(Array.isArray(heading.inlines), true);
  assert.equal(heading.inlines.some((node) => node.type === "em"), true);

  const paragraph = model.blocks.find((block) => block.type === "paragraph");
  assert.equal(paragraph.inlines.some((node) => node.type === "strong"), true);
  assert.equal(paragraph.inlines.some((node) => node.type === "link" && node.href === "https://example.com"), true);
  assert.equal(paragraph.inlines.some((node) => node.type === "code" && node.value === "inlineCode"), true);

  const list = model.blocks.find((block) => block.type === "list");
  assert.equal(Array.isArray(list.itemInlines), true);
  assert.equal(list.itemInlines[0].some((node) => node.type === "strong"), true);

  const md = convertContent({ content: html, from: "html", to: "md", title: "inline.html" }).data;
  assert.match(md, /# Title with \*emphasis\*/);
  assert.match(md, /\*\*bold\*\* and \[link\]\(https:\/\/example\.com\) with `inlineCode`/);
  assert.match(md, /- Item with \*\*bold\*\*/);

  const htmlOut = convertContent({ content: html, from: "html", to: "html", title: "inline.html" }).data;
  assert.match(htmlOut, /<h1><em>?[^<]*<\/em>[^<]*<\/h1>|<h1>Title with <em>emphasis<\/em><\/h1>/);
  assert.match(htmlOut, /<strong>bold<\/strong>/);
  assert.match(htmlOut, /<a href="https:\/\/example\.com"[^>]*>link<\/a>/);
  assert.match(htmlOut, /<code>inlineCode<\/code>/);
});

test("Markdown preview and core conversions preserve common document structure", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.\n\n- One\n- Two\n\n```js\nconsole.log('ok');\n```";
  const preview = renderPreviewHtml(markdown, "md", "sample");
  assert.equal(preview.includes("<h1>Title</h1>"), true);
  assert.equal(preview.includes("<strong>Trans2Former</strong>"), true);

  const html = convertContent({ content: markdown, from: "md", to: "html", title: "sample" });
  assertValidOutput(html, "html", "markdown to html");
  assert.equal(html.data.includes("<main>"), true);
  assert.equal(html.data.includes("\n    <main>\n      <h1>Title</h1>"), true);
  assert.equal(html.data.includes("<li data-depth=\"0\">"), false);
  assert.equal(html.data.includes("  <li>One</li>"), true);
  assert.equal(html.data.includes("<pre><code class=\"language-js\">console.log(&#39;ok&#39;);</code></pre>"), true);

  const text = convertContent({ content: "<h1>Hello</h1><p>World</p>", from: "html", to: "txt", title: "sample" });
  assertValidOutput(text, "txt", "html to txt");
  assert.equal(text.data.includes("Hello"), true);
  assert.equal(text.data.includes("World"), true);

  const json = convertContent({ content: "{\"hello\":\"world\"}", from: "json", to: "md", title: "sample" });
  assertValidOutput(json, "md", "json to markdown");
  assert.equal(json.data.includes("```json"), true);
});

test("format writers emit clean target-format output without leaked markdown/internal markers", () => {
  const markdown = [
    "# Title",
    "",
    "Hello **world** and `code`.",
    "",
    "- One",
    "  - Nested",
    "- Two",
    "",
    "| Name | Value |",
    "| --- | --- |",
    "| A | 1 |",
    "| B | 2 |",
    "",
    "```js",
    "console.log(\"ok\");",
    "```",
  ].join("\n");

  const text = convertContent({ content: markdown, from: "md", to: "txt", title: "sample" }).data;
  assert.equal(text.includes("Hello world and code."), true);
  assert.equal(text.includes("**world**"), false);
  assert.equal(text.includes("`code`"), false);

  const json = JSON.parse(convertContent({ content: markdown, from: "md", to: "json", title: "sample" }).data);
  assert.equal(json.plainText.includes("Hello world and code."), true);
  assert.equal(json.plainText.includes("**world**"), false);

  const xml = convertContent({ content: markdown, from: "md", to: "xml", title: "sample" }).data;
  // 新 XML writer 保留 inline 富文本：strong/em/code/link 等结构化标签，但不泄漏原始 markdown 标记
  assert.equal(xml.includes("<paragraph>Hello <strong>world</strong> and <code>code</code>.</paragraph>"), true);
  assert.equal(xml.includes("**world**"), false);
  assert.equal(xml.includes("      <headers>\n        <cell>Name</cell>\n        <cell>Value</cell>\n      </headers>"), true);
  assert.equal(xml.includes("<![CDATA[\nconsole.log(\"ok\");\n    ]]>"), true);

  const html = convertContent({ content: markdown, from: "md", to: "html", title: "sample" }).data;
  assert.equal(html.includes("data-depth"), false);
  assert.equal(html.includes("<li>One\n          <ul>\n            <li>Nested</li>\n          </ul>\n        </li>"), true);

  const docxZip = readZipEntries(convertContent({ content: markdown, from: "md", to: "docx", title: "sample" }).data);
  const wordXml = docxZip.getText("word/document.xml");
  assert.equal(wordXml.includes(">Hello<") || wordXml.includes(">Hello "), true);
  assert.equal(wordXml.includes(">world<"), true);
  assert.equal(wordXml.includes("<w:b/>"), true);
  assert.equal(wordXml.includes("**world**"), false);
  assert.equal(wordXml.includes("<w:tbl>\n"), true);

  const xlsxZip = readZipEntries(convertContent({ content: markdown, from: "md", to: "xlsx", title: "sample" }).data);
  assert.equal(xlsxZip.getText("xl/worksheets/sheet1.xml").includes("\n  <sheetData>\n      <row r=\"1\">"), true);

  const epubZip = readZipEntries(convertContent({ content: markdown, from: "md", to: "epub", title: "sample" }).data);
  const chapter = epubZip.getText("OEBPS/chapter.xhtml");
  assert.equal(chapter.includes("data-depth"), false);
  assert.equal(chapter.includes("<li>Nested</li>"), true);

  const pptxZip = readZipEntries(convertContent({ content: markdown, from: "md", to: "pptx", title: "sample" }).data);
  const slide = pptxZip.getText("ppt/slides/slide1.xml");
  assert.equal(slide.includes("Hello world and code."), true);
  assert.equal(slide.includes("**world**"), false);

  const pdfBytes = dataUrlToBytes(convertContent({ content: markdown, from: "md", to: "pdf", title: "sample" }).data);
  const pdfText = new TextDecoder().decode(pdfBytes);
  assert.equal(pdfText.includes("**world**"), false);
  assert.equal(pdfText.includes("`code`"), false);
});

test("Markdown advanced syntax keeps ordered lists, nesting hints, alignment, and footnotes", () => {
  const markdown = [
    "# Advanced",
    "",
    "1. First item",
    "   - Nested item",
    "2. Second item with `code` and [link](https://example.com)",
    "",
    "| Left | Center | Right |",
    "| :--- | :---: | ---: |",
    "| A | B | C |",
    "",
    "Footnote reference[^safe].",
    "",
    "[^safe]: Footnote body",
  ].join("\n");

  const model = toDocumentModel(markdown, "md", "advanced");
  const ordered = model.blocks.find((block) => block.type === "list" && block.ordered);
  const table = model.blocks.find((block) => block.type === "table");

  assert.deepEqual(ordered.items, ["First item", "Nested item", "Second item with `code` and [link](https://example.com)"]);
  assert.deepEqual(ordered.itemMeta.map((item) => item.depth), [0, 1, 0]);
  assert.deepEqual(table.alignments, ["left", "center", "right"]);
  assert.equal(model.metadata.warnings.some((warning) => warning.severity === "info" && warning.code === "MARKDOWN_FOOTNOTE"), true);

  const preview = renderPreviewHtml(markdown, "md", "advanced");
  assert.equal(preview.includes("<ol>"), true);
  assert.equal(preview.includes('data-depth="1"'), false);
  assert.equal(preview.includes("<li>Nested item</li>"), true);
  assert.equal(preview.includes('<sup id="fnref-safe">'), true);
});

test("JSON output wraps a DocumentModel with markdown and plain text projections", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.";
  const jsonDocument = convertContent({ content: markdown, from: "md", to: "json", title: "sample" });
  assertValidOutput(jsonDocument, "json", "markdown to json");
  const parsedDocumentJson = JSON.parse(jsonDocument.data);
  assert.equal(parsedDocumentJson.schemaVersion, "trans2former.document.v1");
  assert.equal(Array.isArray(parsedDocumentJson.blocks), true);
  assert.equal(parsedDocumentJson.blocks[0].type, "heading");
  assert.equal(parsedDocumentJson.blocks[0].text, "Title");
  assert.equal(parsedDocumentJson.markdown.includes("# Title"), true);
});

test("table conversions round-trip through Markdown, CSV, and HTML", () => {
  const tableMarkdown = "| Name | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |";
  const tableModel = toDocumentModel(tableMarkdown, "md", "table");
  assert.equal(tableModel.blocks[0].type, "table");
  assert.deepEqual(tableModel.blocks[0].headers, ["Name", "Value"]);
  assert.deepEqual(tableModel.blocks[0].rows[1], ["B", "2"]);

  const tableHtml = convertContent({ content: tableMarkdown, from: "md", to: "html", title: "table" });
  assertValidOutput(tableHtml, "html", "markdown table to html");
  assert.equal(tableHtml.data.includes("<table>"), true);
  assert.equal(tableHtml.data.includes("\n      <table>\n        <thead>"), true);

  const tableRoundTrip = convertContent({ content: tableMarkdown, from: "md", to: "md", title: "table" });
  assertValidOutput(tableRoundTrip, "md", "markdown table round-trip");
  assert.equal(tableRoundTrip.data.includes("| Name | Value |"), true);

  const csvContent = "Name,Value\nA,1\nB,2";
  const csvModel = toDocumentModel(csvContent, "csv", "csv");
  assert.equal(csvModel.blocks[0].type, "table");
  assert.deepEqual(csvModel.blocks[0].headers, ["Name", "Value"]);

  const csvToMarkdown = convertContent({ content: csvContent, from: "csv", to: "md", title: "csv" });
  assertValidOutput(csvToMarkdown, "md", "csv to markdown");
  assert.equal(csvToMarkdown.data.includes("| Name | Value |"), true);

  const markdownToCsv = convertContent({ content: tableMarkdown, from: "md", to: "csv", title: "table" });
  assertValidOutput(markdownToCsv, "csv", "markdown to csv");
  assert.equal(markdownToCsv.data.includes("Name,Value"), true);
});

test("CSV parser handles BOM, quoted commas, multiline cells, empty cells, and CRLF", () => {
  const csvContent = "\uFEFFName,Note,Empty\r\n\"A, one\",\"line 1\r\nline 2\",\r\nB,\"quoted \"\"value\"\"\",";
  const csvModel = toDocumentModel(csvContent, "csv", "csv-edge");
  const table = csvModel.blocks[0];

  assert.deepEqual(table.headers, ["Name", "Note", "Empty"]);
  assert.deepEqual(table.rows[0], ["A, one", "line 1\nline 2", ""]);
  assert.deepEqual(table.rows[1], ["B", "quoted \"value\"", ""]);
  assert.equal(csvModel.metadata.warnings.some((warning) => warning.severity === "info" && warning.code === "CSV_MULTILINE_FIELD"), true);
});

test("XML and PNG inputs convert through the DocumentModel pipeline", () => {
  const xmlContent = "<root><item>A</item><item>B</item></root>";
  const xmlModel = toDocumentModel(xmlContent, "xml", "xml");
  assert.equal(validateDocumentModel(xmlModel).ok, true);

  const markdown = "# Title\n\nHello **Trans2Former**.";
  const markdownToXml = convertContent({ content: markdown, from: "md", to: "xml", title: "sample" });
  assertValidOutput(markdownToXml, "xml", "markdown to xml");
  assert.equal(markdownToXml.data.includes("<document"), true);
  assert.equal(markdownToXml.data.includes("<heading level=\"1\">Title</heading>"), true);

  const pngData = "data:image/png;base64,iVBORw0KGgo=";
  const pngModel = toDocumentModel(pngData, "png", "tiny");
  assert.equal(pngModel.assets.length, 1);
  assert.equal(pngModel.blocks.some((block) => block.type === "asset"), true);
  assert.equal(validateDocumentModel(pngModel).ok, true);

  const pngHtml = convertContent({ content: pngData, from: "png", to: "html", title: "tiny", fileName: "tiny.png" });
  assertValidOutput(pngHtml, "html", "png to html");
  assert.equal(pngHtml.data.includes("data:image/png;base64"), true);

  const pdf = convertContent({ content: markdown, from: "md", to: "pdf", title: "sample" });
  assertValidOutput(pdf, "pdf", "markdown to pdf-print");
});

test("XML parser reports namespaces, attributes, and parser errors without DOMParser", () => {
  const xmlContent = '<doc xmlns:ofd="urn:ofd" id="root"><ofd:item type="a">A</ofd:item></doc>';
  const xmlModel = toDocumentModel(xmlContent, "xml", "xml-edge");
  const rawBlock = xmlModel.blocks.find((block) => block.type === "raw" && block.format === "xml");

  assert.equal(xmlModel.metadata.rootElement, "doc");
  assert.deepEqual(xmlModel.metadata.namespaces, [{ prefix: "ofd", uri: "urn:ofd" }]);
  assert.equal(xmlModel.metadata.attributes.doc.id, "root");
  assert.equal(rawBlock.content.includes('<ofd:item type="a">'), true);
  assert.equal(xmlModel.metadata.warnings.some((warning) => warning.severity === "info" && warning.code === "XML_ATTRIBUTES_EXTRACTED"), true);

  assert.throws(
    () => toDocumentModel("<root><item></root>", "xml", "broken"),
    (error) => error instanceof ConversionError
      && error.category === "parse"
      && error.code === "XML_PARSE_ERROR"
      && error.format === "xml"
  );

  assert.throws(
    () => convertContent({ content: "# Title", from: "docx", to: "pptx", title: "blocked" }),
    (error) => error instanceof ConversionError
      && error.category === "convert"
      && error.code === "UNSUPPORTED_CONVERSION_PATH"
      && error.format === "docx->pptx"
  );
});

test("sample fixtures exist and parse into valid DocumentModels", async () => {
  const samples = await readSamples();
  assert.equal(samples.length, Object.values(SAMPLE_MATRIX).reduce((sum, fileNames) => sum + fileNames.length, 0));

  for (const [format, fileNames] of Object.entries(SAMPLE_MATRIX)) {
    assert.equal(fileNames.length >= 3, true, `${format} should have at least three samples`);
  }

  for (const sample of samples) {
    const label = `${sample.format}/${sample.fileName}`;
    assert.equal(sample.content.trim().length > 0, true, `${label} should not be empty`);
    const model = toDocumentModel(sample.content.trimEnd(), sample.format, sample.fileName);
    assert.equal(validateDocumentModel(model).ok, true, `${label} should produce a valid DocumentModel`);
  }
});

test("sample fixtures convert to common text outputs with explicit degradation paths", async () => {
  const samples = await readSamples();
  for (const sample of samples) {
    for (const toFormat of TEXT_OUTPUT_FORMATS) {
      if (!getAllowedOutputFormats(sample.format).includes(toFormat)) {
        continue;
      }
      const label = `${sample.format}/${sample.fileName} -> ${toFormat}`;
      const result = convertContent({
        content: sample.content.trimEnd(),
        from: sample.format,
        to: toFormat,
        title: sample.fileName,
        fileName: sample.fileName,
      });
      assertValidOutput(result, toFormat, label);
    }
  }
});

test("Markdown output profiles preserve the requested profile hints", async () => {
  const sample = await readSample("md", "chinese.md");
  const archive = convertContent({
    content: sample.trimEnd(),
    from: "md",
    to: "md",
    title: "chinese.md",
    fileName: "chinese.md",
    options: { profile: "archive" },
  });
  assert(archive.data.includes("source-format:"), "archive profile emits archive metadata");

  const strictRoundTrip = convertContent({
    content: sample.trimEnd(),
    from: "md",
    to: "md",
    title: "chinese.md",
    fileName: "chinese.md",
    options: { profile: "strict-round-trip" },
  });
  assert(strictRoundTrip.data.includes("<!-- round-trip:"), "strict round-trip profile emits round-trip hints");
});

test("machine-readable DocumentModel schema mirrors the runtime block and asset shapes", async () => {
  const schemaPath = path.resolve("docs", "document-model.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.equal(schema.$id, "https://vantalens.github.io/trans2former/document-model.schema.json");
  assert.equal(schema.properties.schemaVersion.const, "trans2former.document.v1");
  assert.deepEqual(schema.properties.blocks.items.oneOf.map((entry) => entry.properties.type.const), EXPECTED_BLOCK_TYPES);
  assert.deepEqual(Object.keys(schema.properties.assets.items.properties), ["id", "name", "mime", "data", "size", "role", "provenance"]);
});

await runTests();
