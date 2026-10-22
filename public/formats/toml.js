import { ConversionError } from "../core/conversion-error.js";
import {
  createDocumentModel,
  createHeading,
  createTable,
} from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { flattenToRows, rebuildFromRows } from "./kv-bridge.js";

// 确定性 TOML 解析器：覆盖段（[section] / [a.b]）、键值、数组、内联表、
// 数组表（[[table]]）与常见标量。多行字符串、异构数组等高级用法尽力解析，
// 失败或降级时登记 warning。

function parseError(message, format) {
  return new ConversionError(`TOML 解析失败: ${message}`, {
    category: "parse",
    code: "TOML_PARSE_ERROR",
    format,
  });
}

function stripComment(line) {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && !inLiteral) {
      if (inBasic && line[i - 1] === "\\") continue;
      inBasic = !inBasic;
    } else if (ch === "'" && !inBasic) {
      inLiteral = !inLiteral;
    } else if (ch === "#" && !inBasic && !inLiteral) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseBasicString(text, format) {
  if (text.length < 2 || !text.endsWith('"')) throw parseError("unterminated basic string", format);
  return text.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|["\\bnrtf])/g, (_, esc) => {
    if (esc.startsWith("u") || esc.startsWith("U")) return String.fromCodePoint(parseInt(esc.slice(1), 16));
    return { b: "\b", n: "\n", r: "\r", t: "\t", f: "\f", '"': '"', "\\": "\\" }[esc] ?? esc;
  });
}

function looksLikeDateTime(text) {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(text)
    || /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text);
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let inBasic = false;
  let inLiteral = false;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && !inLiteral) {
      if (inBasic && text[i - 1] === "\\") continue;
      inBasic = !inBasic;
    } else if (ch === "'" && !inBasic) {
      inLiteral = !inLiteral;
    } else if (!inBasic && !inLiteral) {
      if (ch === "[" || ch === "{") depth += 1;
      else if (ch === "]" || ch === "}") depth -= 1;
      else if (ch === separator && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseValue(rawText, format, warnings) {
  const text = String(rawText ?? "").trim();
  if (text === "") throw parseError("missing value", format);
  if (text.startsWith('"""') || text.startsWith("'''")) {
    warnings.push(createWarning("lossy", "TOML_MULTILINE_STRING", "TOML 多行字符串按单行尽力解析，可能不完整。"));
    const quote = text.slice(0, 3);
    const end = text.indexOf(quote, 3);
    const body = end === -1 ? text.slice(3) : text.slice(3, end);
    return quote.startsWith('"') ? body.replace(/\\(u[0-9a-fA-F]{4}|["\\bnrtf])/g, (_, esc) => (
      esc.startsWith("u") ? String.fromCodePoint(parseInt(esc.slice(1), 16))
        : { b: "\b", n: "\n", r: "\r", t: "\t", f: "\f", '"': '"', "\\": "\\" }[esc] ?? esc
    )) : body;
  }
  if (text.startsWith('"')) return parseBasicString(text, format);
  if (text.startsWith("'")) {
    if (text.length < 2 || !text.endsWith("'")) throw parseError("unterminated literal string", format);
    return text.slice(1, -1);
  }
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) throw parseError("unterminated array", format);
    const body = text.slice(1, -1).trim();
    if (body === "") return [];
    const items = splitTopLevel(body, ",").map((part) => part.trim()).filter((part) => part !== "");
    return items.map((item) => parseValue(item, format, warnings));
  }
  if (text.startsWith("{")) {
    if (!text.endsWith("}")) throw parseError("unterminated inline table", format);
    const body = text.slice(1, -1).trim();
    const table = {};
    if (body === "") return table;
    for (const part of splitTopLevel(body, ",")) {
      const pair = splitKeyValuePair(part, format);
      assignPath(table, parseKeyPath(pair[0], format), parseValue(pair[1], format, warnings));
    }
    return table;
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (looksLikeDateTime(text)) return text;
  const numeric = text.replaceAll("_", "");
  if (/^[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+|inf|nan)$/.test(numeric)) {
    if (numeric.startsWith("0x") || numeric.startsWith("+0x") || numeric.startsWith("-0x")) return parseInt(numeric, 16);
    if (numeric.startsWith("0o")) return parseInt(numeric.slice(2), 8);
    if (numeric.startsWith("0b")) return parseInt(numeric.slice(2), 2);
    const value = Number(numeric);
    if (Number.isFinite(value) || /inf|nan/.test(numeric)) return value;
  }
  throw parseError(`unrecognized value: ${text.slice(0, 40)}`, format);
}

function splitKeyValuePair(text, format) {
  let inBasic = false;
  let inLiteral = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && !inLiteral) inBasic = !inBasic;
    else if (ch === "'" && !inBasic) inLiteral = !inLiteral;
    else if (ch === "=" && !inBasic && !inLiteral) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  throw parseError(`expected key = value, got: ${text.slice(0, 40)}`, format);
}

function parseKeyPath(rawKey, format) {
  return splitTopLevel(String(rawKey), ".".charCodeAt(0)).map((segment) => {
    const trimmed = segment.trim();
    if (trimmed === "") throw parseError("empty key segment", format);
    if (trimmed.startsWith('"')) return parseBasicString(trimmed, format);
    if (trimmed.startsWith("'")) {
      if (!trimmed.endsWith("'")) throw parseError("unterminated quoted key", format);
      return trimmed.slice(1, -1);
    }
    return trimmed;
  });
}

function assignPath(root, path, value) {
  let current = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (Array.isArray(current[segment])) {
      const last = current[segment][current[segment].length - 1];
      current = last && typeof last === "object" && !Array.isArray(last) ? last : (() => { throw parseError(`key path conflicts with array: ${path.join(".")}`, "toml"); })();
    } else {
      if (!current[segment] || typeof current[segment] !== "object") current[segment] = {};
      current = current[segment];
    }
  }
  current[path[path.length - 1]] = value;
}

export function parseToml(source, format = "toml") {
  const warnings = [];
  const root = {};
  let current = root;
  const text = String(source ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    let line = stripComment(lines[i]).trim();
    if (line === "") continue;
    // 跨行数组：值以 [ 开头且未闭合时，合并后续行（deterministic：仅数组）
    while ((line.match(/\[/g) || []).length > (line.match(/\]/g) || []).length && i + 1 < lines.length) {
      i += 1;
      line = `${line}\n${stripComment(lines[i]).trim()}`;
    }
    if (line.startsWith("[[")) {
      const end = line.indexOf("]]");
      if (end === -1) throw parseError(`line ${i + 1}: unterminated array-of-tables header`, format);
      const path = parseKeyPath(line.slice(2, end), format);
      let parent = root;
      for (let p = 0; p < path.length - 1; p += 1) {
        parent = parent[path[p]] ??= {};
        if (Array.isArray(parent)) parent = parent[parent.length - 1];
      }
      const key = path[path.length - 1];
      if (!Array.isArray(parent[key])) parent[key] = [];
      const entry = {};
      parent[key].push(entry);
      current = entry;
      continue;
    }
    if (line.startsWith("[")) {
      const end = line.indexOf("]");
      if (end === -1) throw parseError(`line ${i + 1}: unterminated table header`, format);
      const path = parseKeyPath(line.slice(1, end), format);
      let parent = root;
      for (let p = 0; p < path.length; p += 1) {
        const segment = path[p];
        if (Array.isArray(parent[segment])) {
          parent = parent[segment][parent[segment].length - 1];
        } else {
          parent[segment] ??= {};
          parent = parent[segment];
        }
        if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
          throw parseError(`line ${i + 1}: table path conflicts with scalar`, format);
        }
      }
      current = parent;
      continue;
    }
    const [rawKey, rawValue] = splitKeyValuePair(line, format);
    const path = parseKeyPath(rawKey, format);
    let host = current;
    for (let p = 0; p < path.length - 1; p += 1) {
      host[path[p]] ??= {};
      host = host[path[p]];
      if (!host || typeof host !== "object") throw parseError(`line ${i + 1}: dotted key conflicts`, format);
    }
    const key = path[path.length - 1];
    if (Object.prototype.hasOwnProperty.call(host, key)) {
      throw parseError(`line ${i + 1}: duplicate key "${key}"`, format);
    }
    host[key] = parseValue(rawValue, format, warnings);
  }
  return { value: root, warnings };
}

export function readToml({ content, title = "document", format = "toml" }) {
  const parsed = parseToml(content, format);
  const warnings = [...parsed.warnings];
  const rows = flattenToRows(parsed.value, warnings, "TOML");
  const blocks = rows.length > 0
    ? [createHeading(1, title), createTable(["键", "值"], rows)]
    : [createParagraph("(empty TOML document)")];
  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({ originalToml: parsed.value }, warnings),
  });
}

function emitKeySegment(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(String(key));
}

function emitTomlValue(value, keyPath, lines, warnings) {
  if (value === null || value === undefined) {
    warnings.push(createWarning("lossy", "TOML_NULL_AS_STRING", "TOML 无 null 类型，空值已写为空字符串。"));
    return '""';
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : `"${String(value)}"`;
  if (Array.isArray(value)) {
    return `[${value.map((item) => emitTomlValue(item, keyPath, lines, warnings)).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return `{${entries.map(([key, item]) => `${emitKeySegment(key)} = ${emitTomlValue(item, keyPath, lines, warnings)}`).join(", ")}}`;
  }
  const text = String(value);
  if (looksLikeDateTime(text)) return text;
  return JSON.stringify(text);
}

function emitTomlTable(map, path, lines, warnings) {
  const scalarEntries = [];
  const tableEntries = [];
  const arrayTableEntries = [];
  for (const [key, value] of Object.entries(map)) {
    if (value && typeof value === "object" && !Array.isArray(value)) tableEntries.push([key, value]);
    else if (Array.isArray(value) && value.length > 0 && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      arrayTableEntries.push([key, value]);
    } else scalarEntries.push([key, value]);
  }
  for (const [key, value] of scalarEntries) {
    lines.push(`${emitKeySegment(key)} = ${emitTomlValue(value, [...path, key].join("."), lines, warnings)}`);
  }
  for (const [key, value] of tableEntries) {
    const childPath = [...path, key];
    lines.push("");
    lines.push(`[${childPath.map(emitKeySegment).join(".")}]`);
    emitTomlTable(value, childPath, lines, warnings);
  }
  for (const [key, array] of arrayTableEntries) {
    const childPath = [...path, key];
    for (const entry of array) {
      lines.push("");
      lines.push(`[[${childPath.map(emitKeySegment).join(".")}]]`);
      emitTomlTable(entry, childPath, lines, warnings);
    }
  }
}

export function writeToml({ model }) {
  const warnings = [];
  const { mapping, extraTableCount } = rebuildFromRows(model, "TOML");
  if (extraTableCount > 0) {
    warnings.push(createWarning(
      "lossy",
      "TOML_EXTRA_TABLES_DROPPED",
      `${extraTableCount + 1} 个表格中仅第一个键值表写入 TOML，其余表格未包含。`,
      { tableCount: extraTableCount + 1 },
    ));
  }
  const lines = [];
  emitTomlTable(mapping, [], lines, warnings);
  const data = `${lines.join("\n").replace(/^\n+/, "")}\n`;
  return {
    type: "text",
    format: "toml",
    data,
    mime: "application/toml;charset=utf-8",
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
