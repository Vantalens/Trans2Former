import { createDocumentModel, createHeading, createTable } from "../core/document-model.js";
import { createWorkbookModel } from "../core/models/workbook-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { bytesToDataUrl } from "../core/binary-utils.js";
import { readZipEntries } from "../core/zip-container.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { getPlainText } from "../core/document-model.js";
import { getAttr, parseRelationships, resolvePartPath, stripTags } from "./ooxml-utils.js";
import { escapeHtml } from "./text-utils.js";

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
  const cells = [];
  const formulas = [];
  for (const rowMatch of String(xml || "").matchAll(/<row\b[\s\S]*?<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c\b[\s\S]*?<\/c>/g)) {
      const cellXml = cellMatch[0];
      const ref = getAttr(cellXml.match(/<c\b[^>]*>/)?.[0] || "", "r");
      const formula = stripTags(cellXml.match(/<f\b[\s\S]*?<\/f>/)?.[0] || "");
      const value = cellValue(cellXml, sharedStrings, styleFormats, counters);
      row[columnIndex(ref)] = value;
      cells.push({ ref, value, formula });
      if (formula) {
        formulas.push({ ref, expression: formula, cachedValue: value });
      }
    }
    rows.push(row.map((cell) => String(cell ?? "")));
  }
  const merges = [...String(xml || "").matchAll(/<mergeCell\b[^>]*ref="([^"]+)"[^>]*\/?>/g)]
    .map((match) => {
      const [from, to] = match[1].split(":");
      return { from: from || "", to: to || from || "" };
    });
  const headers = rows.shift() || [];
  const table = headers.length > 0 ? createTable(headers, rows) : null;
  return {
    table,
    sheetCells: cells,
    sheetFormulas: formulas,
    sheetMerges: merges,
    headers,
    rows,
  };
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
  const workbookSheets = [];
  let sheetCount = 0;

  for (const sheetMatch of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const sheetTag = sheetMatch[0];
    const name = getAttr(sheetTag, "name") || `Sheet ${sheetCount + 1}`;
    const relId = getAttr(sheetTag, "r:id");
    const target = relationships.get(relId)?.resolvedTarget || resolvePartPath("xl/workbook.xml", `worksheets/sheet${sheetCount + 1}.xml`);
    const sheetXml = zip.getText(target);
    if (!sheetXml) continue;
    blocks.push(createHeading(2, name));
    const parsed = parseSheet(sheetXml, sharedStrings, styleFormats, counters, warnings);
    if (parsed.table) blocks.push(parsed.table);
    workbookSheets.push({
      name,
      headers: parsed.headers,
      rows: parsed.rows,
      cells: parsed.sheetCells,
      formulas: parsed.sheetFormulas,
      merges: parsed.sheetMerges,
    });
    sheetCount += 1;
  }

  const model = createDocumentModel({
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
  // P8-M3：在顶层挂 WorkbookModel，让需要 cell-level 信息（公式 cache、merge）
  // 的 writer / mapper 不必从 SemanticDoc.table 反推。
  model.workbook = createWorkbookModel({
    sheets: workbookSheets,
  });
  return model;
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

function modelRows(model) {
  const table = model.blocks.find((block) => block.type === "table");
  if (table) return [table.headers, ...(table.rows || [])];
  return [["Text"], ...getPlainText(model).split(/\n{1,2}/).filter(Boolean).map((text) => [text])];
}

function generateStylesXml() {
  const NS = "http" + "://schemas.openxmlformats.org";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}/spreadsheetml/2006/main">
  <numFmts count="0"></numFmts>
  <fonts count="1">
    <font>
      <sz val="11"/>
      <color theme="1"/>
      <name val="Calibri"/>
      <family val="2"/>
      <scheme val="minor"/>
    </font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function sheetXml(rows, stringIndex) {
  const NS = "http" + "://schemas.openxmlformats.org";
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndexValue) => {
      const ref = `${columnName(columnIndexValue)}${rowIndex + 1}`;
      const strIdx = stringIndex.get(String(cell || ""));
      return `<c r="${ref}" t="s"><v>${strIdx}</v></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS}/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

export function writeXlsx({ model, title = model.title }) {
  const NS = "http" + "://schemas.openxmlformats.org";
  const DC_NS = "http" + "://purl.org/dc/elements/1.1/";
  const rows = modelRows(model);

  // 构建字符串表
  const stringIndex = new Map();
  const stringArray = [];
  function getStringIndex(str) {
    const strStr = String(str || "");
    if (!stringIndex.has(strStr)) {
      stringIndex.set(strStr, stringArray.length);
      stringArray.push(strStr);
    }
    return stringIndex.get(strStr);
  }

  rows.forEach(row => {
    row.forEach(cell => getStringIndex(cell));
  });

  // 生成 sharedStrings.xml
  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${NS}/spreadsheetml/2006/main" count="${rows.reduce((sum, r) => sum + r.length, 0)}" uniqueCount="${stringArray.length}">
${stringArray.map(str => `  <si><t>${escapeHtml(str)}</t></si>`).join('\n')}
</sst>`;

  const zipBytes = writeStoredZip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="${NS}/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">
  <Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="${NS}/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">
  <Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="${NS}/package/2006/metadata/core-properties" xmlns:dc="${DC_NS}"><dc:title>${escapeHtml(title)}</dc:title></cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets><sheet name="DocumentModel" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    { name: "xl/sharedStrings.xml", data: sharedStringsXml },
    { name: "xl/styles.xml", data: generateStylesXml() },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows, stringIndex) },
  ]);
  return {
    type: "binary",
    format: "xlsx",
    data: bytesToDataUrl(zipBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
