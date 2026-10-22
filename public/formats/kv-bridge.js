import { createWarning } from "../core/warnings.js";
import { inlinesToPlainText } from "../core/models/semantic-inlines.js";
import { getInlineTokens } from "./inline-tokens.js";

// 键值类文本格式（YAML/TOML）与 DocumentModel 之间的共享桥接：
// reader 把嵌套映射按点分路径拍平成「键/值」两列表格；writer 反过来从第一个
// 两列表格重建嵌套对象，其余正文块（段落/列表/代码等）收进 content 列表。

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function looksLikeNumber(text) {
  return /^[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+)$/.test(text)
    && !/^0\d/.test(text);
}

function cellString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function flattenInto(value, prefix, rows, depth, warnings, tag) {
  if (depth > 8) {
    warnings.push(createWarning(
      "lossy",
      `${tag}_DEPTH_LIMIT`,
      `${tag} 嵌套超过 8 层，深层结构以 JSON 文本形式保留。`,
    ));
    rows.push([prefix, JSON.stringify(value)]);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${String(key)}` : String(key);
    if (isPlainObject(item) && Object.keys(item).length > 0) {
      flattenInto(item, path, rows, depth + 1, warnings, tag);
    } else {
      rows.push([path, cellString(item)]);
    }
  }
}

export function flattenToRows(value, warnings, tag) {
  const rows = [];
  if (isPlainObject(value)) {
    flattenInto(value, "", rows, 0, warnings, tag);
  }
  return rows;
}

function expandDottedKey(key) {
  return String(key ?? "").split(".").map((part) => part.trim()).filter(Boolean);
}

function setPathValue(target, path, value) {
  let current = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (!isPlainObject(current[segment])) current[segment] = {};
    current = current[segment];
  }
  current[path[path.length - 1]] = value;
}

export function inferScalar(cell) {
  const text = String(cell ?? "");
  const trimmed = text.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  const lower = trimmed.toLowerCase();
  if (lower === "null" || trimmed === "~") return null;
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (looksLikeNumber(trimmed)) {
    const value = trimmed.startsWith("0x") ? parseInt(trimmed, 16)
      : trimmed.startsWith("0o") ? parseInt(trimmed.slice(2), 8)
        : Number(trimmed);
    if (Number.isFinite(value)) return value;
  }
  return text;
}

function blockToContentLine(block) {
  // block.text 可能保留 markdown 源标记（`**粗体**`），键值/正文载体应输出纯文本。
  if (block.type === "list") {
    return (block.items || []).map((item, index) => {
      const itemInlines = Array.isArray(block.itemInlines?.[index])
        ? block.itemInlines[index]
        : getInlineTokens({ text: item });
      return `· ${inlinesToPlainText(itemInlines)}`;
    }).join("\n");
  }
  if (block.type === "code") return block.code;
  if (block.type === "paragraph" || block.type === "quote") return inlinesToPlainText(getInlineTokens(block));
  if (block.type === "raw") return block.content;
  return "";
}

// 从 DocumentModel 重建键值映射：
// - JSON 源（metadata.originalJson）直接按原始嵌套结构重建，保住对象层级与数组语义；
// - 第一个两列及以上的 table 视为键值表（点分路径还原嵌套）；
// - 非表格正文收进 content 列表；完全没有键值时退化为 { title, content }。
export function rebuildFromRows(model, tag) {
  const original = model?.metadata?.originalJson;
  if (isPlainObject(original) && Object.keys(original).length > 0) {
    return { mapping: structuredClone(original), extraTableCount: 0 };
  }
  if (Array.isArray(original) && original.length > 0) {
    // 顶层数组无法直接作为 YAML/TOML 根映射，包一层 items 保住全部元素。
    return { mapping: { items: structuredClone(original) }, extraTableCount: 0 };
  }
  const tables = (model.blocks || []).filter((block) => block.type === "table");
  const mapping = {};
  let extraTableCount = 0;
  const primary = tables[0];
  if (primary && primary.headers.length >= 2) {
    extraTableCount = tables.length - 1;
    for (const row of primary.rows) {
      const path = expandDottedKey(row[0]);
      if (path.length === 0) continue;
      setPathValue(mapping, path, inferScalar(row.slice(1).join(" ")));
    }
  }
  const content = (model.blocks || [])
    .filter((block) => block.type !== "table" && block.type !== "heading")
    .map(blockToContentLine)
    .filter((text) => String(text).trim() !== "");
  if (content.length > 0) {
    mapping.content = content;
  }
  if (Object.keys(mapping).length === 0) {
    mapping.title = String(model.title || "document");
  }
  return { mapping, extraTableCount, content, tag };
}
