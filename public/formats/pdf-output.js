import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { writePdfHighFidelity } from "./pdf-output-high-fidelity.js";
import { getCellInlineTokens, getInlineTokens } from "./inline-tokens.js";

// 程序化 PDF 输出：保留 block 结构与 inline 样式。
// 不嵌入额外字体，只用 STSong-Light（CJK + ASCII 都能渲染），通过：
//   - 字号变化区分 heading / paragraph / code
//   - Text render mode 2（fill + stroke）模拟粗体
//   - 蓝色 + 下划线 + URL annotation 表达链接
//   - 左缩进表达 quote / code / list
// 来还原视觉层级。

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

function escapePdfTextLiteral(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 72;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// 每字符约占 fontSize * factor 的水平空间。CJK ≈ 1.0，ASCII ≈ 0.5。
function charAdvance(char, fontSize) {
  const code = char.codePointAt(0);
  const isWide = (code >= 0x3000 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0xff00 && code <= 0xffef);
  return fontSize * (isWide ? 1.0 : 0.5);
}

// 把一组 inline segments wrap 成多行，每行仍是 segments 数组并附带宽度。
// segment 形态: { text, style, href? }，style: { bold, italic, code, link, strike }
function wrapSegments(segments, fontSize, maxWidth) {
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  function pushSegment(text, style, href) {
    if (!text) return;
    let buffer = "";
    let bufferWidth = 0;
    for (const char of text) {
      if (char === "\n") {
        if (buffer) {
          currentLine.push({ text: buffer, style, href, width: bufferWidth });
          currentWidth += bufferWidth;
          buffer = "";
          bufferWidth = 0;
        }
        lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
        continue;
      }
      const advance = charAdvance(char, fontSize);
      if (currentWidth + bufferWidth + advance > maxWidth && (currentLine.length > 0 || buffer.length > 0)) {
        if (buffer) {
          currentLine.push({ text: buffer, style, href, width: bufferWidth });
          buffer = "";
          bufferWidth = 0;
        }
        lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
      }
      buffer += char;
      bufferWidth += advance;
    }
    if (buffer) {
      currentLine.push({ text: buffer, style, href, width: bufferWidth });
      currentWidth += bufferWidth;
    }
  }

  for (const segment of segments) {
    pushSegment(segment.text, segment.style, segment.href);
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}

// 把 segment 里的纯文本 URL 自动切成 link segment，方便程序化 PDF 输出生成 annotation。
const URL_PATTERN = /(https?:\/\/[^\s<>"'()]+)/g;
function autoLinkifySegments(segments) {
  const result = [];
  for (const seg of segments) {
    if (!seg || !seg.text || (seg.style && seg.style.link) || (seg.style && seg.style.code)) {
      result.push(seg);
      continue;
    }
    const parts = seg.text.split(URL_PATTERN);
    if (parts.length === 1) {
      result.push(seg);
      continue;
    }
    for (const part of parts) {
      if (!part) continue;
      if (URL_PATTERN.test(part)) {
        URL_PATTERN.lastIndex = 0;
        result.push({ text: part, style: { ...(seg.style || {}), link: true }, href: part });
      } else {
        result.push({ text: part, style: seg.style, href: seg.href || "" });
      }
    }
  }
  return result;
}

// 把 inline tokens 展平为 segments（{text, style, href?}）。
function flattenInlinesToSegments(tokens, parentStyle = {}, hrefStack = []) {
  const segments = [];
  for (const node of tokens || []) {
    if (!node || typeof node !== "object") continue;
    if (node.type === "text") {
      if (node.value) segments.push({ text: node.value, style: parentStyle, href: hrefStack[hrefStack.length - 1] || "" });
      continue;
    }
    if (node.type === "code") {
      segments.push({ text: node.value || "", style: { ...parentStyle, code: true }, href: hrefStack[hrefStack.length - 1] || "" });
      continue;
    }
    if (node.type === "linebreak") {
      segments.push({ text: "\n", style: parentStyle, href: "" });
      continue;
    }
    if (node.type === "footnoteRef") {
      // PDF 无原生 sup，用上标括号 [id] 表达
      segments.push({ text: `[${node.id || ""}]`, style: { ...parentStyle, link: true }, href: `#fn-${node.id || ""}` });
      continue;
    }
    if (node.type === "strong") {
      segments.push(...flattenInlinesToSegments(node.inlines, { ...parentStyle, bold: true }, hrefStack));
      continue;
    }
    if (node.type === "em") {
      segments.push(...flattenInlinesToSegments(node.inlines, { ...parentStyle, italic: true }, hrefStack));
      continue;
    }
    if (node.type === "del") {
      segments.push(...flattenInlinesToSegments(node.inlines, { ...parentStyle, strike: true }, hrefStack));
      continue;
    }
    if (node.type === "link") {
      segments.push(...flattenInlinesToSegments(node.inlines, { ...parentStyle, link: true }, [...hrefStack, node.href || ""]));
      continue;
    }
    if (Array.isArray(node.inlines)) {
      segments.push(...flattenInlinesToSegments(node.inlines, parentStyle, hrefStack));
    }
  }
  return segments;
}

// 按 block 计算字号 / 缩进 / 段后间距。
function blockLayout(block) {
  if (block.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(block.level) || 1));
    const sizes = [22, 18, 16, 14, 13, 12];
    return { fontSize: sizes[level - 1], leading: sizes[level - 1] * 1.4, indent: 0, marginBottom: 8, forceBold: true };
  }
  if (block.type === "quote") {
    return { fontSize: 12, leading: 18, indent: 24, marginBottom: 6, forceItalic: true };
  }
  if (block.type === "code") {
    return { fontSize: 11, leading: 15, indent: 24, marginBottom: 6, allCode: true };
  }
  return { fontSize: 12, leading: 16, indent: 0, marginBottom: 6 };
}

// 把 block 转成 layout lines：每个 line = { segments, indent, fontSize, leading, isLastInBlock }
function blockToLines(block) {
  const layout = blockLayout(block);
  const maxWidth = CONTENT_WIDTH - layout.indent;

  if (block.type === "code") {
    const text = String(block.code ?? "");
    const codeSegments = text.split("\n").map((line) => [{ text: line, style: { code: true }, href: "" }]);
    return codeSegments.map((segments, i) => ({
      segments,
      indent: layout.indent,
      fontSize: layout.fontSize,
      leading: layout.leading,
      marginAfter: i === codeSegments.length - 1 ? layout.marginBottom : 0,
    }));
  }

  if (block.type === "list") {
    const lines = [];
    (block.items || []).forEach((item, index) => {
      const meta = block.itemMeta?.[index] || {};
      const depth = Math.max(0, Number(meta.depth) || 0);
      const marker = block.ordered ? `${index + 1}. ` : "• ";
      const inlineTokens = Array.isArray(block.itemInlines) ? block.itemInlines[index] : null;
      const segments = inlineTokens && inlineTokens.length > 0
        ? flattenInlinesToSegments(inlineTokens)
        : flattenInlinesToSegments(getInlineTokens({ text: item }));
      const prefixed = [{ text: marker, style: {}, href: "" }, ...segments];
      const indent = layout.indent + depth * 16;
      const wrapped = wrapSegments(prefixed, layout.fontSize, CONTENT_WIDTH - indent);
      wrapped.forEach((lineSegments, idx) => {
        lines.push({
          segments: lineSegments,
          indent,
          fontSize: layout.fontSize,
          leading: layout.leading,
          marginAfter: 0,
        });
        if (idx === wrapped.length - 1) lines[lines.length - 1].marginAfter = 2;
      });
    });
    if (lines.length > 0) lines[lines.length - 1].marginAfter = layout.marginBottom;
    return lines;
  }

  if (block.type === "table") {
    return tableToLines(block);
  }

  // heading / paragraph / quote / image / asset / raw
  let segments;
  if (block.type === "image" || block.type === "asset") {
    const fallback = block.alt || block.title || block.src || block.assetId || "";
    segments = [{ text: `[图片] ${fallback}`, style: { italic: true }, href: "" }];
  } else if (block.type === "raw") {
    segments = [{ text: String(block.content ?? ""), style: {}, href: "" }];
  } else {
    segments = autoLinkifySegments(flattenInlinesToSegments(getInlineTokens(block)));
  }

  // heading 强制全段加粗
  if (layout.forceBold) {
    segments = segments.map((seg) => ({ ...seg, style: { ...seg.style, bold: true } }));
  }
  if (layout.forceItalic) {
    segments = segments.map((seg) => ({ ...seg, style: { ...seg.style, italic: true } }));
  }

  const wrapped = wrapSegments(segments, layout.fontSize, maxWidth);
  if (wrapped.length === 0) return [];
  return wrapped.map((lineSegments, i) => ({
    segments: lineSegments,
    indent: layout.indent,
    fontSize: layout.fontSize,
    leading: layout.leading,
    marginAfter: i === wrapped.length - 1 ? layout.marginBottom : 0,
  }));
}

function tableToLines(block) {
  const headers = block.headers || [];
  const rows = [headers, ...(block.rows || [])];
  if (headers.length === 0) return [];
  const lines = [];
  const fontSize = 11;
  const leading = 15;
  const colWidth = CONTENT_WIDTH / Math.max(1, headers.length);

  rows.forEach((row, rowIndex) => {
    const cellLines = row.map((cell) => {
      const tokens = getCellInlineTokens(cell);
      let segments = flattenInlinesToSegments(tokens);
      if (rowIndex === 0) {
        segments = segments.map((seg) => ({ ...seg, style: { ...seg.style, bold: true } }));
      }
      return wrapSegments(segments, fontSize, colWidth - 8);
    });
    const maxLines = Math.max(1, ...cellLines.map((c) => c.length));
    for (let lineIdx = 0; lineIdx < maxLines; lineIdx += 1) {
      const mergedSegments = [];
      cellLines.forEach((cellWrapped, colIdx) => {
        const lineSegments = cellWrapped[lineIdx] || [];
        const usedWidth = lineSegments.reduce((sum, seg) => sum + seg.width, 0);
        if (lineSegments.length > 0) {
          mergedSegments.push(...lineSegments.map((seg) => ({ ...seg, columnStart: colIdx * colWidth })));
        }
        // 列分隔（简单空格填充，避免实现复杂的 cell box 绘制）
        const pad = Math.max(0, colWidth - usedWidth);
        if (colIdx < cellLines.length - 1) {
          mergedSegments.push({ text: " ".repeat(Math.max(1, Math.floor(pad / (fontSize * 0.5)))), style: {}, href: "", width: pad });
        }
      });
      lines.push({
        segments: mergedSegments,
        indent: 0,
        fontSize,
        leading,
        marginAfter: lineIdx === maxLines - 1 && rowIndex === rows.length - 1 ? 8 : 0,
      });
    }
    if (rowIndex === 0) {
      lines.push({
        segments: [{ text: "─".repeat(Math.floor(CONTENT_WIDTH / (fontSize * 0.5))), style: {}, href: "", width: CONTENT_WIDTH }],
        indent: 0,
        fontSize,
        leading: 6,
        marginAfter: 2,
      });
    }
  });
  return lines;
}

// 收集所有 layout lines，按页切分。
function paginate(allLines) {
  const pages = [];
  let current = [];
  let yCursor = PAGE_HEIGHT - MARGIN_TOP;

  for (const line of allLines) {
    const needed = line.leading + (line.marginAfter || 0);
    if (yCursor - needed < MARGIN_BOTTOM && current.length > 0) {
      pages.push(current);
      current = [];
      yCursor = PAGE_HEIGHT - MARGIN_TOP;
    }
    yCursor -= line.leading;
    current.push({ ...line, y: yCursor });
    yCursor -= line.marginAfter || 0;
  }
  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);
  return pages;
}

// 把一行 layout 生成 PDF content stream 命令，并收集 link annotation。
function renderLine(line) {
  const ops = [];
  const annotations = [];
  let cursorX = MARGIN_LEFT + (line.indent || 0);

  for (const seg of line.segments) {
    if (!seg.text) continue;
    const segWidth = seg.width != null ? seg.width : seg.text.length * line.fontSize * 0.5;
    const style = seg.style || {};

    // 颜色：链接蓝色 / 默认黑色 / strike 用普通色
    ops.push("q"); // save state
    if (style.link) ops.push("0.05 0.4 0.85 rg 0.05 0.4 0.85 RG");
    else ops.push("0 0 0 rg 0 0 0 RG");

    // 粗体：用 text rendering mode 2 (fill + stroke) + 描边宽度
    if (style.bold) ops.push("2 Tr 0.4 w");
    else ops.push("0 Tr");

    // 字号
    ops.push(`BT /F1 ${line.fontSize} Tf ${cursorX} ${line.y} Td <${utf16BeHex(seg.text)}> Tj ET`);

    // 链接下划线
    if (style.link) {
      ops.push(`${cursorX} ${line.y - 2} ${segWidth} 0.6 re f`);
    }
    // 删除线
    if (style.strike) {
      ops.push(`${cursorX} ${line.y + line.fontSize * 0.4} ${segWidth} 0.4 re f`);
    }

    ops.push("Q"); // restore state

    // 链接 annotation
    if (style.link && seg.href) {
      annotations.push({
        href: seg.href,
        rect: [cursorX, line.y - 2, cursorX + segWidth, line.y + line.fontSize],
      });
    }

    cursorX += segWidth;
  }
  return { ops, annotations };
}

function buildPdfBytes(model, title) {
  const allLines = (model.blocks || []).flatMap((block) => blockToLines(block));
  const pages = paginate(allLines);

  let cursor = 3;
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  const annotObjectNumbers = [];
  const annotationsPerPage = [];

  pages.forEach(() => {
    pageObjectNumbers.push(cursor++);
    contentObjectNumbers.push(cursor++);
    annotationsPerPage.push([]);
    annotObjectNumbers.push([]);
  });
  pages.forEach((lines, pageIdx) => {
    lines.forEach((line) => {
      const { annotations } = renderLine(line);
      annotationsPerPage[pageIdx].push(...annotations);
    });
    annotationsPerPage[pageIdx].forEach(() => {
      annotObjectNumbers[pageIdx].push(cursor++);
    });
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

  pages.forEach((lines, pageIdx) => {
    const opsArray = [];
    lines.forEach((line) => {
      const { ops } = renderLine(line);
      opsArray.push(...ops);
    });
    const content = opsArray.join("\n");

    const annotIds = annotObjectNumbers[pageIdx];
    const annotsRefs = annotIds.length > 0
      ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(" ")}]`
      : "";

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >>${annotsRefs} /Contents ${contentObjectNumbers[pageIdx]} 0 R >>`);
    objects.push(`<< /Length ${textToBytes(content).length} >>\nstream\n${content}\nendstream`);

    annotationsPerPage[pageIdx].forEach((annot) => {
      const [x1, y1, x2, y2] = annot.rect;
      annotObjectsToAppend.push(`<< /Type /Annot /Subtype /Link /Rect [${x1} ${y1} ${x2} ${y2}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${escapePdfTextLiteral(annot.href)}) >> >>`);
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
  if (model.fixedLayout && model.fixedLayout.pages && model.fixedLayout.pages.length > 0) {
    try {
      return writePdfHighFidelity({ model, title });
    } catch (error) {
      console.warn("[pdf-output] High-fidelity output failed, falling back to programmatic output:", error.message);
    }
  }

  const bytes = buildPdfBytes(model, title);
  return {
    type: "binary",
    format: "pdf",
    data: bytesToDataUrl(bytes, "application/pdf"),
    mime: "application/pdf",
  };
}
