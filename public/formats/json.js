import { assertValidDocumentModel } from "../core/document-schema.js";
import { ConversionError } from "../core/conversion-error.js";
import { createCodeBlock, createDocumentModel, createHeading } from "../core/document-model.js";
import { getPlainText } from "../core/document-model.js";
import { writeMarkdown } from "./markdown.js";
import { stripMarkdownInlineSyntax } from "./text-utils.js";

export function readJson({ content, title = "document", format = "json" }) {
  let parsed;
  try {
    parsed = JSON.parse(String(content ?? ""));
  } catch (error) {
    throw new ConversionError(`JSON 解析失败: ${error.message}`, {
      category: "parse",
      code: "JSON_PARSE_ERROR",
      format,
      cause: error,
    });
  }

  if (parsed && parsed.schemaVersion === "trans2former.document.v1" && Array.isArray(parsed.blocks)) {
    return createDocumentModel({
      title: parsed.title || title,
      sourceFormat: parsed.sourceFormat || format,
      blocks: parsed.blocks,
      assets: parsed.assets || [],
      metadata: parsed.metadata || {},
    });
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
