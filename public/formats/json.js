import { assertValidDocumentModel } from "../core/document-schema.js";
import { ConversionError } from "../core/conversion-error.js";
import { createCodeBlock, createDocumentModel, createHeading, createTable, getPlainText } from "../core/document-model.js";
import { createWorkbookModel } from "../core/models/workbook-model.js";
import { writeMarkdown } from "./markdown.js";
import { stripMarkdownInlineSyntax } from "./text-utils.js";

function isFlatScalar(value) {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean";
}

function toCellString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function tryArrayOfObjectsAsTable(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const headers = new Set();
  for (const row of parsed) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    for (const key of Object.keys(row)) {
      if (!isFlatScalar(row[key]) && typeof row[key] !== "object") return null;
      headers.add(key);
    }
  }
  if (headers.size === 0) return null;
  const headerList = [...headers];
  const rows = parsed.map((row) => headerList.map((key) => toCellString(row[key])));
  return { headers: headerList, rows };
}

function tryArrayOfScalarsAsTable(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  if (!parsed.every(isFlatScalar)) return null;
  return { headers: ["value"], rows: parsed.map((value) => [toCellString(value)]) };
}

export function readJson({ content, title = "document", format = "json" }) {
  let parsed;
  try {
    parsed = JSON.parse(String(content ?? ""));
  } catch (error) {
    throw new ConversionError("JSON 解析失败：输入不是有效的 JSON 文档", {
      category: "parse",
      code: "JSON_PARSE_ERROR",
      format,
      cause: error,
    });
  }

  if (parsed && parsed.schemaVersion === "trans2former.document.v1" && Array.isArray(parsed.blocks)) {
    // 修复 issue #56: 验证基本 schema（block type 和必填字段）
    // 注意：不调用 assertValidDocumentModel，因为 id/sourceSpan/warnings 由 ensureDocumentAudit 后续补充
    const VALID_BLOCK_TYPES = new Set(["heading", "paragraph", "list", "code", "table", "quote", "image", "asset", "raw"]);
    for (let i = 0; i < parsed.blocks.length; i++) {
      const block = parsed.blocks[i];
      if (!block || typeof block !== "object") {
        throw new ConversionError({
          message: `blocks[${i}] 必须是对象`,
          category: "validation",
          code: "DOCUMENT_MODEL_SCHEMA_ERROR",
          format,
        });
      }
      if (!VALID_BLOCK_TYPES.has(block.type)) {
        throw new ConversionError({
          message: `blocks[${i}].type 无效: ${block.type}`,
          category: "validation",
          code: "DOCUMENT_MODEL_SCHEMA_ERROR",
          format,
        });
      }
      // 验证必填字段
      if (block.type === "list" && !Array.isArray(block.items)) {
        throw new ConversionError({
          message: `blocks[${i}].items 必须是数组（list 类型必填）`,
          category: "validation",
          code: "DOCUMENT_MODEL_SCHEMA_ERROR",
          format,
        });
      }
      if (block.type === "table" && (!Array.isArray(block.headers) || !Array.isArray(block.rows))) {
        throw new ConversionError({
          message: `blocks[${i}] 缺少 headers 或 rows（table 类型必填）`,
          category: "validation",
          code: "DOCUMENT_MODEL_SCHEMA_ERROR",
          format,
        });
      }
      if (block.type === "code" && typeof block.code !== "string") {
        throw new ConversionError({
          message: `blocks[${i}].code 必须是字符串（code 类型必填）`,
          category: "validation",
          code: "DOCUMENT_MODEL_SCHEMA_ERROR",
          format,
        });
      }
    }
    return createDocumentModel({
      title: parsed.title || title,
      sourceFormat: parsed.sourceFormat || format,
      blocks: parsed.blocks,
      assets: parsed.assets || [],
      metadata: parsed.metadata || {},
    });
  }

  const objectTable = tryArrayOfObjectsAsTable(parsed);
  const scalarTable = !objectTable ? tryArrayOfScalarsAsTable(parsed) : null;
  const tabular = objectTable || scalarTable;
  if (tabular) {
    const model = createDocumentModel({
      title,
      sourceFormat: format,
      blocks: [createTable(tabular.headers, tabular.rows)],
      metadata: { originalJson: parsed },
    });
    model.workbook = createWorkbookModel({
      sheets: [{ name: title || "Sheet 1", headers: tabular.headers, rows: tabular.rows }],
    });
    return model;
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks: [
      createHeading(1, "JSON Document"),
      createCodeBlock(JSON.stringify(parsed, null, 2), "json"),
    ],
    metadata: {
      originalJson: parsed,
    },
  });
}

export function writeJson({ model, title = model.title }) {
  assertValidDocumentModel(model);
  const markdown = writeMarkdown({ model }).data.trim();
  return {
    type: "text",
    format: "json",
    data: `${JSON.stringify({
      schemaVersion: model.schemaVersion,
      title,
      sourceFormat: model.sourceFormat,
      from: model.sourceFormat,
      blocks: model.blocks,
      assets: model.assets,
      metadata: model.metadata,
      plainText: stripMarkdownInlineSyntax(getPlainText(model)),
      markdown,
    }, null, 2)}\n`,
    mime: "application/json;charset=utf-8",
  };
}
