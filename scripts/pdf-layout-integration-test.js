import assert from "node:assert/strict";

import { convertContentAsync } from "../public/browser-transformer.js";
import { ConverterRegistry } from "../public/core/format-registry.js";
import { expandPdfContentForTextExtraction, readPdf } from "../public/formats/pdf.js";

// This path is release-critical: a missing optional PDF.js install must fail.
await import("pdfjs-dist/legacy/build/pdf.mjs");

function makePdf(runs = []) {
  const escaped = (value) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const content = runs.map(({ text, x, y }) =>
    `BT /F1 12 Tf 1 0 0 1 ${x} ${y} Tm (${escaped(text)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

const formRuns = [
  ["Account ID", "ACCT-102"],
  ["Customer name", "Jane Doe"],
  ["Billing address", "42 Cedar Road"],
].flatMap(([label, value], index) => [
  { text: label, x: 54, y: 720 - index * 24 },
  { text: value, x: 330, y: 720 - index * 24 },
]);
const formPdf = makePdf(formRuns);
const formModel = readPdf({ content: await expandPdfContentForTextExtraction(formPdf), title: "form" });
assert.equal(formModel.metadata.pdf.pageCount, 1);
assert.deepEqual(formModel.blocks.map((block) => block.text), [
  "Account ID ACCT-102", "Customer name Jane Doe", "Billing address 42 Cedar Road",
]);
const firstRun = formModel.fixedLayout.pages[0].textRuns.find((run) => run.text === "Account ID");
const firstValue = formModel.fixedLayout.pages[0].textRuns.find((run) => run.text === "ACCT-102");
assert.ok(firstRun && firstValue);
assert.ok(Math.abs(firstRun.bbox.x - 54) <= 1 && Math.abs(firstRun.bbox.y - 720) <= 1);
assert.ok(Math.abs(firstValue.bbox.x - 330) <= 1 && Math.abs(firstValue.bbox.y - 720) <= 1);

const fourColumnRuns = [0, 1, 2].flatMap((index) => [
  { text: `Name${index}:`, x: 50, y: 700 - index * 24 },
  { text: `Value${index}`, x: 150, y: 700 - index * 24 },
  { text: `Code${index}:`, x: 310, y: 700 - index * 24 },
  { text: `ID-${index}`, x: 450, y: 700 - index * 24 },
]);
const fourModel = readPdf({ content: await expandPdfContentForTextExtraction(makePdf(fourColumnRuns)), title: "four-fields" });
assert.deepEqual(fourModel.blocks.map((block) => block.text), [
  "Name0: Value0 Code0: ID-0",
  "Name1: Value1 Code1: ID-1",
  "Name2: Value2 Code2: ID-2",
]);

const proseRuns = [0, 1, 2].flatMap((index) => [
  { text: `Left column long paragraph sentence number ${index}`, x: 45, y: 700 - index * 18 },
  { text: `Right column long paragraph sentence number ${index}`, x: 350, y: 700 - index * 18 },
]);
const proseModel = readPdf({ content: await expandPdfContentForTextExtraction(makePdf(proseRuns)), title: "prose-columns" });
const proseText = proseModel.blocks.map((block) => block.text).join(" ");
assert.ok(proseText.indexOf("Left column long paragraph sentence number 2")
  < proseText.indexOf("Right column long paragraph sentence number 0"), "prose columns must be read left to right by column");

const spacedPdf = makePdf([{ text: "E x p a n d e d", x: 54, y: 700 }]);
const spacedModel = readPdf({ content: await expandPdfContentForTextExtraction(spacedPdf.slice()), title: "spacing" });
assert.match(spacedModel.blocks.map((block) => block.text).join(" "), /E x p a n d e d/);
assert.ok(spacedModel.metadata.warnings.some((warning) =>
  warning.code === "PDF_TEXT_SPACING_AMBIGUOUS" && warning.details?.pages?.[0] === 1));
const spacedOutput = await convertContentAsync({ content: spacedPdf, from: "pdf", to: "txt", options: { ocr: { enabled: false } } });
assert.equal(spacedOutput.quality.qualityReport.textFidelity, "unverified");
assert.ok(spacedOutput.quality.warnings.some((warning) => warning.code === "PDF_TEXT_SPACING_AMBIGUOUS"));

const blankPdf = makePdf();
const blankSnapshot = Buffer.from(blankPdf);
const blankModel = readPdf({ content: await expandPdfContentForTextExtraction(blankPdf.slice()), title: "blank" });
assert.equal(blankModel.blocks.length, 0);
assert.ok(blankModel.metadata.warnings.some((warning) => warning.code === "PDF_NO_TEXT_RUNS"));
assert.throws(() => new ConverterRegistry()._requirePdfText({
  blocks: [],
  metadata: { pdf: { extraction: "pdfjs-no-text" }, warnings: [{ code: "OCR_UNAVAILABLE" }] },
}, "pdf"), (error) => error.code === "PDF_OCR_UNAVAILABLE");
const copied = await convertContentAsync({ content: blankPdf, from: "pdf", to: "pdf" });
assert.deepEqual(Buffer.from(copied.data.split(",")[1], "base64"), blankSnapshot);

console.log("PDF layout integration passed: PDF.js form positions, ambiguous spacing, blank pages, and identity copy.");
