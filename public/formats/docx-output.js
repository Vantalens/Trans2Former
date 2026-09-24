import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { escapeXmlText } from "./text-utils.js";
import { getCellInlineTokens, getInlineTokens, parseInlineMarkdown } from "./inline-tokens.js";
import { createWarning } from "../core/warnings.js";

const NS = "http" + "://schemas.openxmlformats.org";
const DC_NS = "http" + "://purl.org/dc/elements/1.1/";
const REL_NS = "http" + "://schemas.openxmlformats.org/officeDocument/2006/relationships";

// 把 inline tokens（semantic-inlines 形态）展平为 docx 风格的 run 描述：
// 每个 run 自己带样式标志（bold/italic/strike/code/link），嵌套通过父层 OR 子层
// 的并集表达，例如 strong(em(text)) → run{ bold:true, italic:true }。
function flattenInlines(tokens, parentStyle = {}, hyperlinkHref = "") {
  const runs = [];
  for (const node of tokens || []) {
    if (!node || typeof node !== "object") continue;
    if (node.type === "text") {
      if (node.value) runs.push({ text: node.value, style: parentStyle, hyperlinkHref });
      continue;
    }
    if (node.type === "code") {
      runs.push({ text: node.value || "", style: { ...parentStyle, code: true }, hyperlinkHref });
      continue;
    }
    if (node.type === "linebreak") {
      runs.push({ lineBreak: true, style: parentStyle, hyperlinkHref });
      continue;
    }
    if (node.type === "footnoteRef") {
      // DOCX 无原生脚注引用渲染，用 [id] 上标样式占位
      runs.push({ text: `[${node.id || ""}]`, style: { ...parentStyle, superscript: true }, hyperlinkHref });
      continue;
    }
    if (node.type === "strong") {
      runs.push(...flattenInlines(node.inlines, { ...parentStyle, bold: true }, hyperlinkHref));
      continue;
    }
    if (node.type === "em") {
      runs.push(...flattenInlines(node.inlines, { ...parentStyle, italic: true }, hyperlinkHref));
      continue;
    }
    if (node.type === "del") {
      runs.push(...flattenInlines(node.inlines, { ...parentStyle, strike: true }, hyperlinkHref));
      continue;
    }
    if (node.type === "link") {
      runs.push(...flattenInlines(node.inlines, { ...parentStyle, link: true }, node.href || ""));
      continue;
    }
    if (Array.isArray(node.inlines)) {
      runs.push(...flattenInlines(node.inlines, parentStyle, hyperlinkHref));
    }
  }
  return runs;
}

function runPropertiesXml(style) {
  const parts = [];
  if (style.bold) parts.push("<w:b/>");
  if (style.italic) parts.push("<w:i/>");
  if (style.strike) parts.push("<w:strike/>");
  if (style.superscript) parts.push('<w:vertAlign w:val="superscript"/>');
  if (style.code) parts.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>');
  if (style.link) parts.push('<w:color w:val="0563C1"/><w:u w:val="single"/>');
  return parts.length > 0 ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

function textToWordXml(value) {
  return String(value || "").replace(/\r\n?/g, "\n").split(/([\t\n])/).map((part) => {
    if (part === "\t") return "<w:tab/>";
    if (part === "\n") return "<w:br/>";
    return part ? `<w:t xml:space="preserve">${escapeXmlText(part)}</w:t>` : "";
  }).join("");
}

function renderRun(run, hyperlinks) {
  if (run.lineBreak) return `<w:r>${runPropertiesXml(run.style || {})}<w:br/></w:r>`;
  const rPr = runPropertiesXml(run.style || {});
  const text = textToWordXml(run.text);
  const baseRun = `<w:r>${rPr}${text}</w:r>`;
  if (run.hyperlinkHref) {
    const rId = hyperlinks.register(run.hyperlinkHref);
    return `<w:hyperlink r:id="${rId}">${baseRun}</w:hyperlink>`;
  }
  return baseRun;
}

function runsFromInlineTokens(tokens, hyperlinks) {
  const runs = flattenInlines(tokens);
  if (runs.length === 0) {
    return [`<w:r><w:t xml:space="preserve"></w:t></w:r>`];
  }
  return runs.map((run) => renderRun(run, hyperlinks));
}

function runsFromBlock(block, hyperlinks) {
  return runsFromInlineTokens(getInlineTokens(block), hyperlinks);
}

function runsFromCell(cell, hyperlinks) {
  return runsFromInlineTokens(getCellInlineTokens(cell), hyperlinks);
}

function runsFromPlainText(text, hyperlinks) {
  return runsFromInlineTokens(parseInlineMarkdown(text), hyperlinks);
}

function paragraphFromRuns(runs, opts = {}) {
  const pPr = opts.pPr ? `      ${opts.pPr}\n` : "";
  return [
    "    <w:p>",
    pPr ? pPr.trimEnd() : "",
    `      ${runs.join("")}`,
    "    </w:p>",
  ].filter(Boolean).join("\n");
}

function paragraphFormatProperties(format) {
  if (!format || typeof format !== "object") return "";
  const tabs = (Array.isArray(format.tabStops) ? format.tabStops : []).filter((tab) => Number.isSafeInteger(tab?.position) && tab.position > 0);
  const tabProperties = tabs.length > 0
    ? `<w:tabs>${tabs.map((tab) => {
      const alignment = ["clear", "left", "center", "right", "decimal", "bar", "num"].includes(tab.alignment) ? tab.alignment : "left";
      const leader = ["none", "dot", "hyphen", "underscore", "heavy", "middleDot"].includes(tab.leader) ? ` w:leader="${tab.leader}"` : "";
      return `<w:tab w:val="${alignment}" w:pos="${tab.position}"${leader}/>`;
    }).join("")}</w:tabs>`
    : "";
  const spacingAttributes = [["spacingBefore", "before"], ["spacingAfter", "after"], ["lineSpacing", "line"]]
    .filter(([key]) => Number.isSafeInteger(format[key]) && format[key] >= 0);
  const spacingProperties = spacingAttributes.length > 0
    ? `<w:spacing ${spacingAttributes.map(([key, attr]) => `w:${attr}="${format[key]}"`).join(" ")}/>`
    : "";
  const indentAttributes = [
    ["indentLeft", "left"], ["indentRight", "right"],
    ["firstLineIndent", "firstLine"], ["hangingIndent", "hanging"],
  ].filter(([key]) => Number.isSafeInteger(format[key]));
  const indentProperties = indentAttributes.length > 0
    ? `<w:ind ${indentAttributes.map(([key, attr]) => `w:${attr}="${format[key]}"`).join(" ")}/>`
    : "";
  const alignments = { left: "left", center: "center", right: "right", justify: "both" };
  const alignmentProperties = alignments[format.alignment] ? `<w:jc w:val="${alignments[format.alignment]}"/>` : "";
  return `${tabProperties}${spacingProperties}${indentProperties}${alignmentProperties}`;
}

// ECMA-376 中 sectPr 是 pPr 内靠后的子元素：节页面设置追加在段落属性末尾。
function mergeParagraphProperties(base, format, sectionLayout) {
  const extra = paragraphFormatProperties(format);
  const sectionXml = sectionLayout ? sectionPropertiesXml(sectionLayout) : "";
  if (!extra && !sectionXml) return base || "";
  const inner = String(base || "").replace(/^\s*<w:pPr\b[^>]*>/, "").replace(/<\/w:pPr>\s*$/, "");
  return `<w:pPr>${inner}${extra}${sectionXml}</w:pPr>`;
}

function paragraphBlock(block, hyperlinks, opts = {}) {
  return paragraphFromRuns(runsFromBlock(block, hyperlinks), {
    ...opts,
    pPr: mergeParagraphProperties(opts.pPr, block.paragraphFormat, block.sectionBreak?.pageLayout),
  });
}

function paragraphFromText(text, hyperlinks, opts = {}) {
  return paragraphFromRuns(runsFromPlainText(text, hyperlinks), opts);
}

function heading(block, hyperlinks) {
  return paragraphBlock(block, hyperlinks, {
    pPr: `<w:pPr><w:pStyle w:val="Heading${block.level}"/></w:pPr>`,
  });
}

function listItem(item, depth, ordered, hyperlinks, itemInlines) {
  const numId = ordered ? 1 : 2;
  const pPr = `<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(8, Math.max(0, depth))}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
  // 如果 reader 给了 itemInlines（如 html→docx），优先用结构化 inline 节点
  if (Array.isArray(itemInlines) && itemInlines.length > 0) {
    return paragraphFromRuns(runsFromInlineTokens(itemInlines, hyperlinks), { pPr });
  }
  return paragraphFromText(item, hyperlinks, { pPr });
}

function table(block, hyperlinks) {
  const rows = [block.headers, ...(block.rows || [])];
  const cellSpans = Array.isArray(block.cellSpans) ? block.cellSpans : [];
  const columnCount = Math.max(1, Array.isArray(block.columnWidths) ? block.columnWidths.length : 0, ...rows.map((row, rowIndex) =>
    row.reduce((count, _cell, cellIndex) => count + (Number.isSafeInteger(cellSpans[rowIndex]?.[cellIndex]?.columnSpan) && cellSpans[rowIndex][cellIndex].columnSpan > 0 ? cellSpans[rowIndex][cellIndex].columnSpan : 1), 0)
  ));
  const sourceWidths = Array.isArray(block.columnWidths)
    && block.columnWidths.length === columnCount
    && block.columnWidths.every((width) => Number.isSafeInteger(width) && width > 0)
    ? block.columnWidths
    : null;
  const fallbackWidth = Math.max(1200, Math.floor(9000 / columnCount));
  const columnWidths = sourceWidths || Array.from({ length: columnCount }, () => fallbackWidth);
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const rowXml = rows.map((row, rowIndex) => [
    "      <w:tr>",
    ...row.map((cell, cellIndex) => {
      const spanInfo = cellSpans[rowIndex]?.[cellIndex] || {};
      const columnSpan = Number.isSafeInteger(spanInfo.columnSpan) && spanInfo.columnSpan > 0 ? spanInfo.columnSpan : 1;
      const columnIndex = row.slice(0, cellIndex).reduce((count, _value, index) => {
        const priorSpan = cellSpans[rowIndex]?.[index]?.columnSpan;
        return count + (Number.isSafeInteger(priorSpan) && priorSpan > 0 ? priorSpan : 1);
      }, 0);
      const cellWidth = columnWidths.slice(columnIndex, columnIndex + columnSpan).reduce((sum, width) => sum + width, 0) || fallbackWidth * columnSpan;
      const cellRuns = runsFromCell(cell, hyperlinks).join("");
      const boldHeader = rowIndex === 0 ? '<w:pPr><w:rPr><w:b/></w:rPr></w:pPr>' : "";
      const mergeXml = [
        ...(columnSpan > 1 ? [`<w:gridSpan w:val="${columnSpan}"/>`] : []),
        ...(spanInfo.verticalMerge === "restart" ? ['<w:vMerge w:val="restart"/>'] : spanInfo.verticalMerge === "continue" ? ["<w:vMerge/>"] : []),
      ].join("");
      return [
        "        <w:tc>",
        `          <w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/>${mergeXml}</w:tcPr>`,
        `          <w:p>${boldHeader}${cellRuns}</w:p>`,
        "        </w:tc>",
      ].join("\n");
    }),
    "      </w:tr>",
  ].join("\n")).join("\n");
  return [
    "    <w:tbl>",
    "      <w:tblPr>",
    `        <w:tblW w:w="${tableWidth}" w:type="dxa"/>`,
    '        <w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>',
    "      </w:tblPr>",
    `      <w:tblGrid>${columnWidths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`,
    rowXml,
    "    </w:tbl>",
  ].join("\n");
}

function codeParagraph(block) {
  const lines = String(block.code ?? "").replace(/\r\n?/g, "\n").split("\n");
  const runs = lines.map((line, index) => {
    const breaks = index < lines.length - 1 ? "<w:br/>" : "";
    return `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/></w:rPr>${textToWordXml(line)}${breaks}</w:r>`;
  }).join("");
  return [
    "    <w:p>",
    '      <w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>',
    `      ${runs}`,
    "    </w:p>",
  ].join("\n");
}

function quoteParagraph(block, hyperlinks) {
  return paragraphBlock(block, hyperlinks, {
    pPr: '<w:pPr><w:pStyle w:val="Quote"/></w:pPr>',
  });
}

function blockToWordXml(block, hyperlinks) {
  if (block.type === "heading") return heading(block, hyperlinks);
  if (block.type === "paragraph") return paragraphBlock(block, hyperlinks);
  if (block.type === "quote") return quoteParagraph(block, hyperlinks);
  if (block.type === "list") {
    return (block.items || []).map((item, index) => {
      const depth = Math.max(0, Number(block.itemMeta?.[index]?.depth) || 0);
      const itemInlines = Array.isArray(block.itemInlines) ? block.itemInlines[index] : null;
      return listItem(item, depth, Boolean(block.ordered), hyperlinks, itemInlines);
    }).join("\n");
  }
  if (block.type === "code") return codeParagraph(block);
  if (block.type === "table") return table(block, hyperlinks);
  if (block.type === "image") return paragraphFromText(block.alt || block.title || block.src, hyperlinks);
  if (block.type === "asset") return paragraphFromText(block.alt || block.title || block.assetId, hyperlinks);
  if (block.type === "raw") return paragraphFromText(block.content, hyperlinks);
  return "";
}

function createHyperlinkRegistry() {
  const map = new Map();
  let nextId = 100;
  return {
    register(target) {
      const key = String(target || "");
      if (!key) return "rId0";
      if (!map.has(key)) {
        map.set(key, `rId${nextId}`);
        nextId += 1;
      }
      return map.get(key);
    },
    entries() {
      return [...map.entries()];
    },
  };
}

function buildRelationships(hyperlinks) {
  // styles / numbering 是 document.xml 必需的关系；缺这两条 Word 会拒绝渲染样式。
  const fixedRels = [
    `  <Relationship Id="rIdStyles" Type="${REL_NS}/styles" Target="styles.xml"/>`,
    `  <Relationship Id="rIdNumbering" Type="${REL_NS}/numbering" Target="numbering.xml"/>`,
  ];
  const linkRels = hyperlinks.entries().map(([target, rId]) =>
    `  <Relationship Id="${rId}" Type="${REL_NS}/hyperlink" Target="${escapeXmlText(target)}" TargetMode="External"/>`
  );
  const allRels = [...fixedRels, ...linkRels].join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">
${allRels}
</Relationships>`;
}

// 单个节的 sectPr 构造：body 末尾节与段落级 sectionBreak 共用同一份页面设置序列化。
function sectionPropertiesXml(pageLayout = {}) {
  const dimension = (value, fallback) => Number.isSafeInteger(value) && value > 0 ? value : fallback;
  const margin = (value, fallback) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  const pageWidth = dimension(pageLayout.width, 11906);
  const pageHeight = dimension(pageLayout.height, 16838);
  const orientation = ["portrait", "landscape"].includes(pageLayout.orientation)
    ? pageLayout.orientation
    : pageWidth > pageHeight ? "landscape" : "portrait";
  const pageMargins = [
    ["top", "marginTop", 1440], ["right", "marginRight", 1440],
    ["bottom", "marginBottom", 1440], ["left", "marginLeft", 1440],
    ["header", "headerDistance", 720], ["footer", "footerDistance", 720],
    ["gutter", "gutter", 0],
  ].map(([attribute, key, fallback]) => `w:${attribute}="${margin(pageLayout[key], fallback)}"`).join(" ");
  return `<w:sectPr><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}" w:orient="${orientation}"/><w:pgMar ${pageMargins}/></w:sectPr>`;
}

export function writeDocx({ model, title = model.title }) {
  const warnings = [];
  if (model.sourceFormat === "pdf") {
    warnings.push(createWarning("lossy", "DOCX_PDF_LAYOUT_APPROXIMATED", "PDF coordinates and visual styling were converted to editable DOCX flow; exact page positions, fonts, and pagination are not preserved."));
  }
  if (model.sourceFormat === "docx" || model.metadata?.ooxml?.pageLayout) {
    warnings.push(createWarning("lossy", "DOCX_LAYOUT_PARTIAL", "Page geometry, paragraph alignment/indent/tabs, and supported table widths/merges are preserved; themes, exact fonts, borders, cell padding, floating objects, and pagination are regenerated or omitted."));
  }
  const hyperlinks = createHyperlinkRegistry();
  const bodyXml = model.blocks.map((block) => blockToWordXml(block, hyperlinks)).join("\n");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS}/wordprocessingml/2006/main" xmlns:r="${REL_NS}">
  <w:body>
${bodyXml}
    ${sectionPropertiesXml(model.metadata?.ooxml?.pageLayout || {})}
  </w:body>
</w:document>`;
  const zipBytes = writeStoredZip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="${NS}/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">
  <Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="${NS}/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="${NS}/package/2006/metadata/core-properties" xmlns:dc="${DC_NS}"><dc:title>${escapeXmlText(title)}</dc:title></cp:coreProperties>`,
    },
    {
      name: "word/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${NS}/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:i/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/></w:rPr></w:style>
</w:styles>`,
    },
    {
      name: "word/numbering.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${NS}/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%3."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
    <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      data: buildRelationships(hyperlinks),
    },
    { name: "word/document.xml", data: textToBytes(documentXml) },
  ]);
  return {
    type: "binary",
    format: "docx",
    data: bytesToDataUrl(zipBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
