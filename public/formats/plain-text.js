import { createDocumentModel, createParagraph } from "../core/document-model.js";
import { getPlainText } from "../core/document-model.js";
import { stripMarkdownInlineSyntax } from "./text-utils.js";

export function readText({ content, title = "document", format = "txt" }) {
  const blocks = String(content ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => createParagraph(chunk.replace(/\n/g, " ")));

  return createDocumentModel({ title, sourceFormat: format, blocks });
}

export function writeText({ model }) {
  return {
    type: "text",
    format: "txt",
    data: `${stripMarkdownInlineSyntax(getPlainText(model))}\n`,
    mime: "text/plain;charset=utf-8",
  };
}
