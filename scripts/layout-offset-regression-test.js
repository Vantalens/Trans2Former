import assert from "node:assert/strict";

import { analyzePageLayout } from "../public/formats/pdf.js";
import { readText, writeText } from "../public/formats/plain-text.js";
import { readDocx } from "../public/formats/docx.js";
import { writeDocx } from "../public/formats/docx-output.js";
import { writePdfBinary } from "../public/formats/pdf-output.js";
import { writeHtml } from "../public/formats/html.js";
import { createDocumentModel } from "../public/core/document-model.js";
import { ensureDocumentAudit } from "../public/core/document-audit.js";

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

console.log("Layout offset regressions passed: TXT whitespace, PDF English spacing/columns, and DOCX form geometry.");
