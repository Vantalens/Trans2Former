import assert from "node:assert/strict";

import { analyzePageLayout } from "../public/formats/pdf.js";
import { readText, writeText } from "../public/formats/plain-text.js";
import { readDocx } from "../public/formats/docx.js";
import { writeDocx } from "../public/formats/docx-output.js";
import { writePdfBinary } from "../public/formats/pdf-output.js";
import { writeHtml } from "../public/formats/html.js";
import { createDocumentModel } from "../public/core/document-model.js";
import { ensureDocumentAudit } from "../public/core/document-audit.js";
import { readZipEntries } from "../public/core/zip-container.js";
import { writeStoredZip } from "../public/core/zip-writer.js";
import { textToBytes } from "../public/core/binary-utils.js";

// TXT round-trip preserves ordinary underscores, indentation, and single line breaks.
const sourceText = "  field__id__legacy: A-102\r\nnext line\r\n\r\n  second_field: ready\r";
const textModel = readText({ content: sourceText, title: "english-form", format: "txt" });
const textOutput = writeText({ model: textModel }).data;
assert.equal(textOutput, "  field__id__legacy: A-102\nnext line\n\n  second_field: ready\n");

// Without horizontal measurements, letter adjacency must not invent a word space.
const unmeasuredEnglish = analyzePageLayout([
  { str: "Inter", x: 0, y: 500, width: 0, height: 12 },
  { str: "national", x: 0, y: 500, width: 0, height: 12 },
]);
assert.equal(unmeasuredEnglish.map((block) => block.text).join(" "), "International");

// Real geometry inserts a space only when the measured gap is large enough.
const measuredEnglish = analyzePageLayout([
  { str: "North", x: 0, y: 500, width: 34, height: 12, hasPosition: true, hasHorizontalGeometry: true },
  { str: "Star", x: 39, y: 500, width: 24, height: 12, hasPosition: true, hasHorizontalGeometry: true },
]);
assert.equal(measuredEnglish.map((block) => block.text).join(" "), "North Star");

// A repeated two-column page is read down the left column, then down the right.
const columnItems = [
  ["Account ID", "ACCT-102"],
  ["Customer name", "Jane Doe"],
  ["Billing address", "42 Cedar Road"],
].flatMap(([leftText, rightText], index) => {
  const y = 720 - index * 22;
  return [
    { str: leftText, x: 54, y, width: 112, height: 12 },
    { str: rightText, x: 330, y, width: 128, height: 12 },
  ];
});
const columnBlocks = analyzePageLayout(columnItems);
assert.deepEqual(columnBlocks.map((block) => block.text), [
  "Account ID", "Customer name", "Billing address",
  "ACCT-102", "Jane Doe", "42 Cedar Road",
]);

// DOCX round-trip retains page geometry, paragraph tabs/indents, and table merges.
const docxModel = createDocumentModel({
  title: "English form",
  sourceFormat: "docx",
  blocks: [
    {
      type: "paragraph",
      text: "Reference:\tREF-204",
      paragraphFormat: {
        alignment: "left",
        indentLeft: 360,
        spacingBefore: 120,
        spacingAfter: 80,
        tabStops: [{ position: 2880, alignment: "left", leader: "dot" }],
      },
    },
    {
      type: "table",
      headers: ["Applicant"],
      rows: [["Name", "Jane Doe"], ["", "ACCT-102"]],
      columnWidths: [2400, 6960],
      cellSpans: [
        [{ columnSpan: 2 }],
        [{ columnSpan: 1, verticalMerge: "restart" }, { columnSpan: 1 }],
        [{ columnSpan: 1, verticalMerge: "continue" }, { columnSpan: 1 }],
      ],
    },
  ],
  metadata: {
    ooxml: {
      pageLayout: {
        width: 16838,
        height: 11906,
        orientation: "landscape",
        marginLeft: 900,
        marginRight: 900,
        marginTop: 720,
        marginBottom: 720,
        headerDistance: 720,
        footerDistance: 720,
        gutter: 0,
      },
    },
  },
});
const generatedDocx = writeDocx({ model: docxModel });
const docxBytes = new Uint8Array(Buffer.from(generatedDocx.data.split(",")[1], "base64"));
const roundTrippedDocx = readDocx({ content: docxBytes, title: "English form" });
const paragraph = roundTrippedDocx.blocks.find((block) => block.type === "paragraph");
const table = roundTrippedDocx.blocks.find((block) => block.type === "table");
assert.deepEqual(roundTrippedDocx.metadata.ooxml.pageLayout, docxModel.metadata.ooxml.pageLayout);
assert.deepEqual(paragraph.paragraphFormat, docxModel.blocks[0].paragraphFormat);
assert.deepEqual(table.columnWidths, [2400, 6960]);
assert.deepEqual(table.cellSpans, docxModel.blocks[1].cellSpans);
const generatedPdf = writePdfBinary({ model: docxModel });
const generatedPdfText = Buffer.from(generatedPdf.data.split(",")[1], "base64").toString("latin1");
assert.match(generatedPdfText, /\/MediaBox \[0 0 841\.9 595\.3\]/);
assert.equal(generatedPdf.warnings.some((warning) => warning.code === "PDF_DOCX_LAYOUT_APPROXIMATED"), true);
const generatedHtml = writeHtml({ model: docxModel });
assert.match(generatedHtml.data, /<p style="text-align:left;margin-left:18pt;margin-top:6pt;margin-bottom:4pt;white-space:pre-wrap;tab-size:8">/);
assert.match(generatedHtml.data, /<colgroup><col style="width:25\.64[0-9]*%" \/><col style="width:74\.35[0-9]*%" \/><\/colgroup>/);
assert.equal(generatedHtml.warnings.some((warning) => warning.code === "HTML_LAYOUT_APPROXIMATED"), true);

const docxQuality = ensureDocumentAudit(docxModel, { reader: "docx", writer: "docx", targetFormat: "docx" });
const textQuality = ensureDocumentAudit(textModel, { reader: "txt", writer: "txt", targetFormat: "txt" });
assert.equal(docxQuality.metadata.qualityReport.layoutFidelity, "medium");
assert.equal(textQuality.metadata.qualityReport.layoutFidelity, "not-applicable");
const reflowedDocxQuality = ensureDocumentAudit({
  ...docxModel,
  metadata: { ...docxModel.metadata, warnings: generatedPdf.warnings },
}, { reader: "docx", writer: "pdf", targetFormat: "pdf" });
assert.equal(reflowedDocxQuality.metadata.qualityReport.layoutFidelity, "low");

// Multi-section DOCX round-trip: a paragraph-level sectionBreak (portrait A4) and the
// trailing body sectPr (landscape) are both preserved, in document order.
const twoSectionModel = createDocumentModel({
  title: "Two sections",
  sourceFormat: "docx",
  blocks: [
    {
      type: "paragraph",
      text: "Portrait section",
      sectionBreak: {
        pageLayout: {
          width: 11906,
          height: 16838,
          orientation: "portrait",
          marginLeft: 1440,
          marginRight: 1440,
          marginTop: 1440,
          marginBottom: 1440,
          headerDistance: 720,
          footerDistance: 720,
          gutter: 0,
        },
      },
    },
    { type: "paragraph", text: "Landscape section" },
  ],
  metadata: {
    ooxml: {
      pageLayout: {
        width: 16838,
        height: 11906,
        orientation: "landscape",
        marginLeft: 900,
        marginRight: 900,
        marginTop: 720,
        marginBottom: 720,
        headerDistance: 720,
        footerDistance: 720,
        gutter: 0,
      },
    },
  },
});
const twoSectionDocx = writeDocx({ model: twoSectionModel });
const twoSectionBytes = new Uint8Array(Buffer.from(twoSectionDocx.data.split(",")[1], "base64"));
const twoSectionXml = readZipEntries(twoSectionBytes).getText("word/document.xml");
assert.equal((twoSectionXml.match(/<w:sectPr\b/g) || []).length, 2);
assert.ok(twoSectionXml.indexOf("<w:sectPr") < twoSectionXml.lastIndexOf("<w:sectPr"));
const twoSectionRoundTrip = readDocx({ content: twoSectionBytes, title: "Two sections" });
const sectionBreakBlock = twoSectionRoundTrip.blocks.find((block) => block.sectionBreak);
assert.deepEqual(sectionBreakBlock.sectionBreak, twoSectionModel.blocks[0].sectionBreak);
assert.deepEqual(twoSectionRoundTrip.metadata.ooxml.pageLayout, twoSectionModel.metadata.ooxml.pageLayout);

// Backward compatibility: a model without sectionBreak still emits exactly one trailing sectPr.
const singleSectionXml = readZipEntries(docxBytes).getText("word/document.xml");
assert.equal((singleSectionXml.match(/<w:sectPr\b/g) || []).length, 1);

// Legacy hMerge maps to columnSpan: restart + following continue cells fold into one
// logical cell; a clean mapping no longer raises DOCX_TABLE_MERGE_APPROXIMATED.
const docxWithBody = (bodyXml) => writeStoredZip([
  {
    name: "word/document.xml",
    data: textToBytes(`<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`),
  },
]);
const cleanHMerge = readDocx({
  content: docxWithBody(`<w:tbl><w:tr><w:tc><w:tcPr><w:hMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Merged</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:hMerge/></w:tcPr><w:p/></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`),
  title: "hmerge",
});
const cleanHMergeTable = cleanHMerge.blocks.find((block) => block.type === "table");
assert.deepEqual(cleanHMergeTable.headers, ["Merged"]);
assert.deepEqual(cleanHMergeTable.cellSpans, [[{ columnSpan: 2 }], [{ columnSpan: 1 }, { columnSpan: 1 }]]);
assert.equal((cleanHMerge.metadata.warnings || []).some((warning) => warning.code === "DOCX_TABLE_MERGE_APPROXIMATED"), false);

// Mixing gridSpan and hMerge in one table cannot be mapped cleanly and still warns.
const mixedMerge = readDocx({
  content: docxWithBody(`<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Grid</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:hMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Legacy</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:hMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>`),
  title: "mixed",
});
assert.equal(mixedMerge.metadata.warnings.some((warning) => warning.code === "DOCX_TABLE_MERGE_APPROXIMATED"), true);

// Ordered PDF list items at 2x line spacing (common in real documents) must stay a
// single list; split single-item lists would make the writer renumber every item from 1.
const spacedListItems = [
  "1. Delivery 交付: within 15 business days.",
  "2. Warranty 保修: Twelve (12) months.",
  "3. Liability 责任: capped at 100% of the Contract Price.",
  "4. Governing Law 适用法律: 本合同受中华人民共和国法律管辖。",
].map((text, index) => ({ str: text, x: 60, y: 700 - index * 20, width: 300, height: 10 }));
const spacedListBlocks = analyzePageLayout(spacedListItems);
assert.equal(spacedListBlocks.length, 1);
assert.equal(spacedListBlocks[0].type, "list");
assert.equal(spacedListBlocks[0].ordered, true);
assert.equal(spacedListBlocks[0].items.length, 4);

// A gap beyond 3x line height still starts a new list instead of over-merging.
const distantListBlocks = analyzePageLayout([
  { str: "1. First", x: 60, y: 700, width: 60, height: 10 },
  { str: "2. Second", x: 60, y: 660, width: 60, height: 10 },
]);
assert.equal(distantListBlocks.length, 2);

// A paragraph line between list items breaks the list instead of being swallowed.
const interruptedListBlocks = analyzePageLayout([
  { str: "1. First", x: 60, y: 700, width: 60, height: 10 },
  { str: "note in between", x: 60, y: 686, width: 90, height: 10 },
  { str: "2. Second", x: 60, y: 672, width: 60, height: 10 },
]);
assert.deepEqual(interruptedListBlocks.map((block) => block.type), ["list", "paragraph", "list"]);

// Underscore runs (PDF signature lines) are literal text, not markdown emphasis,
// while genuine emphasis markers are still stripped for txt output.
const underscoreModel = readText({ content: "Date 日期: ____________", title: "sig", format: "txt" });
assert.ok(writeText({ model: underscoreModel }).data.includes("Date 日期: ____________"));
const emphasisModel = readText({ content: "**bold** __em__ *it* _em2_ ~~gone~~", title: "em", format: "txt" });
assert.equal(writeText({ model: emphasisModel }).data, "bold em it em2 gone\n");

console.log("Layout offset regressions passed: TXT whitespace, PDF English spacing/columns, and DOCX form geometry.");
