import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getAllowedOutputFormats } from "../public/browser-transformer.js";

const docs = await readFile("docs/CONVERSION_PATHS.md", "utf8");

const inputNameToFormats = new Map([
  ["Markdown", ["md"]],
  ["HTML", ["html"]],
  ["TXT", ["txt"]],
  ["JSON", ["json"]],
  ["XML", ["xml"]],
  ["CSV", ["csv"]],
  ["XLSX", ["xlsx"]],
  ["DOC / DOCX", ["doc", "docx"]],
  ["EPUB", ["epub"]],
  ["PDF", ["pdf"]],
  ["PPTX", ["pptx"]],
  ["PNG", ["png"]],
  ["OFD", ["ofd"]],
]);

const outputNameToFormat = new Map([
  ["Markdown", "md"],
  ["HTML", "html"],
  ["TXT", "txt"],
  ["JSON", "json"],
  ["CSV", "csv"],
  ["XML", "xml"],
  ["DOCX", "docx"],
  ["XLSX", "xlsx"],
  ["PDF", "pdf"],
  ["EPUB", "epub"],
  ["PPTX", "pptx"],
]);

function parseMatrixRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue;
    if (line.includes("---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3 || cells[0] === "输入") continue;
    if (!inputNameToFormats.has(cells[0])) continue;
    const outputs = cells[1]
      .split("、")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        assert.equal(outputNameToFormat.has(name), true, `Unknown documented output name: ${name}`);
        return outputNameToFormat.get(name);
      });
    for (const format of inputNameToFormats.get(cells[0])) {
      rows.set(format, outputs);
    }
  }
  return rows;
}

const documentedRows = parseMatrixRows(docs);
for (const formats of inputNameToFormats.values()) {
  for (const format of formats) {
    assert.equal(documentedRows.has(format), true, `docs/CONVERSION_PATHS.md must document ${format}`);
  }
}

for (const format of documentedRows.keys()) {
  assert.deepEqual(
    documentedRows.get(format),
    getAllowedOutputFormats(format),
    `docs/CONVERSION_PATHS.md output row for ${format} must match getAllowedOutputFormats(${format})`
  );
}

console.log("Product matrix docs test passed: CONVERSION_PATHS matches the registry product matrix.");
