import { createDocumentModel, createHeading, createTable } from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { readZipEntries } from "../core/zip-container.js";
import { getAttr, parseRelationships, resolvePartPath, stripTags } from "./ooxml-utils.js";

function readSharedStrings(zip) {
  const xml = zip.getText("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => stripTags(match[0]));
}

function columnIndex(cellRef) {
  const letters = String(cellRef || "").match(/[A-Z]+/)?.[0] || "A";
  return [...letters].reduce((value, char) => value * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

function readStyleFormats(zip) {
  const xml = zip.getText("xl/styles.xml");
  const formats = [];
  for (const xfMatch of String(xml || "").matchAll(/<xf\b[^>]*\/?>/g)) {
    formats.push(Number(getAttr(xfMatch[0], "numFmtId")) || 0);
  }
  return formats;
}

function excelSerialDateToIso(serial) {
  const days = Number(serial);
  if (!Number.isFinite(days)) return String(serial ?? "");
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + days * 86400000);
  return date.toISOString().slice(0, 10);
}

function isDateFormat(numFmtId) {
  return [14, 15, 16, 17, 22, 27, 30, 36, 50, 57].includes(numFmtId);
}

function cellValue(cellXml, sharedStrings, styleFormats, counters) {
  const type = getAttr(cellXml.match(/<c\b[^>]*>/)?.[0] || "", "t");
  const styleIndex = Number(getAttr(cellXml.match(/<c\b[^>]*>/)?.[0] || "", "s")) || 0;
  const raw = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "";
  const formula = stripTags(cellXml.match(/<f\b[\s\S]*?<\/f>/)?.[0] || "");
  if (formula) counters.formulaCellCount += 1;
  if (type === "s") return sharedStrings[Number(raw)] || "";
  const inline = cellXml.match(/<is\b[\s\S]*?<\/is>/)?.[0];
  if (inline) return stripTags(inline);
  const value = isDateFormat(styleFormats[styleIndex]) ? excelSerialDateToIso(raw) : raw;
  return formula ? `=${formula} => ${value}` : value;
}

function parseSheet(xml, sharedStrings, styleFormats, counters, warnings) {
  if (/<mergeCell\b/.test(String(xml || ""))) {
    warnings.push(createWarning("lossy", "XLSX_MERGED_CELLS_APPROXIMATED", "XLSX merged cells were flattened into the DocumentModel table shape."));
  }
  const rows = [];
  for (const rowMatch of String(xml || "").matchAll(/<row\b[\s\S]*?<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c\b[\s\S]*?<\/c>/g)) {
      const ref = getAttr(cellMatch[0].match(/<c\b[^>]*>/)?.[0] || "", "r");
      row[columnIndex(ref)] = cellValue(cellMatch[0], sharedStrings, styleFormats, counters);
    }
    rows.push(row.map((cell) => String(cell ?? "")));
  }
  const headers = rows.shift() || [];
  return headers.length > 0 ? createTable(headers, rows) : null;
}

export function readXlsx({ content, title = "workbook", fileName = "", format = "xlsx" }) {
  const zip = readZipEntries(content);
  const workbookXml = zip.getText("xl/workbook.xml");
  const relationships = parseRelationships(zip.getText("xl/_rels/workbook.xml.rels"), "xl/workbook.xml");
  const sharedStrings = readSharedStrings(zip);
  const styleFormats = readStyleFormats(zip);
  const warnings = [];
  const counters = { formulaCellCount: 0 };
  const blocks = [];
  let sheetCount = 0;

  for (const sheetMatch of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const sheetTag = sheetMatch[0];
    const name = getAttr(sheetTag, "name") || `Sheet ${sheetCount + 1}`;
    const relId = getAttr(sheetTag, "r:id");
    const target = relationships.get(relId)?.resolvedTarget || resolvePartPath("xl/workbook.xml", `worksheets/sheet${sheetCount + 1}.xml`);
    const sheetXml = zip.getText(target);
    if (!sheetXml) continue;
    blocks.push(createHeading(2, name));
    const table = parseSheet(sheetXml, sharedStrings, styleFormats, counters, warnings);
    if (table) blocks.push(table);
    sheetCount += 1;
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({
      ooxml: {
        container: "zip",
        workbookPart: "xl/workbook.xml",
        sheetCount,
        formulaCellCount: counters.formulaCellCount,
        compressionMethods: zip.methods(),
        entryCount: zip.list().length,
        fileName,
      },
    }, warnings),
  });
}
