import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { getPlainText } from "../core/document-model.js";
import { writePdfHighFidelity } from "./pdf-output-high-fidelity.js";
import { stripMarkdownInlineSyntax } from "./text-utils.js";

function utf16BeHex(value) {
  return [...String(value ?? "")]
    .map((char) => char.codePointAt(0))
    .flatMap((codePoint) => {
      if (codePoint <= 0xffff) return [codePoint];
      const offset = codePoint - 0x10000;
      return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
    })
    .map((codeUnit) => codeUnit.toString(16).toUpperCase().padStart(4, "0"))
    .join("");
}

function pdfUnicodeString(value) {
  return `<FEFF${utf16BeHex(value)}>`;
}

const PDF_MAX_LINE_LEN_ASCII = 80;
const PDF_MAX_LINE_LEN_CJK = 38;

function isCjkChar(char) {
  const code = char.codePointAt(0);
  return (code >= 0x3000 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0xff00 && code <= 0xffef);
}

function wrapPdfLine(line) {
  if (!line) return [];
  const chunks = [];
  let buffer = "";
  let width = 0;
  for (const char of line) {
    const charWidth = isCjkChar(char) ? 2 : 1;
    if (width + charWidth > PDF_MAX_LINE_LEN_ASCII) {
      if (buffer) chunks.push(buffer);
      buffer = char;
      width = charWidth;
    } else {
      buffer += char;
      width += charWidth;
    }
    if (buffer.length >= PDF_MAX_LINE_LEN_CJK && isCjkChar(char) && width >= PDF_MAX_LINE_LEN_ASCII - 1) {
      chunks.push(buffer);
      buffer = "";
      width = 0;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'）)】」』]+/g;

function linesForPdf(model) {
  const text = stripMarkdownInlineSyntax(getPlainText(model)).replace(/\r\n?/g, "\n");
  const lines = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    lines.push(...wrapPdfLine(line));
  }
  return lines;
}

function escapePdfTextLiteral(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function collectUrlsFromLines(lines) {
  const matches = [];
  lines.forEach((line, lineIndex) => {
    const found = line.match(URL_PATTERN);
    if (found) {
      for (const url of found) {
        matches.push({ url, lineIndex });
      }
    }
  });
  return matches;
}

function buildPdfBytes(model, title) {
  const allLines = linesForPdf(model);
  const pages = [];
  if (allLines.length === 0) {
    pages.push([]);
  } else {
    for (let offset = 0; offset < allLines.length; offset += 42) {
      pages.push(allLines.slice(offset, offset + 42));
    }
  }
  const pageAnnotCounts = pages.map((lines) => collectUrlsFromLines(lines).length);
  let cursor = 3;
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  const annotObjectNumbers = [];
  pages.forEach((_, index) => {
    pageObjectNumbers.push(cursor++);
    contentObjectNumbers.push(cursor++);
    const annotsForPage = [];
    for (let annotIndex = 0; annotIndex < pageAnnotCounts[index]; annotIndex += 1) {
      annotsForPage.push(cursor++);
    }
    annotObjectNumbers.push(annotsForPage);
  });
  const fontObjectNumber = cursor++;
  const cidFontObjectNumber = cursor++;
  const fontDescriptorObjectNumber = cursor++;
  const infoObjectNumber = cursor++;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  const annotObjectsToAppend = [];

  pages.forEach((lines, index) => {
    const content = [
      "BT",
      "/F1 12 Tf",
      "72 760 Td",
      "16 TL",
      ...lines.map((line) => `<${utf16BeHex(line)}> Tj T*`),
      "ET",
    ].join("\n");
    const annotIds = annotObjectNumbers[index];
    const annotsRefs = annotIds.length > 0
      ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(" ")}]`
      : "";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >>${annotsRefs} /Contents ${contentObjectNumbers[index]} 0 R >>`);
    objects.push(`<< /Length ${textToBytes(content).length} >>\nstream\n${content}\nendstream`);
    const urls = collectUrlsFromLines(lines);
    urls.forEach(({ url, lineIndex }) => {
      const y = 760 - lineIndex * 16;
      const rect = `[72 ${y - 4} 540 ${y + 12}]`;
      annotObjectsToAppend.push(`<< /Type /Annot /Subtype /Link /Rect ${rect} /Border [0 0 0] /A << /Type /Action /S /URI /URI (${escapePdfTextLiteral(url)}) >> >>`);
    });
  });

  objects.push(...annotObjectsToAppend);

  objects.push(`<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${cidFontObjectNumber} 0 R] >>`);
  objects.push(`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /FontDescriptor ${fontDescriptorObjectNumber} 0 R /DW 1000 >>`);
  objects.push("<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -120 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>");
  objects.push(`<< /Title ${pdfUnicodeString(title)} /Producer (Trans2Former) >>`);
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(textToBytes(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = textToBytes(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjectNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return textToBytes(output);
}

// PDF 输出双路：优先使用高保真路径（FixedLayoutModel），回落到程序化路径（SemanticDoc）
export function writePdfBinary({ model, title = model.title }) {
  // 如果模型包含 FixedLayoutModel，使用高保真输出
  if (model.fixedLayout && model.fixedLayout.pages && model.fixedLayout.pages.length > 0) {
    try {
      return writePdfHighFidelity({ model, title });
    } catch (error) {
      // 高保真输出失败，回落到程序化输出
      console.warn("[pdf-output] High-fidelity output failed, falling back to programmatic output:", error.message);
    }
  }

  // 程序化输出（SemanticDoc → 重新排版）
  const bytes = buildPdfBytes(model, title);
  return {
    type: "binary",
    format: "pdf",
    data: bytesToDataUrl(bytes, "application/pdf"),
    mime: "application/pdf",
  };
}
