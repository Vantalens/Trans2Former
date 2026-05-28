import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getAllowedOutputFormats,
  getKnownInputFormats,
  normalizeFormat,
} from "../public/core/format-registry.js";

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

const knownInputFormats = new Set(getKnownInputFormats().map(normalizeFormat));
const inputNameFormats = new Set(
  [...inputNameToFormats.values()].flat().map(normalizeFormat),
);

for (const format of knownInputFormats) {
  assert.equal(
    inputNameFormats.has(format),
    true,
    `Registry exposes input format ${format} but product-matrix-docs-test has no row alias for it; add it to inputNameToFormats.`,
  );
}

for (const format of inputNameFormats) {
  assert.equal(
    knownInputFormats.has(format),
    true,
    `Test references input format ${format} that is no longer in the registry; remove the row alias.`,
  );
}

function parseMatrixRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue;
    if (line.includes("---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3 || cells[0] === "输入") continue;
    assert.equal(
      inputNameToFormats.has(cells[0]),
      true,
      `Unknown documented input name in CONVERSION_PATHS.md matrix row: "${cells[0]}". Update inputNameToFormats or fix the docs row.`,
    );
    const outputs = cells[1]
      .split("、")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        assert.equal(outputNameToFormat.has(name), true, `Unknown documented output name: ${name}`);
        return outputNameToFormat.get(name);
      });
    for (const format of inputNameToFormats.get(cells[0])) {
      assert.equal(
        rows.has(format),
        false,
        `Duplicate documented row for input ${format} in CONVERSION_PATHS.md; each input format must appear exactly once.`,
      );
      rows.set(format, outputs);
    }
  }
  return rows;
}

const documentedRows = parseMatrixRows(docs);

for (const format of knownInputFormats) {
  assert.equal(
    documentedRows.has(format),
    true,
    `docs/CONVERSION_PATHS.md must document ${format}`,
  );
}

for (const format of documentedRows.keys()) {
  assert.equal(
    knownInputFormats.has(format),
    true,
    `docs/CONVERSION_PATHS.md documents ${format} but it is missing from the registry product matrix.`,
  );
  assert.deepEqual(
    documentedRows.get(format),
    getAllowedOutputFormats(format),
    `docs/CONVERSION_PATHS.md output row for ${format} must match getAllowedOutputFormats(${format})`,
  );
}

console.log("Product matrix docs test passed: CONVERSION_PATHS matches the registry product matrix.");
