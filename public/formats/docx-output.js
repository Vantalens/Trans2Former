import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { escapeHtml, stripMarkdownInlineSyntax } from "./text-utils.js";

const NS = "http" + "://schemas.openxmlformats.org";
const DC_NS = "http" + "://purl.org/dc/elements/1.1/";

function xmlText(value) {
  return escapeHtml(stripMarkdownInlineSyntax(value));
}

function paragraph(text) {
  return [
    "    <w:p>",
    `      <w:r><w:t>${xmlText(text)}</w:t></w:r>`,
    "    </w:p>",
  ].join("\n");
}

function heading(block) {
  return [
    "    <w:p>",
    `      <w:pPr><w:pStyle w:val="Heading${block.level}"/></w:pPr>`,
    `      <w:r><w:t>${xmlText(block.text)}</w:t></w:r>`,
    "    </w:p>",
  ].join("\n");
}

function table(block) {
  const rows = [block.headers, ...(block.rows || [])];
  const columnWidth = Math.max(1200, Math.floor(9000 / Math.max(1, block.headers.length || 1)));
  const rowXml = rows.map((row) => [
    "      <w:tr>",
    ...row.map((cell) => [
      "        <w:tc>",
      `          <w:tcPr><w:tcW w:w="${columnWidth}" w:type="dxa"/></w:tcPr>`,
      paragraph(cell).split("\n").map((line) => `  ${line}`).join("\n"),
      "        </w:tc>",
    ].join("\n")),
    "      </w:tr>",
  ].join("\n")).join("\n");
  return [
    "    <w:tbl>",
    "      <w:tblPr>",
    "        <w:tblW w:w=\"9000\" w:type=\"dxa\"/>",
    "        <w:tblBorders><w:top w:val=\"single\" w:sz=\"4\"/><w:left w:val=\"single\" w:sz=\"4\"/><w:bottom w:val=\"single\" w:sz=\"4\"/><w:right w:val=\"single\" w:sz=\"4\"/><w:insideH w:val=\"single\" w:sz=\"4\"/><w:insideV w:val=\"single\" w:sz=\"4\"/></w:tblBorders>",
    "      </w:tblPr>",
    rowXml,
    "    </w:tbl>",
  ].join("\n");
}

function blockToWordXml(block) {
  if (block.type === "heading") return heading(block);
  if (block.type === "paragraph" || block.type === "quote") return paragraph(block.text);
  if (block.type === "list") return (block.items || []).map((item, index) => paragraph(`${block.ordered ? `${index + 1}.` : "-"} ${item}`)).join("\n");
  if (block.type === "code") return paragraph(block.code);
  if (block.type === "table") return table(block);
  if (block.type === "image") return paragraph(block.alt || block.title || block.src);
  if (block.type === "asset") return paragraph(block.alt || block.title || block.assetId);
  if (block.type === "raw") return paragraph(block.content);
  return "";
}

export function writeDocx({ model, title = model.title }) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS}/wordprocessingml/2006/main">
  <w:body>
${model.blocks.map(blockToWordXml).join("\n")}
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
<cp:coreProperties xmlns:cp="${NS}/package/2006/metadata/core-properties" xmlns:dc="${DC_NS}"><dc:title>${xmlText(title)}</dc:title></cp:coreProperties>`,
    },
    {
      name: "word/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${NS}/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`,
    },
    {
      name: "word/numbering.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${NS}/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">
</Relationships>`,
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
