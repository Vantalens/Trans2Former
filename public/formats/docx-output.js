import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { escapeHtml } from "./text-utils.js";

const NS = "http" + "://schemas.openxmlformats.org";
const DC_NS = "http" + "://purl.org/dc/elements/1.1/";
const REL_NS = "http" + "://schemas.openxmlformats.org/officeDocument/2006/relationships";

const INLINE_PATTERN = /(!\[[^\]]*\]\([^)]*\))|(\[[^\]]+\]\([^)]*\))|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(~~[\s\S]+?~~)|(`[^`]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)/;

function parseInlineMarkdown(text) {
  const tokens = [];
  let remainder = String(text ?? "");
  while (remainder.length > 0) {
    const match = remainder.match(INLINE_PATTERN);
    if (!match) {
      tokens.push({ kind: "text", text: remainder });
      break;
    }
    if (match.index > 0) {
      tokens.push({ kind: "text", text: remainder.slice(0, match.index) });
    }
    const piece = match[0];
    if (piece.startsWith("![")) {
      const inner = piece.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
      tokens.push({ kind: "text", text: inner?.[1] || "" });
    } else if (piece.startsWith("[")) {
      const inner = piece.match(/^\[([^\]]+)\]\(([^)]*)\)$/);
      tokens.push({ kind: "link", text: inner?.[1] || "", href: inner?.[2] || "" });
    } else if (piece.startsWith("**") || piece.startsWith("__")) {
      tokens.push({ kind: "bold", text: piece.slice(2, -2) });
    } else if (piece.startsWith("~~")) {
      tokens.push({ kind: "strike", text: piece.slice(2, -2) });
    } else if (piece.startsWith("`")) {
      tokens.push({ kind: "code", text: piece.slice(1, -1) });
    } else {
      tokens.push({ kind: "italic", text: piece.slice(1, -1) });
    }
    remainder = remainder.slice(match.index + piece.length);
  }
  return tokens.filter((token) => token.text !== "");
}

function runProperties(token) {
  const parts = [];
  if (token.kind === "bold") parts.push("<w:b/>");
  if (token.kind === "italic") parts.push("<w:i/>");
  if (token.kind === "strike") parts.push("<w:strike/>");
  if (token.kind === "code") parts.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>');
  if (token.kind === "link") parts.push('<w:color w:val="0563C1"/><w:u w:val="single"/>');
  return parts.length > 0 ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

function tokenToRun(token, { hyperlinks }) {
  const text = `<w:t xml:space="preserve">${escapeHtml(token.text)}</w:t>`;
  const rPr = runProperties(token);
  const run = `<w:r>${rPr}${text}</w:r>`;
  if (token.kind === "link" && token.href) {
    const rId = hyperlinks.register(token.href);
    return `<w:hyperlink r:id="${rId}">${run}</w:hyperlink>`;
  }
  return run;
}

function runsFromText(text, hyperlinks) {
  const tokens = parseInlineMarkdown(text);
  if (tokens.length === 0) {
    return [`<w:r><w:t xml:space="preserve"></w:t></w:r>`];
  }
  return tokens.map((token) => tokenToRun(token, { hyperlinks }));
}

function paragraph(text, hyperlinks, opts = {}) {
  const runs = runsFromText(text, hyperlinks);
  const pPr = opts.pPr ? `      ${opts.pPr}\n` : "";
  return [
    "    <w:p>",
    pPr ? pPr.trimEnd() : "",
    `      ${runs.join("")}`,
    "    </w:p>",
  ].filter(Boolean).join("\n");
}

function heading(block, hyperlinks) {
  return paragraph(block.text, hyperlinks, {
    pPr: `<w:pPr><w:pStyle w:val="Heading${block.level}"/></w:pPr>`,
  });
}

function listItem(item, depth, ordered, hyperlinks) {
  const numId = ordered ? 1 : 2;
  const pPr = `<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(8, Math.max(0, depth))}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
  return paragraph(item, hyperlinks, { pPr });
}

function table(block, hyperlinks) {
  const rows = [block.headers, ...(block.rows || [])];
  const columnCount = Math.max(1, block.headers?.length || 1);
  const columnWidth = Math.max(1200, Math.floor(9000 / columnCount));
  const rowXml = rows.map((row, rowIndex) => [
    "      <w:tr>",
    ...row.map((cell) => {
      const cellRuns = runsFromText(String(cell ?? ""), hyperlinks).join("");
      const boldHeader = rowIndex === 0 ? '<w:pPr><w:rPr><w:b/></w:rPr></w:pPr>' : "";
      return [
        "        <w:tc>",
        `          <w:tcPr><w:tcW w:w="${columnWidth}" w:type="dxa"/></w:tcPr>`,
        `          <w:p>${boldHeader}${cellRuns}</w:p>`,
        "        </w:tc>",
      ].join("\n");
    }),
    "      </w:tr>",
  ].join("\n")).join("\n");
  return [
    "    <w:tbl>",
    "      <w:tblPr>",
    '        <w:tblW w:w="9000" w:type="dxa"/>',
    '        <w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>',
    "      </w:tblPr>",
    rowXml,
    "    </w:tbl>",
  ].join("\n");
}

function codeParagraph(block) {
  const lines = String(block.code ?? "").replace(/\r\n?/g, "\n").split("\n");
  const runs = lines.map((line, index) => {
    const breaks = index < lines.length - 1 ? "<w:br/>" : "";
    return `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/></w:rPr><w:t xml:space="preserve">${escapeHtml(line)}</w:t>${breaks}</w:r>`;
  }).join("");
  return [
    "    <w:p>",
    '      <w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>',
    `      ${runs}`,
    "    </w:p>",
  ].join("\n");
}

function quoteParagraph(block, hyperlinks) {
  return paragraph(block.text, hyperlinks, {
    pPr: '<w:pPr><w:pStyle w:val="Quote"/></w:pPr>',
  });
}

function blockToWordXml(block, hyperlinks) {
  if (block.type === "heading") return heading(block, hyperlinks);
  if (block.type === "paragraph") return paragraph(block.text, hyperlinks);
  if (block.type === "quote") return quoteParagraph(block, hyperlinks);
  if (block.type === "list") {
    return (block.items || []).map((item, index) => {
      const depth = Math.max(0, Number(block.itemMeta?.[index]?.depth) || 0);
      return listItem(item, depth, Boolean(block.ordered), hyperlinks);
    }).join("\n");
  }
  if (block.type === "code") return codeParagraph(block);
  if (block.type === "table") return table(block, hyperlinks);
  if (block.type === "image") return paragraph(block.alt || block.title || block.src, hyperlinks);
  if (block.type === "asset") return paragraph(block.alt || block.title || block.assetId, hyperlinks);
  if (block.type === "raw") return paragraph(block.content, hyperlinks);
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
  const entries = hyperlinks.entries();
  const linkRels = entries.map(([target, rId]) =>
    `  <Relationship Id="${rId}" Type="${REL_NS}/hyperlink" Target="${escapeHtml(target)}" TargetMode="External"/>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">${linkRels ? "\n" + linkRels : ""}
</Relationships>`;
}

export function writeDocx({ model, title = model.title }) {
  const hyperlinks = createHyperlinkRegistry();
  const bodyXml = model.blocks.map((block) => blockToWordXml(block, hyperlinks)).join("\n");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS}/wordprocessingml/2006/main" xmlns:r="${REL_NS}">
  <w:body>
${bodyXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
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
<cp:coreProperties xmlns:cp="${NS}/package/2006/metadata/core-properties" xmlns:dc="${DC_NS}"><dc:title>${escapeHtml(title)}</dc:title></cp:coreProperties>`,
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
  };
}
