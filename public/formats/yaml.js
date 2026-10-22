import { ConversionError } from "../core/conversion-error.js";
import {
  createDocumentModel,
  createHeading,
  createList,
  createParagraph,
  createTable,
} from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { flattenToRows, isPlainObject, rebuildFromRows } from "./kv-bridge.js";

// 确定性缩进 YAML 解析器：覆盖常见配置/数据文件（映射、列表、标量、嵌套、
// 基础块标量与扁平 flow 集合）。锚点/别名/标签/多文档等高级特性不展开，
// 检测到即登记 warning 并尽力解析，绝不静默产出错误结构。

const SCALAR_PLAIN_MAX = 1024;

function parseError(message, format) {
  return new ConversionError(`YAML 解析失败: ${message}`, {
    category: "parse",
    code: "YAML_PARSE_ERROR",
    format,
  });
}

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseQuotedScalar(text, format) {
  if (text.startsWith('"')) {
    if (text.length < 2 || !text.endsWith('"')) throw parseError("unterminated double-quoted scalar", format);
    const body = text.slice(1, -1);
    return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|["\\/nrt0])/g, (_, esc) => {
      if (esc.startsWith("u")) return String.fromCharCode(parseInt(esc.slice(1), 16));
      if (esc.startsWith("x")) return String.fromCharCode(parseInt(esc.slice(1), 16));
      return { n: "\n", r: "\r", t: "\t", "0": "\0", '"': '"', "\\": "\\", "/": "/" }[esc] ?? esc;
    });
  }
  if (text.length < 2 || !text.endsWith("'")) throw parseError("unterminated single-quoted scalar", format);
  return text.slice(1, -1).replaceAll("''", "'");
}

function looksLikeNumber(text) {
  return /^[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+)$/.test(text)
    && !/^0\d/.test(text);
}

function parseScalar(rawText, format) {
  const text = String(rawText ?? "").trim();
  if (text === "") return null;
  if (text.startsWith('"') || text.startsWith("'")) return parseQuotedScalar(text, format);
  if (text.startsWith("[") || text.startsWith("{")) return parseFlow(text, format);
  const lower = text.toLowerCase();
  if (["null", "~"].includes(lower)) return null;
  if (["true", "yes", "on"].includes(lower)) return true;
  if (["false", "no", "off"].includes(lower)) return false;
  if (looksLikeNumber(text)) {
    const value = text.startsWith("0x") ? parseInt(text, 16)
      : text.startsWith("0o") ? parseInt(text.slice(2), 8)
        : Number(text);
    if (Number.isFinite(value)) return value;
  }
  return text;
}

// 扁平 flow 集合：[a, b, c] / {a: 1, b: 2}；嵌套 flow 通过递归支持，
// 解析失败抛 parse error 而不是返回半截结构。
function parseFlow(text, format) {
  let pos = 0;
  function skipWs() {
    while (pos < text.length && /[\s]/.test(text[pos])) pos += 1;
  }
  function parseValue() {
    skipWs();
    const ch = text[pos];
    if (ch === "[") {
      pos += 1;
      const items = [];
      skipWs();
      if (text[pos] === "]") { pos += 1; return items; }
      for (;;) {
        items.push(parseValue());
        skipWs();
        if (text[pos] === ",") { pos += 1; skipWs(); continue; }
        if (text[pos] === "]") { pos += 1; return items; }
        throw parseError("malformed flow sequence", format);
      }
    }
    if (ch === "{") {
      pos += 1;
      const map = {};
      skipWs();
      if (text[pos] === "}") { pos += 1; return map; }
      for (;;) {
        skipWs();
        const keyMatch = /^[^{},:\[\]"']+|"[^"]*"|'[^']*'/.exec(text.slice(pos));
        if (!keyMatch) throw parseError("malformed flow mapping key", format);
        const keyText = keyMatch[0];
        pos += keyText.length;
        skipWs();
        if (text[pos] !== ":") throw parseError("malformed flow mapping", format);
        pos += 1;
        const key = keyText.startsWith('"') || keyText.startsWith("'")
          ? parseQuotedScalar(keyText.trim(), format)
          : keyText.trim();
        map[key] = parseValue();
        skipWs();
        if (text[pos] === ",") { pos += 1; skipWs(); continue; }
        if (text[pos] === "}") { pos += 1; return map; }
        throw parseError("malformed flow mapping", format);
      }
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let end = pos + 1;
      while (end < text.length) {
        if (text[end] === "\\" && quote === '"') { end += 2; continue; }
        if (text[end] === quote) {
          if (quote === "'" && text[end + 1] === "'") { end += 2; continue; }
          break;
        }
        end += 1;
      }
      const raw = text.slice(pos, end + 1);
      pos = end + 1;
      return parseQuotedScalar(raw, format);
    }
    let end = pos;
    while (end < text.length && !/[,}\]]/.test(text[end])) end += 1;
    const raw = text.slice(pos, end).trim();
    pos = end;
    return parseScalar(raw, format);
  }
  const value = parseValue();
  skipWs();
  if (pos !== text.length) throw parseError("trailing content after flow collection", format);
  return value;
}

function splitKeyValue(text) {
  // 找到顶层 ": " 分隔（不在引号内），返回 [key, value] 或 null
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      const next = text[i + 1];
      if (next === undefined || next === " " || next === "\t") {
        return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
      }
    }
  }
  return null;
}

function preprocessLines(source, warnings, format) {
  const lines = [];
  const raw = String(source ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  let docCount = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (/\t/.test(line.slice(0, line.length - line.trimStart().length))) {
      throw parseError(`line ${i + 1}: tab indentation is not valid YAML`, format);
    }
    const trimmed = line.trim();
    if (trimmed === "---" || trimmed.startsWith("--- ")) {
      docCount += 1;
      if (docCount > 1) {
        warnings.push(createWarning(
          "lossy",
          "YAML_MULTI_DOCUMENT",
          "YAML 多文档输入：仅解析第一个文档，后续文档已忽略。",
        ));
        break;
      }
      continue;
    }
    if (trimmed === "...") break;
    if (trimmed.startsWith("%")) {
      warnings.push(createWarning("info", "YAML_DIRECTIVE_SKIPPED", "YAML 指令行（%YAML/%TAG）已跳过。"));
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    lines.push({ indent, text: stripComment(line.slice(indent)).trimEnd(), lineNo: i + 1 });
  }
  return lines.filter((entry) => entry.text.trim() !== "");
}

function parseBlock(lines, state, minIndent, format) {
  const first = lines[state.pos];
  if (!first || first.indent < minIndent) return null;
  if (first.text.startsWith("- ") || first.text === "-") {
    return parseSequence(lines, state, first.indent, format);
  }
  return parseMapping(lines, state, first.indent, format);
}

function readBlockScalar(lines, state, parentIndent, folded) {
  const collected = [];
  while (state.pos < lines.length && lines[state.pos].indent > parentIndent) {
    collected.push(lines[state.pos]);
    state.pos += 1;
  }
  if (collected.length === 0) return "";
  const baseIndent = Math.min(...collected.map((line) => line.indent));
  const texts = collected.map((line) => " ".repeat(line.indent - baseIndent) + line.text);
  return folded ? texts.join(" ") : texts.join("\n");
}

function parseMapping(lines, state, indent, format) {
  const map = {};
  while (state.pos < lines.length) {
    const line = lines[state.pos];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw parseError(`line ${line.lineNo}: unexpected indentation`, format);
    }
    if (line.text.startsWith("- ") || line.text === "-") break;
    const pair = splitKeyValue(line.text);
    if (!pair) throw parseError(`line ${line.lineNo}: expected "key: value"`, format);
    let [key, rawValue] = pair;
    if (key.startsWith('"') || key.startsWith("'")) key = parseQuotedScalar(key, format);
    if (key === "") throw parseError(`line ${line.lineNo}: empty mapping key`, format);
    if (key.startsWith("?")) {
      state.warnings.push(createWarning("info", "YAML_COMPLEX_KEY", "YAML 复杂键（? key）按普通文本处理。"));
      key = key.slice(1).trim();
    }
    state.pos += 1;
    if (rawValue === "|" || rawValue === ">" || rawValue === "|-" || rawValue === ">-" || rawValue === "|+" || rawValue === ">+") {
      map[key] = readBlockScalar(lines, state, indent, rawValue.startsWith(">"));
      continue;
    }
    if (rawValue !== "") {
      const cleaned = stripAnchorTag(rawValue, state.warnings);
      map[key] = cleaned === null ? null : parseScalar(cleaned, format);
      continue;
    }
    // 值为空：跟随的子块（更深缩进）或 null
    const next = lines[state.pos];
    if (next && next.indent > indent) {
      map[key] = parseBlock(lines, state, next.indent, format);
    } else if (next && next.indent === indent && (next.text.startsWith("- ") || next.text === "-")) {
      // YAML 允许序列与父映射键同级缩进
      map[key] = parseSequence(lines, state, indent, format);
    } else {
      map[key] = null;
    }
  }
  return map;
}

function parseSequence(lines, state, indent, format) {
  const items = [];
  while (state.pos < lines.length) {
    const line = lines[state.pos];
    if (line.indent !== indent || (!line.text.startsWith("- ") && line.text !== "-")) break;
    const rest = line.text === "-" ? "" : line.text.slice(2).trim();
    state.pos += 1;
    if (rest === "") {
      const next = lines[state.pos];
      items.push(next && next.indent > indent ? parseBlock(lines, state, next.indent, format) : null);
      continue;
    }
    const pair = splitKeyValue(rest);
    if (pair && !rest.startsWith('"') && !rest.startsWith("'") && !rest.startsWith("[") && !rest.startsWith("{")) {
      // 序列项是映射：首键在当前行，后续键按 "- " 之后的位置对齐
      const mapIndent = indent + 2;
      const [key, rawValue] = pair;
      const map = {};
      if (rawValue === "") {
        const next = lines[state.pos];
        map[key] = next && next.indent > indent ? parseBlock(lines, state, next.indent, format) : null;
      } else {
        const cleaned = stripAnchorTag(rawValue, state.warnings);
        map[key] = cleaned === null ? null : parseScalar(cleaned, format);
      }
      while (state.pos < lines.length) {
        const follow = lines[state.pos];
        if (follow.indent < mapIndent || follow.text.startsWith("- ") || follow.text === "-") break;
        if (follow.indent > mapIndent) break;
        const followPair = splitKeyValue(follow.text);
        if (!followPair) break;
        state.pos += 1;
        const [fKey, fValue] = followPair;
        if (fValue === "") {
          const next = lines[state.pos];
          map[fKey] = next && next.indent > mapIndent ? parseBlock(lines, state, next.indent, format) : null;
        } else {
          const cleaned = stripAnchorTag(fValue, state.warnings);
          map[fKey] = cleaned === null ? null : parseScalar(cleaned, format);
        }
      }
      items.push(map);
      continue;
    }
    const cleaned = stripAnchorTag(rest, state.warnings);
    items.push(cleaned === null ? null : parseScalar(cleaned, format));
  }
  return items;
}

function stripAnchorTag(value, warnings) {
  const match = value.match(/^([&*!][^\s]+|![^\s]*)\s*(.*)$/);
  if (!match) return value;
  const token = match[1];
  if (token.startsWith("*")) {
    warnings.push(createWarning(
      "lossy",
      "YAML_ALIAS_UNRESOLVED",
      "YAML 别名（*anchor）未解析，相关值按 null 处理。",
    ));
    return null;
  }
  warnings.push(createWarning(
    "info",
    "YAML_ANCHOR_TAG_STRIPPED",
    "YAML 锚点/标签（&anchor、!tag）已剥离，仅保留字面值。",
  ));
  return match[2] === "" ? null : match[2];
}

export function parseYaml(source, format = "yaml") {
  const warnings = [];
  const lines = preprocessLines(source, warnings, format);
  if (lines.length === 0) return { value: null, warnings };
  const state = { pos: 0, warnings };
  const value = parseBlock(lines, state, lines[0].indent, format);
  if (state.pos < lines.length) {
    throw parseError(`line ${lines[state.pos].lineNo}: inconsistent structure`, format);
  }
  return { value, warnings };
}

function tryArrayAsTable(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.every((entry) => isPlainObject(entry))) {
    const headers = [...new Set(value.flatMap((entry) => Object.keys(entry)))];
    if (headers.length === 0) return null;
    const rows = value.map((entry) => headers.map((key) => {
      const cell = entry[key];
      if (cell === null || cell === undefined) return "";
      return typeof cell === "object" ? JSON.stringify(cell) : String(cell);
    }));
    return { headers, rows };
  }
  if (value.every((entry) => !isPlainObject(entry) && !Array.isArray(entry))) {
    return { headers: ["value"], rows: value.map((entry) => [entry === null ? "" : String(entry)]) };
  }
  return null;
}

export function readYaml({ content, title = "document", format = "yaml" }) {
  const parsed = parseYaml(content, format);
  const warnings = [...parsed.warnings];
  const value = parsed.value;
  const blocks = [];

  if (isPlainObject(value)) {
    const rows = flattenToRows(value, warnings, "YAML");
    if (rows.length > 0) {
      blocks.push(createHeading(1, title));
      blocks.push(createTable(["键", "值"], rows));
    }
  } else if (Array.isArray(value)) {
    const table = tryArrayAsTable(value);
    if (table) {
      blocks.push(createHeading(1, title));
      blocks.push(createTable(table.headers, table.rows));
    } else {
      blocks.push(createList(value.map((entry) => JSON.stringify(entry))));
    }
  } else if (value !== null && value !== undefined) {
    blocks.push(createParagraph(String(value)));
  }
  if (blocks.length === 0) blocks.push(createParagraph("(empty YAML document)"));

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({ originalYaml: value }, warnings),
  });
}

function needsQuoting(text) {
  if (text === "") return true;
  if (text !== text.trim()) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(text)) return true;
  if (/[:?]\s|\s#|:\s*$/.test(text)) return true;
  const lower = text.toLowerCase();
  if (["null", "~", "true", "false", "yes", "no", "on", "off"].includes(lower)) return true;
  return looksLikeNumber(text) || text.length > SCALAR_PLAIN_MAX;
}

function emitScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (text.includes("\n")) {
    return `|\n${text.split("\n").map((line) => `  ${line}`).join("\n")}`;
  }
  if (needsQuoting(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function emitYamlValue(value, indent, lines) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${pad}[]`);
      return;
    }
    for (const item of value) {
      if (isPlainObject(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) {
          lines.push(`${pad}- {}`);
          continue;
        }
        entries.forEach(([key, entry], index) => {
          const prefix = index === 0 ? `${pad}- ` : `${pad}  `;
          if (isPlainObject(entry) || Array.isArray(entry)) {
            lines.push(`${prefix}${emitKey(key)}:`);
            emitYamlValue(entry, indent + 2, lines);
          } else {
            lines.push(`${prefix}${emitKey(key)}: ${emitScalar(entry)}`);
          }
        });
      } else if (Array.isArray(item)) {
        lines.push(`${pad}-`);
        emitYamlValue(item, indent + 2, lines);
      } else {
        lines.push(`${pad}- ${emitScalar(item)}`);
      }
    }
    return;
  }
  if (isPlainObject(value)) {
    emitYamlMapping(value, indent, lines);
    return;
  }
  lines.push(`${pad}${emitScalar(value)}`);
}

function emitKey(key) {
  const text = String(key);
  return needsQuoting(text) ? JSON.stringify(text) : text;
}

function emitYamlMapping(map, indent, lines) {
  const pad = " ".repeat(indent);
  for (const [key, value] of Object.entries(map)) {
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      lines.push(`${pad}${emitKey(key)}:`);
      emitYamlMapping(value, indent + 2, lines);
    } else if (Array.isArray(value) && value.length > 0) {
      lines.push(`${pad}${emitKey(key)}:`);
      emitYamlValue(value, indent + 2, lines);
    } else if (isPlainObject(value)) {
      lines.push(`${pad}${emitKey(key)}: {}`);
    } else {
      lines.push(`${pad}${emitKey(key)}: ${emitScalar(value)}`);
    }
  }
}

export function writeYaml({ model }) {
  const warnings = [];
  const { mapping, extraTableCount } = rebuildFromRows(model, "YAML");
  if (extraTableCount > 0) {
    warnings.push(createWarning(
      "lossy",
      "YAML_EXTRA_TABLES_DROPPED",
      `${extraTableCount + 1} 个表格中仅第一个键值表写入 YAML，其余表格未包含。`,
      { tableCount: extraTableCount + 1 },
    ));
  }

  const lines = [];
  emitYamlMapping(mapping, 0, lines);
  return {
    type: "text",
    format: "yaml",
    data: `${lines.join("\n")}\n`,
    mime: "application/yaml;charset=utf-8",
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
