import { createDocumentModel, createTable } from "../core/document-model.js";
import { getPlainText } from "../core/document-model.js";
import { createWorkbookModel } from "../core/models/workbook-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { stripMarkdownInlineSyntax } from "./text-utils.js";

function parseCsvRecords(content) {
  const source = String(content ?? "").replace(/^\uFEFF/, "");
  const records = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  let sawQuotedNewline = false;

  function pushCell() {
    row.push(current);
    current = "";
  }

  function pushRow() {
    records.push(row);
    row = [];
  }

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      pushCell();
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      pushCell();
      pushRow();
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      continue;
    }
    if ((char === "\n" || char === "\r") && inQuotes) {
      current += "\n";
      sawQuotedNewline = true;
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0 || row.length > 0 || source.endsWith(",")) {
    pushCell();
    pushRow();
  }

  return {
    rows: records.filter((record, index) => {
      const isFinalEmpty = index === records.length - 1 && record.length === 1 && record[0] === "" && /[\r\n]$/.test(source);
      return !isFinalEmpty;
    }),
    sawQuotedNewline,
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function readCsv({ content, title = "table", format = "csv" }) {
  const parsed = parseCsvRecords(content);
  const rows = parsed.rows;
  const headers = rows.shift() || [];
  const warnings = [];
  if (parsed.sawQuotedNewline) {
    warnings.push(createWarning("info", "CSV_MULTILINE_FIELD", "CSV quoted multiline fields were normalized to LF newlines."));
  }
  const model = createDocumentModel({
    title,
    sourceFormat: format,
    blocks: [createTable(headers, rows)],
    metadata: withWarnings({}, warnings),
  });
  // P8-M3：CSV 也产出 WorkbookModel，作为 mapper 链路的 reader 起点。
  model.workbook = createWorkbookModel({
    sheets: [{ name: title || "Sheet 1", headers, rows }],
  });
  return model;
}

export function writeCsv({ model }) {
  const table = model.blocks.find((block) => block.type === "table");
  let rows;
  if (table) {
    rows = [table.headers, ...table.rows];
  } else {
    rows = [["Text"], ...getPlainText(model).split(/\n{2,}/).filter(Boolean).map((text) => [text])];
  }

  return {
    type: "text",
    format: "csv",
    data: `${rows.map((row) => row.map((cell) => escapeCsvCell(stripMarkdownInlineSyntax(cell))).join(",")).join("\n")}\n`,
    mime: "text/csv;charset=utf-8",
  };
}
