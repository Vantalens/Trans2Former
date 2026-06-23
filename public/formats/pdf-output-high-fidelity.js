// 高保真 PDF 输出：直接消费 FixedLayoutModel，保留原始坐标、字体、尺寸。
// 与 pdf-output.js 的程序化输出不同，这里不做重新排版，而是按 textRun.bbox 精确
// 定位每个文本片段，保留原始视觉布局。
//
// 适用场景：PDF → PDF round-trip、OFD → PDF 高保真转换。
// issue #105/#106/#107/#108/#111: 统一 CID 字体、annotations 大小写、降级/字替 warning、rotation。

import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { utf16BeHex, pdfUnicodeString, buildCidFontObjects, buildToUnicodeCMap, sanitizeGb1Text } from "./pdf-cid-font.js";
import { createWarning } from "../core/warnings.js";

function escapePdfText(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

// 从 FixedLayoutModel 构建高保真 PDF
// issue #106/#107/#108/#111: annotations 大小写统一、降级/字替 warning、rotation 透传
function buildHighFidelityPdfBytes(fixedLayout, title) {
  const pages = fixedLayout?.pages || [];
  if (pages.length === 0) {
    throw new Error("FixedLayoutModel has no pages");
  }

  const warnings = [];
  const stats = { dropped: new Map(), fontsSubstituted: new Set() };

  // issue #106: 检查未渲染元素
  for (const page of pages) {
    if (page.images && page.images.length > 0) {
      warnings.push(createWarning("lossy", "PDF_HF_IMAGES_DROPPED", "High-fidelity PDF output does not embed images; they were omitted."));
      break;
    }
  }
  for (const page of pages) {
    if (page.signatures && page.signatures.length > 0) {
      warnings.push(createWarning("lossy", "PDF_HF_SIGNATURES_DROPPED", "High-fidelity PDF output does not preserve digital signatures; they were omitted."));
      break;
    }
  }
  for (const page of pages) {
    for (const run of page.textRuns || []) {
      if (run.fontName && !/STSong/i.test(run.fontName)) {
        stats.fontsSubstituted.add(run.fontName);
      }
    }
  }
  if (stats.fontsSubstituted.size > 0) {
    const fonts = Array.from(stats.fontsSubstituted).slice(0, 3).join(", ");
    warnings.push(createWarning("lossy", "PDF_HF_FONT_SUBSTITUTED", `${stats.fontsSubstituted.size} font(s) (e.g. ${fonts}) were substituted with STSong-Light.`));
  }

  const objects = ["", ""];
  const fontObjectNumber = objects.length + 1;
  const cidFontObjectNumber = fontObjectNumber + 1;
  const fontDescriptorObjectNumber = fontObjectNumber + 2;
  const toUnicodeObjectNumber = fontObjectNumber + 3;
  const pageObjectNumbers = [];

  // issue #105/#107: 统一用 buildCidFontObjects
  // 修复：添加 ToUnicode CMap
  const toUnicodeCMap = buildToUnicodeCMap();
  const { type0, cidFont, descriptor } = buildCidFontObjects({
    cidFontRef: `${cidFontObjectNumber} 0 R`,
    descriptorRef: `${fontDescriptorObjectNumber} 0 R`,
    toUnicodeRef: `${toUnicodeObjectNumber} 0 R`,
  });
  objects.push(type0);
  objects.push(cidFont);
  objects.push(descriptor);
  objects.push(`<< /Length ${textToBytes(toUnicodeCMap).length} >>\nstream\n${toUnicodeCMap}\nendstream`);

  pages.forEach((page) => {
    const width = page.size?.width || 612;
    const height = page.size?.height || 792;
    const rotation = page.rotation || 0; // issue #111

    const contentLines = ["BT"];

    for (const run of page.textRuns || []) {
      if (!run.text || !run.bbox) continue;

      // issue #107: 字符降级为 Adobe-GB1 覆盖内字符
      const { text: sanitized, dropped } = sanitizeGb1Text(run.text);
      if (dropped.size > 0) {
        for (const [char, count] of dropped) {
          stats.dropped.set(char, (stats.dropped.get(char) || 0) + count);
        }
      }

      const fontSize = run.fontSize || 12;
      const x = run.bbox.x || 0;
      const y = run.bbox.y || 0;

      contentLines.push(`/F1 ${fontSize} Tf`);
      contentLines.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
      contentLines.push(`<${utf16BeHex(sanitized)}> Tj`);
    }

    contentLines.push("ET");
    const content = contentLines.join("\n");
    const contentObjectNumber = objects.length + 1;
    objects.push(`<< /Length ${textToBytes(content).length} >>\nstream\n${content}\nendstream`);

    const annotRefs = [];
    (page.annotations || []).forEach((annot) => {
      // issue #106: 大小写统一 toLowerCase
      const annotType = String(annot.type || "").toLowerCase();
      if (annotType === "link" && annot.bbox && annot.target) {
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
    // issue #111: 添加 /Rotate
    const rotateField = rotation !== 0 ? ` /Rotate ${rotation}` : "";
    const pageObjectNumber = objects.length + 1;
    pageObjectNumbers.push(pageObjectNumber);

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R${annotsField}${rotateField} >>`
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

  // issue #107: 降级字符 warning
  if (stats.dropped.size > 0) {
    const chars = Array.from(stats.dropped.keys()).slice(0, 10).join("");
    warnings.push(createWarning("lossy", "PDF_CHARSET_UNSUPPORTED_CHARS", `${stats.dropped.size} character(s) not in Adobe-GB1 (e.g. ${chars}) were replaced with □.`));
  }

  return { bytes: textToBytes(output), warnings };
}

// 高保真 PDF 输出入口
export function writePdfHighFidelity({ model, title = model.title }) {
  if (!model.fixedLayout || !model.fixedLayout.pages || model.fixedLayout.pages.length === 0) {
    throw new Error("Model does not contain FixedLayoutModel data for high-fidelity PDF output");
  }

  const { bytes, warnings } = buildHighFidelityPdfBytes(model.fixedLayout, title);
  return {
    type: "binary",
    format: "pdf",
    data: bytesToDataUrl(bytes, "application/pdf"),
    mime: "application/pdf",
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
