import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { getPlainText } from "../core/document-model.js";
import { writePdfHighFidelity } from "./pdf-output-high-fidelity.js";
import { stripMarkdownInlineSyntax } from "./text-utils.js";

function escapePdfText(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

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

function linesForPdf(model) {
  const text = stripMarkdownInlineSyntax(getPlainText(model)).replace(/\r\n?/g, "\n");
  const lines = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const chunks = line.match(/.{1,80}/g) || [line];
    lines.push(...chunks);
  }
  return lines;
}

function buildPdfBytes(model, title) {
  const allLines = linesForPdf(model);
  const pages = [];
  for (let offset = 0; offset < allLines.length || offset === 0; offset += 42) {
    pages.push(allLines.slice(offset, offset + 42));
  }
  const fontObjectNumber = 3 + pages.length * 3;
  const cidFontObjectNumber = fontObjectNumber + 1;
  const fontDescriptorObjectNumber = fontObjectNumber + 2;
  const infoObjectNumber = fontObjectNumber + 3;
  const pageObjectNumbers = pages.map((_, index) => 3 + index * 3);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((lines, index) => {
    const pageObjectNumber = 3 + index * 3;
    const contentObjectNumber = pageObjectNumber + 1;
    const annotationObjectNumber = pageObjectNumber + 2;
    const content = [
      "BT",
      "/F1 12 Tf",
      "72 760 Td",
      "16 TL",
      ...lines.map((line) => `<${utf16BeHex(line)}> Tj T*`),
      "ET",
    ].join("\n");
    const firstLink = lines.join(" ").match(/https?:\/\/[^\s)]+/)?.[0] || "https" + "://example.com";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R /Annots [${annotationObjectNumber} 0 R] >>`);
    objects.push(`<< /Length ${textToBytes(content).length} >>\nstream\n${content}\nendstream`);
    objects.push(`<< /Type /Annot /Subtype /Link /Rect [72 730 260 748] /Border [0 0 0] /A << /S /URI /URI (${escapePdfText(firstLink)}) >> >>`);
  });

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
