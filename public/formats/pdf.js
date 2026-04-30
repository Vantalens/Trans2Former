import { createDocumentModel, createHeading, createParagraph } from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";

function decodePdfString(value) {
  return String(value ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function coercePdfText(content) {
  if (content instanceof Uint8Array) return new TextDecoder("latin1").decode(content);
  if (content instanceof ArrayBuffer) return new TextDecoder("latin1").decode(new Uint8Array(content));
  if (ArrayBuffer.isView(content)) return new TextDecoder("latin1").decode(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
  const text = String(content ?? "");
  const dataUrlMatch = text.match(/^data:[^;]+;base64,(.+)$/);
  if (dataUrlMatch) {
    if (typeof atob === "function") {
      return atob(dataUrlMatch[1]);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(dataUrlMatch[1], "base64").toString("latin1");
    }
  }
  return text;
}

export function readPdf({ content, title = "pdf", fileName = "", format = "pdf" }) {
  const source = coercePdfText(content);
  const strings = [...source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|"|TJ)/g)]
    .map((match) => decodePdfString(match[1]).trim())
    .filter(Boolean);
  const blocks = [];
  if (strings.length > 0) {
    blocks.push(createHeading(1, strings[0]));
    strings.slice(1).forEach((text) => blocks.push(createParagraph(text)));
  }
  const warnings = [createWarning(
    "lossy",
    "PDF_TEXT_EXTRACTION_MVP",
    "PDF MVP extracts simple literal text operators only; layout, fonts, images, and scanned pages are not preserved."
  )];

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({
      pdf: {
        extraction: "literal-text-operators",
        textItemCount: strings.length,
        fileName,
      },
    }, warnings),
  });
}
