// 高保真 PDF 输出：直接消费 FixedLayoutModel，保留原始坐标、字体、尺寸。
// 与 pdf-output.js 的程序化输出不同，这里不做重新排版，而是按 textRun.bbox 精确
// 定位每个文本片段，保留原始视觉布局。
//
// 适用场景：PDF → PDF round-trip、OFD → PDF 高保真转换。

import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";

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

// 从 FixedLayoutModel 构建高保真 PDF
function buildHighFidelityPdfBytes(fixedLayout, title) {
  const pages = fixedLayout?.pages || [];
  if (pages.length === 0) {
    throw new Error("FixedLayoutModel has no pages");
  }

  const objects = ["", ""];
  const fontObjectNumber = objects.length + 1;
  const cidFontObjectNumber = fontObjectNumber + 1;
  const fontDescriptorObjectNumber = fontObjectNumber + 2;
  const pageObjectNumbers = [];

  objects.push(
    `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${cidFontObjectNumber} 0 R] >>`
  );
  objects.push(
    `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /FontDescriptor ${fontDescriptorObjectNumber} 0 R /DW 1000 >>`
  );
  objects.push(
    "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -120 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>"
  );

  pages.forEach((page) => {
    const width = page.size?.width || 612;
    const height = page.size?.height || 792;

    const contentLines = ["BT"];

    for (const run of page.textRuns || []) {
      if (!run.text || !run.bbox) continue;

      const fontSize = run.fontSize || 12;
      const x = run.bbox.x || 0;
      const y = run.bbox.y || 0;

      contentLines.push(`/F1 ${fontSize} Tf`);
      contentLines.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
      contentLines.push(`<${utf16BeHex(run.text)}> Tj`);
    }

    contentLines.push("ET");
    const content = contentLines.join("\n");
    const contentObjectNumber = objects.length + 1;
    objects.push(`<< /Length ${textToBytes(content).length} >>\nstream\n${content}\nendstream`);

    const annotRefs = [];
    (page.annotations || []).forEach((annot) => {
      if (annot.type === "link" && annot.bbox && annot.target) {
        const annotObjectNumber = objects.length + 1;
        const rect = [
          annot.bbox.x || 0,
          annot.bbox.y || 0,
          (annot.bbox.x || 0) + (annot.bbox.w || 0),
          (annot.bbox.y || 0) + (annot.bbox.h || 0),
        ];
        objects.push(
          `<< /Type /Annot /Subtype /Link /Rect [${rect.map((v) => v.toFixed(2)).join(" ")}] /Border [0 0 0] /A << /S /URI /URI (${escapePdfText(annot.target)}) >> >>`
        );
        annotRefs.push(`${annotObjectNumber} 0 R`);
      }
    });

    const annotsField = annotRefs.length > 0 ? ` /Annots [${annotRefs.join(" ")}]` : "";
    const pageObjectNumber = objects.length + 1;
    pageObjectNumbers.push(pageObjectNumber);

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R${annotsField} >>`
    );
  });

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  const infoObjectNumber = objects.length + 1;
  objects.push(`<< /Title ${pdfUnicodeString(title)} /Producer (Trans2Former High-Fidelity) >>`);

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

// 高保真 PDF 输出入口
export function writePdfHighFidelity({ model, title = model.title }) {
  if (!model.fixedLayout || !model.fixedLayout.pages || model.fixedLayout.pages.length === 0) {
    throw new Error("Model does not contain FixedLayoutModel data for high-fidelity PDF output");
  }

  const bytes = buildHighFidelityPdfBytes(model.fixedLayout, title);
  return {
    type: "binary",
    format: "pdf",
    data: bytesToDataUrl(bytes, "application/pdf"),
    mime: "application/pdf",
  };
}
