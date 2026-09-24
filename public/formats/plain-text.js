import { createDocumentModel, createParagraph } from "../core/document-model.js";
import { getPlainText } from "../core/document-model.js";
import { createInlineLineBreak, createInlineText } from "../core/models/semantic-inlines.js";
import { stripMarkdownInlineSyntax } from "./text-utils.js";

export function readText({ content, title = "document", format = "txt" }) {
  const blocks = String(content ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const paragraph = createParagraph(chunk);
      if (chunk.includes("\n")) {
        paragraph.inlines = chunk.split("\n").flatMap((line, index) => [
          ...(index > 0 ? [createInlineLineBreak()] : []),
          createInlineText(line),
        ]);
      }
      return paragraph;
    });

  return createDocumentModel({ title, sourceFormat: format, blocks });
}

export function writeText({ model }) {
  const text = stripMarkdownInlineSyntax(getPlainText(model));
  return {
    type: "text",
    format: "txt",
    data: text.endsWith("\n") ? text : `${text}\n`,
    mime: "text/plain;charset=utf-8",
  };
}
