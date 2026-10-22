import { createDocumentModel, createHeading, createTable } from "../core/document-model.js";
import { createWorkbookModel } from "../core/models/workbook-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { bytesToDataUrl } from "../core/binary-utils.js";
import { readZipEntries } from "../core/zip-container.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { getPlainText } from "../core/document-model.js";
import { getAttr, parseRelationships, resolvePartPath, stripTags, extractTextTags, decodeXml } from "./ooxml-utils.js";
import { escapeXmlText, stripMarkdownInlineSyntax } from "./text-utils.js";

// 富文本 si/is 单元格：直接拼接 <t>，不插分隔符、不 trim（尊重 xml:space="preserve"）；
// <rPh>（注音）段内也有 <t>，先整段剔除再抽取（issue #91）。
function extractCellText(xml) {
  const withoutPhonetic = String(xml ?? "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  return extractTextTags(withoutPhonetic, "t");
}

function readSharedStrings(zip) {
  const xml = zip.getText("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => extractCellText(match[0]));
}

function columnIndex(cellRef) {
  const letters = String(cellRef || "").match(/[A-Z]+/)?.[0] || "A";
  return [...letters].reduce((value, char) => value * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

const BUILTIN_DATE_NUMFMT_IDS = [14, 15, 16, 17, 22, 27, 30, 36, 50, 57];

// 去掉引号文本、[…] 颜色/条件段、反斜杠转义后，含 y 或 d 才判日期；
// 纯时间格式（hh:mm:ss 只含 h/m/s）不转，避免把时间值误转成日期。
function isDateFormatCode(formatCode) {
  const cleaned = String(formatCode || "")
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "");
  return /[yd]/i.test(cleaned);
}

function readStyleFormats(zip) {
  const xml = String(zip.getText("xl/styles.xml") || "");
  const dateNumFmtIds = new Set(BUILTIN_DATE_NUMFMT_IDS);
  const numFmtsSection = xml.match(/<numFmts\b[\s\S]*?<\/numFmts>/)?.[0] || "";
  for (const fmtMatch of numFmtsSection.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const id = Number(getAttr(fmtMatch[0], "numFmtId"));
    if (id >= 164 && isDateFormatCode(getAttr(fmtMatch[0], "formatCode"))) dateNumFmtIds.add(id);
  }
  // ECMA-376：c@s 仅索引 <cellXfs> 集合——整文件匹配 <xf> 会把 <cellStyleXfs>
  // 的条目混进来造成索引错位，日期检测随之失效（issue #90）。
  const cellXfsSection = xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] || "";
  const numFmtIds = [];
  for (const xfMatch of cellXfsSection.matchAll(/<xf\b[^>]*\/?>/g)) {
    numFmtIds.push(Number(getAttr(xfMatch[0], "numFmtId")) || 0);
  }
  return { numFmtIds, dateNumFmtIds };
}

function excelSerialDateToIso(serial) {
  const days = Number(serial);
  if (!Number.isFinite(days)) return String(serial ?? "");

  // 修正 Excel 1900 闰年 bug (issue #182)
  // Excel 错误地将 1900 年视为闰年，序列号 60 代表不存在的 1900-02-29
  // 对于序列号 > 60 的日期，需要减去 1 天以补偿
  let adjustedDays = days;
  if (days > 60) adjustedDays -= 1;

  // 使用正确的 epoch：1899-12-31（Excel 序列号 1 = 1900-01-01）
  const epoch = Date.UTC(1899, 11, 31);
  const date = new Date(epoch + adjustedDays * 86400000);
  return date.toISOString().slice(0, 10);
}

function isDateStyle(styleFormats, styleIndex) {
  return styleFormats.dateNumFmtIds.has(styleFormats.numFmtIds[styleIndex] ?? 0);
}

// 单元格取值：按 ECMA-376 的 c@t 类型分发。
// - t="inlineStr"：<is><t>…</t></is> 内联字符串（openpyxl 默认写法，常无 sharedStrings.xml）
// - t="s"：共享字符串索引；无缓存 <v> 时 raw 为 ""，Number("")===0 会错取
//   sharedStrings[0]，必须显式挡掉
// - t="str"：公式字符串缓存，原文返回（含 XML 实体解码），不做日期转换
// - t="b"：布尔 0/1 → FALSE/TRUE（Excel 显示语义）
// - t="e"：错误值（#DIV/0! 等），原文返回，不做日期转换
// - 默认（无 t 或 t="n"）：数字/日期，保持原有行为
// 公式单元格有缓存值时给 "=expr => cached" 可读显示；无缓存值至少保留公式文本。
function cellValue(cellXml, sharedStrings, styleFormats, counters) {
  const headTag = cellXml.match(/<c\b[^>]*>/)?.[0] || "";
  const type = getAttr(headTag, "t");
  const styleIndex = Number(getAttr(headTag, "s")) || 0;
  const raw = decodeXml(cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "");
  const formula = stripTags(cellXml.match(/<f\b[\s\S]*?<\/f>/)?.[0] || "");
  if (formula) counters.formulaCellCount += 1;
  let value;
  const inline = cellXml.match(/<is\b[\s\S]*?<\/is>/)?.[0];
  if (inline) {
    value = extractCellText(inline);
  } else if (type === "s") {
    value = raw !== "" ? sharedStrings[Number(raw)] || "" : "";
  } else if (type === "b") {
    value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : raw;
  } else if (type === "e" || type === "str") {
    value = raw;
  } else {
    value = isDateStyle(styleFormats, styleIndex) && raw !== "" ? excelSerialDateToIso(raw) : raw;
  }
  if (!formula) return value;
  return value !== "" ? `=${formula} => ${value}` : `=${formula}`;
}

function parseSheet(xml, sharedStrings, styleFormats, counters, warnings) {
  if (/<mergeCell\b/.test(String(xml || ""))) {
    warnings.push(createWarning("lossy", "XLSX_MERGED_CELLS_APPROXIMATED", "XLSX merged cells were flattened into the DocumentModel table shape."));
  }
  const rows = [];
  const cells = [];
  const formulas = [];
  // 性能优化：缓存 matchAll 结果，避免迭代器重复创建（issue #196, code review P2 #3）。
  // 正则同时覆盖自闭合标签（<row r="5"/> / <c r="B1"/>）：旧模式 [\s\S]*?</row>
  // 会把自闭合标签之后的内容吞进上一个匹配，导致单元格列错位。
  const rowMatches = [...String(xml || "").matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)];
  for (const rowMatch of rowMatches) {
    const row = [];
    const cellMatches = [...rowMatch[0].matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
    for (const cellMatch of cellMatches) {
      const cellXml = cellMatch[0];
      const ref = getAttr(cellXml.match(/<c\b[^>]*>/)?.[0] || "", "r");
      const formula = stripTags(cellXml.match(/<f\b[\s\S]*?<\/f>/)?.[0] || "");
      // cellValue 仍按"=expr => cached"形式给 SemanticDoc.table 用作可读显示；
      // WorkbookModel.formulas 单独保存干净的 expression 和 cachedValue。
      const displayValue = cellValue(cellXml, sharedStrings, styleFormats, counters);
      row[columnIndex(ref)] = displayValue;
      const cachedValue = extractCachedValue(cellXml, sharedStrings, styleFormats);
      cells.push({ ref, value: formula ? cachedValue : displayValue, formula });
      if (formula) {
        formulas.push({ ref, expression: formula, cachedValue });
      }
    }
    // Array.from 会把稀疏槽位（缺失引用的列）规范化为 ""，避免 undefined 泄漏到下游。
    rows.push(Array.from(row, (cell) => String(cell ?? "")));
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

// 与 cellValue 相同的类型分发，但只取"缓存值"（不拼公式显示文本），
// 供 WorkbookModel 的 cells/formulas 使用。
function extractCachedValue(cellXml, sharedStrings, styleFormats) {
  const headTag = cellXml.match(/<c\b[^>]*>/)?.[0] || "";
  const type = getAttr(headTag, "t");
  const styleIndex = Number(getAttr(headTag, "s")) || 0;
  const raw = decodeXml(cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "");
  const inline = cellXml.match(/<is\b[\s\S]*?<\/is>/)?.[0];
  if (inline) return extractCellText(inline);
  if (type === "s") return raw !== "" ? sharedStrings[Number(raw)] || "" : "";
  if (type === "b") return raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : raw;
  if (type === "e" || type === "str") return raw;
  return isDateStyle(styleFormats, styleIndex) && raw !== "" ? excelSerialDateToIso(raw) : raw;
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

const INVALID_SHEET_NAME_CHARS = /[\\\/\?\*\[\]\:]/g;

function sanitizeSheetName(name, fallback = "Sheet") {
  const cleaned = String(name ?? "").replace(INVALID_SHEET_NAME_CHARS, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}

function modelRows(model) {
  const table = model.blocks.find((block) => block.type === "table");
  if (table) return [table.headers, ...(table.rows || [])];
  return [["Text"], ...getPlainText(model).split(/\n{2,}/).filter(Boolean).map((text) => [text])];
}

function collectSheetsFromModel(model) {
  if (model.workbook?.sheets?.length) {
    return model.workbook.sheets.map((sheet, index) => ({
      name: sanitizeSheetName(sheet.name, `Sheet ${index + 1}`),
      headers: sheet.headers || [],
      rows: sheet.rows || [],
      formulas: sheet.formulas || [],
      merges: sheet.merges || [],
    }));
  }
  const rows = modelRows(model);
  const headers = rows[0] || [];
  return [{
    name: sanitizeSheetName(model.title, "Sheet 1"),
    headers,
    rows: rows.slice(1),
    formulas: [],
    merges: [],
  }];
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

// 严格数值判定（而非 Number.isFinite(Number(x))），避免 "0x10"、" 100 " 等被改写。
const NUMERIC_CELL_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
function isNumericCellText(text) {
  return NUMERIC_CELL_RE.test(String(text ?? ""));
}

function sheetXml(rows, stringIndex, { workbookSheet = null } = {}) {
  const NS = "http" + "://schemas.openxmlformats.org";
  const formulaByRef = new Map();
  const mergeRefs = [];
  if (workbookSheet) {
    for (const formula of workbookSheet.formulas || []) {
      if (formula.ref && formula.expression) {
        formulaByRef.set(String(formula.ref).toUpperCase(), formula);
      }
    }
    for (const merge of workbookSheet.merges || []) {
      const ref = merge.from && merge.to && merge.from !== merge.to
        ? `${merge.from}:${merge.to}`
        : merge.from;
      if (ref) mergeRefs.push(ref);
    }
  }

  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndexValue) => {
      const ref = `${columnName(columnIndexValue)}${rowIndex + 1}`;
      const formula = formulaByRef.get(ref.toUpperCase());
      // P9-B：保留来自 WorkbookModel 的公式缓存。如果该 cell 在 reader 阶段被
      // 标记为公式 cell，写回 <f>expression</f><v>cachedValue</v>，让 round-trip
      // 不丢公式。字符串缓存值必须带 t="str"——OOXML 无 t 默认 t="n"，<v> 含
      // 文本会触发 Excel 修复对话框（issue #94）。
      if (formula) {
        const cachedValue = String(formula.cachedValue ?? cell ?? "").trim();
        const typeAttr = cachedValue && !isNumericCellText(cachedValue) ? ' t="str"' : "";
        const valueXml = cachedValue ? `<v>${escapeXmlText(cachedValue)}</v>` : "";
        return `        <c r="${ref}"${typeAttr}><f>${escapeXmlText(formula.expression)}</f>${valueXml}</c>`;
      }
      const text = stripMarkdownInlineSyntax(cell);
      // 数值写裸 <v>（默认 t="n"），不再当文本进共享字符串（issue #94）。
      if (isNumericCellText(text)) {
        return `        <c r="${ref}"><v>${text}</v></c>`;
      }
      const strIdx = stringIndex.get(text);
      return `        <c r="${ref}" t="s"><v>${strIdx}</v></c>`;
    }).join("\n");
    return `      <row r="${rowIndex + 1}">\n${cells}\n      </row>`;
  }).join("\n");

  const mergeXml = mergeRefs.length > 0
    ? `\n  <mergeCells count="${mergeRefs.length}">\n${mergeRefs.map((ref) => `    <mergeCell ref="${escapeXmlText(ref)}"/>`).join("\n")}\n  </mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS}/spreadsheetml/2006/main">
  <sheetData>
${rowXml}
  </sheetData>${mergeXml}
</worksheet>`;
}

// 优化版本：在生成 XML 的同时构建字符串索引（issue #165）
// 避免双重遍历所有单元格
function sheetXmlWithStringIndexing(rows, stringIndex, stringArray, getStringIndex, { workbookSheet = null } = {}) {
  const NS = "http" + "://schemas.openxmlformats.org";
  const formulaByRef = new Map();
  const mergeRefs = [];
  let sharedStringCount = 0;

  if (workbookSheet) {
    for (const formula of workbookSheet.formulas || []) {
      if (formula.ref && formula.expression) {
        formulaByRef.set(String(formula.ref).toUpperCase(), formula);
      }
    }
    for (const merge of workbookSheet.merges || []) {
      const ref = merge.from && merge.to && merge.from !== merge.to
        ? `${merge.from}:${merge.to}`
        : merge.from;
      if (ref) mergeRefs.push(ref);
    }
  }

  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndexValue) => {
      const ref = `${columnName(columnIndexValue)}${rowIndex + 1}`;
      const formula = formulaByRef.get(ref.toUpperCase());

      if (formula) {
        const cachedValue = String(formula.cachedValue ?? cell ?? "").trim();
        const typeAttr = cachedValue && !isNumericCellText(cachedValue) ? ' t="str"' : "";
        const valueXml = cachedValue ? `<v>${escapeXmlText(cachedValue)}</v>` : "";
        return `        <c r="${ref}"${typeAttr}><f>${escapeXmlText(formula.expression)}</f>${valueXml}</c>`;
      }

      const text = stripMarkdownInlineSyntax(cell);
      if (isNumericCellText(text)) {
        return `        <c r="${ref}"><v>${text}</v></c>`;
      }

      // 在生成 XML 时构建字符串索引
      const strIdx = getStringIndex(text);
      sharedStringCount += 1;
      return `        <c r="${ref}" t="s"><v>${strIdx}</v></c>`;
    }).join("\n");
    return `      <row r="${rowIndex + 1}">\n${cells}\n      </row>`;
  }).join("\n");

  const mergeXml = mergeRefs.length > 0
    ? `\n  <mergeCells count="${mergeRefs.length}">\n${mergeRefs.map((ref) => `    <mergeCell ref="${escapeXmlText(ref)}"/>`).join("\n")}\n  </mergeCells>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS}/spreadsheetml/2006/main">
  <sheetData>
${rowXml}
  </sheetData>${mergeXml}
</worksheet>`;

  return { xml, sharedStringCount };
}

export function writeXlsx({ model, title = model.title }) {
  const NS = "http" + "://schemas.openxmlformats.org";
  const DC_NS = "http" + "://purl.org/dc/elements/1.1/";
  const sheets = collectSheetsFromModel(model);

  // 去重 sheet 名称，避免 Excel 拒绝打开
  const usedNames = new Set();
  sheets.forEach((sheet, index) => {
    let candidate = sheet.name;
    let suffix = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      const base = sheet.name.slice(0, 31 - String(suffix).length - 1);
      candidate = `${base} ${suffix}`;
      suffix += 1;
    }
    sheets[index] = { ...sheet, name: candidate };
    usedNames.add(candidate.toLowerCase());
  });

  // 优化 issue #165: 合并两次遍历为一次
  // 在生成 sheet XML 时同时构建字符串索引
  const stringIndex = new Map();
  const stringArray = [];
  let sharedCellCount = 0;

  function getStringIndex(str) {
    const strStr = String(str || "");
    if (!stringIndex.has(strStr)) {
      stringIndex.set(strStr, stringArray.length);
      stringArray.push(strStr);
    }
    return stringIndex.get(strStr);
  }

  // 先准备 sheetRowsList（不遍历单元格）
  const sheetRowsList = sheets.map((sheet) => [sheet.headers, ...(sheet.rows || [])]);

  const sheetEntries = sheets.map((sheet, index) => ({
    sheetNumber: index + 1,
    name: sheet.name,
    relId: `rId${index + 10}`,
    rows: sheetRowsList[index],
    workbookSheet: sheet,
  }));

  // 一次遍历：生成 sheet XML 的同时构建字符串索引
  const sheetXmlResults = sheetEntries.map((entry) => {
    const xmlResult = sheetXmlWithStringIndexing(
      entry.rows,
      stringIndex,
      stringArray,
      getStringIndex,
      { workbookSheet: entry.workbookSheet }
    );
    sharedCellCount += xmlResult.sharedStringCount;
    return xmlResult.xml;
  });

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${NS}/spreadsheetml/2006/main" count="${sharedCellCount}" uniqueCount="${stringArray.length}">
${stringArray.map(str => `  <si><t xml:space="preserve">${escapeXmlText(str)}</t></si>`).join('\n')}
</sst>`;

  const workbookSheetsXml = sheetEntries
    .map((entry) => `<sheet name="${escapeXmlText(entry.name)}" sheetId="${entry.sheetNumber}" r:id="${entry.relId}"/>`)
    .join("");
  const workbookRelsXml = sheetEntries
    .map((entry) => `  <Relationship Id="${entry.relId}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${entry.sheetNumber}.xml"/>`)
    .join("\n");
  const contentTypeOverrides = sheetEntries
    .map((entry) => `  <Override PartName="/xl/worksheets/sheet${entry.sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("\n");

  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="${NS}/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${contentTypeOverrides}
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
${workbookRelsXml}
  <Relationship Id="rIdSharedStrings" Type="${NS}/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rIdStyles" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="${NS}/package/2006/metadata/core-properties" xmlns:dc="${DC_NS}"><dc:title>${escapeXmlText(title)}</dc:title></cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>${workbookSheetsXml}</sheets></workbook>`,
    },
    { name: "xl/sharedStrings.xml", data: sharedStringsXml },
    { name: "xl/styles.xml", data: generateStylesXml() },
    ...sheetEntries.map((entry, index) => ({
      name: `xl/worksheets/sheet${entry.sheetNumber}.xml`,
      data: sheetXmlResults[index],
    })),
  ];

  const zipBytes = writeStoredZip(files);
  return {
    type: "binary",
    format: "xlsx",
    data: bytesToDataUrl(zipBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
