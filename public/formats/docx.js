import { ConversionError } from "../core/conversion-error.js";
import {
  createAssetReference,
  createDocumentModel,
  createHeading,
  createList,
  createParagraph,
  createTable,
} from "../core/document-model.js";
import {
  createInlineCode,
  createInlineDel,
  createInlineEm,
  createInlineLineBreak,
  createInlineLink,
  createInlineStrong,
  createInlineText,
  inlinesToPlainText,
} from "../core/models/semantic-inlines.js";
import { createAssetStore } from "../core/asset-store.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { readZipEntries } from "../core/zip-container.js";
import { decodeXml, getAttr, parseRelationships, resolvePartPath } from "./ooxml-utils.js";

// run 级文本 token：<w:t>…</w:t> / <w:tab/> / <w:br/> / <w:cr/>（issue #92——
// 旧实现只拼 <w:t>，制表/换行两侧的文本被无分隔黏连）。\b 保证 <w:t 不吞 <w:tab、
// 不碰 <w:tbl。注意 w:pPr/w:tabs 里的 <w:tab w:val=…/> 是制表位定义不是制表符，
// 整段扫描前必须先剔除 <w:tabs> 子树。
const DOCX_TEXT_TOKEN = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:(?:br|cr)\b[^>]*\/?>/g;

function extractText(xml) {
  const cleaned = String(xml ?? "").replace(/<w:tabs\b[\s\S]*?<\/w:tabs>/g, "");
  let out = "";
  for (const m of cleaned.matchAll(DOCX_TEXT_TOKEN)) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0].startsWith("<w:tab")) out += "\t";
    else out += "\n";
  }
  return out;
}

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  return "";
}

function mimeFromPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

// 深度计数的平衡块扫描器（issue #93）：tag 形如 "w:tr"，返回顶层平衡块字符串数组。
// \b 边界天然排除 w:trPr/w:tcPr/w:tblPr（tr 后跟字母无边界）；同名嵌套（tc 内 tbl
// 内 tr）因 depth>0 并入外层块切片，不会泄漏到顶层。
function scanBalanced(xml, tag) {
  const source = String(xml ?? "");
  const token = new RegExp(`<\\/?${tag}\\b[^>]*?>`, "g");
  const out = [];
  let depth = 0;
  let start = -1;
  for (const m of source.matchAll(token)) {
    const isClose = m[0].startsWith("</");
    const selfClosing = m[0].endsWith("/>");
    if (isClose) {
      if (depth > 0 && --depth === 0) out.push(source.slice(start, m.index + m[0].length));
    } else if (selfClosing) {
      if (depth === 0) out.push(m[0]);
    } else {
      if (depth === 0) start = m.index;
      depth += 1;
    }
  }
  return out;
}

// 顶层块分发器（issue #93）：旧的 /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/ 非贪婪匹配在嵌套
// <w:tbl> 的内层第一个 </w:tbl> 提前截断，外层表格后半段碎成残片。按文档顺序返回
// { tag, xml }；嵌套同名标签正确加深（tbl 内 tbl、文本框里的 p 内 p）。
function scanTopLevelBlocks(body) {
  const source = String(body ?? "");
  const token = /<\/?w:(p|tbl)\b[^>]*?>/g;
  const blocks = [];
  let current = null;
  for (const m of source.matchAll(token)) {
    const isClose = m[0].startsWith("</");
    const selfClosing = m[0].endsWith("/>");
    const tag = m[1];
    if (!current) {
      if (isClose) continue;
      if (selfClosing) {
        blocks.push({ tag, xml: m[0] });
        continue;
      }
      current = { tag, start: m.index, depth: 1 };
    } else if (tag === current.tag) {
      if (isClose) {
        if (--current.depth === 0) {
          blocks.push({ tag: current.tag, xml: source.slice(current.start, m.index + m[0].length) });
          current = null;
        }
      } else if (!selfClosing) {
        current.depth += 1;
      }
    }
    // tag 不同则忽略：tbl 块内的 w:p 属于单元格内容；p 块内的 w:tbl（文本框）属段落内容
  }
  return blocks;
}

function parseTable(xml) {
  const hasMergedCells = /<w:(gridSpan|vMerge)\b/.test(xml);
  const hasNestedTable = (String(xml ?? "").match(/<w:tbl\b/g) || []).length > 1;
  // 嵌套表文本经 extractText 平铺进外层单元格；压缩连续换行/空格为单空格防止单元格内
  // 换行破坏 md 表格，但保留 \t（issue #92——表格单元格内含制表符的真实文档存在）
  const rows = scanBalanced(xml, "w:tr")
    .map((rowXml) => scanBalanced(rowXml, "w:tc")
      .map((cellXml) => extractText(cellXml).replace(/[ \n\r]+/g, " ").trim()))
    .filter((row) => row.length > 0);
  const headers = rows.shift() || [];
  const table = headers.length > 0 ? createTable(headers, rows) : null;
  return { table, hasMergedCells, hasNestedTable };
}

// 从 styles.xml 解析每个 paragraph style 对应的 heading level（如果有）。
// 兼容 Word 中文模板：styleId 可能是 "1"/"af0"/"a3"，w:name 可能是 "heading 1" 或 "标题 1"。
function parseHeadingStyleMap(xml) {
  const map = new Map();
  if (!xml) return map;
  for (const styleMatch of String(xml).matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)) {
    const styleBlock = styleMatch[0];
    const open = styleBlock.match(/<w:style\b[^>]*>/)?.[0] || "";
    if (!/w:type="paragraph"/.test(open)) continue;
    const styleId = getAttr(open, "w:styleId");
    if (!styleId) continue;
    const name = getAttr(styleBlock.match(/<w:name\b[^>]*\/?>/)?.[0] || "", "w:val").toLowerCase();
    // 直接 styleId 命中
    let m = /^heading([1-6])$/i.exec(styleId);
    if (!m) m = /^heading\s*([1-6])$/i.exec(name);
    if (!m) m = /^标题\s*([1-6])$/.exec(name);
    if (m) {
      const level = Math.min(6, Math.max(1, Number(m[1])));
      map.set(styleId, level);
    }
  }
  return map;
}

function parseNumbering(xml) {
  const orderedAbstractIds = new Set();
  for (const abstractMatch of String(xml || "").matchAll(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g)) {
    const id = getAttr(abstractMatch[0].match(/<w:abstractNum\b[^>]*>/)?.[0] || "", "w:abstractNumId");
    if (/<w:numFmt\b[^>]*w:val="decimal"/.test(abstractMatch[0])) {
      orderedAbstractIds.add(id);
    }
  }
  const orderedNumIds = new Set();
  for (const numMatch of String(xml || "").matchAll(/<w:num\b[\s\S]*?<\/w:num>/g)) {
    const numId = getAttr(numMatch[0].match(/<w:num\b[^>]*>/)?.[0] || "", "w:numId");
    const abstractId = getAttr(numMatch[0].match(/<w:abstractNumId\b[^>]*\/?>/)?.[0] || "", "w:val");
    if (orderedAbstractIds.has(abstractId)) orderedNumIds.add(numId);
  }
  return orderedNumIds;
}

function parseIdTextMap(xml, elementName) {
  const map = new Map();
  const pattern = new RegExp(`<w:${elementName}\\b[\\s\\S]*?<\\/w:${elementName}>`, "g");
  for (const match of String(xml || "").matchAll(pattern)) {
    const id = getAttr(match[0].match(new RegExp(`<w:${elementName}\\b[^>]*>`))?.[0] || "", "w:id");
    const text = extractText(match[0]).trim();
    if (id && text) map.set(id, text);
  }
  return map;
}

function parseRelatedParagraphs(zip, relationships, typeSuffix) {
  const blocks = [];
  for (const relationship of relationships.values()) {
    if (!relationship.type.endsWith(typeSuffix) && relationship.type !== typeSuffix.replace("/", "")) continue;
    const xml = zip.getText(relationship.resolvedTarget);
    const text = extractText(xml).trim();
    if (text) blocks.push(createParagraph(text));
  }
  return blocks;
}

// 从 paragraph XML 抽取行内节点：识别 hyperlink、run（含 bold/italic/del/code 属性）。
// 不再把"文本+链接 (URL)"拼成一段降级字符串，链接直接保留为 inline link 节点。
function extractInlinesFromParagraph(xml, relationships) {
  const inlines = [];
  const tokenPattern = /<w:hyperlink\b[^>]*>[\s\S]*?<\/w:hyperlink>|<w:r\b[\s\S]*?<\/w:r>/g;
  for (const match of String(xml || "").matchAll(tokenPattern)) {
    const segment = match[0];
    if (segment.startsWith("<w:hyperlink")) {
      const idAttr = segment.match(/r:id="([^"]+)"/)?.[1] || "";
      const target = relationships.get(idAttr)?.target || "";
      const innerInlines = extractRunInlines(segment);
      if (innerInlines.length > 0) {
        inlines.push(createInlineLink({ inlines: innerInlines, href: target }));
      }
    } else {
      inlines.push(...extractRunInlines(segment));
    }
  }
  return inlines;
}

function extractRunInlines(xml) {
  const result = [];
  for (const runMatch of String(xml || "").matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)) {
    const run = runMatch[0];
    const rPr = run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] || "";

    const isBold = /<w:b\s*\/?>/i.test(rPr) || /<w:b\s+w:val="(?:true|1|on)"/i.test(rPr);
    const isItalic = /<w:i\s*\/?>/i.test(rPr) || /<w:i\s+w:val="(?:true|1|on)"/i.test(rPr);
    const isStrike = /<w:strike\s*\/?>/i.test(rPr) || /<w:dstrike\s*\/?>/i.test(rPr);
    const isCode = /Consolas|Courier|Mono/i.test(rPr.match(/<w:rFonts\b[^>]*\/?>/)?.[0] || "")
      || /<w:rStyle\b[^>]*w:val="(?:Code|HTMLCode|Source)"/i.test(rPr);

    const wrapStyled = (text) => {
      let inline = isCode ? createInlineCode(text) : createInlineText(text);
      if (!isCode && isItalic) inline = createInlineEm([inline]);
      if (!isCode && isBold) inline = createInlineStrong([inline]);
      if (isStrike) inline = createInlineDel([inline]);
      return inline;
    };

    // run 内顺序扫描：<w:t> 累积、<w:tab/> 注入制表符、<w:br/>/<w:cr/> 截段并
    // 插入 linebreak 节点（issue #92）。run 内无 w:tabs 子树，无需预清洗。
    let buffer = "";
    const flush = () => {
      if (buffer) {
        result.push(wrapStyled(buffer));
        buffer = "";
      }
    };
    for (const m of run.matchAll(DOCX_TEXT_TOKEN)) {
      if (m[1] !== undefined) buffer += decodeXml(m[1]);
      else if (m[0].startsWith("<w:tab")) buffer += "\t";
      else {
        flush();
        result.push(createInlineLineBreak());
      }
    }
    flush();
  }
  return result;
}

function parseParagraph(xml, relationships, assetStore, zip, warnings, references = {}) {
  const style = getAttr(xml.match(/<w:pStyle\b[^>]*\/?>/)?.[0] || "", "w:val");
  const inlines = extractInlinesFromParagraph(xml, relationships);
  // issue #92：preserve tab，只压缩连续换行/空格为单空格
  const text = inlinesToPlainText(inlines).replace(/[ \n\r]+/g, " ").trim();
  const imageIds = [...xml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)].map((match) => match[1]);
  const numPr = xml.match(/<w:numPr\b[\s\S]*?<\/w:numPr>/)?.[0] || "";
  const listMeta = numPr ? {
    depth: Number(getAttr(numPr.match(/<w:ilvl\b[^>]*\/?>/)?.[0] || "", "w:val")) || 0,
    numId: getAttr(numPr.match(/<w:numId\b[^>]*\/?>/)?.[0] || "", "w:val"),
  } : null;

  const blocks = [];
  if (text) {
    if (listMeta) {
      const list = createList([text], references.orderedNumIds?.has(listMeta.numId), [{
        depth: listMeta.depth,
        marker: listMeta.numId,
      }]);
      if (inlines.length > 0) list.itemInlines = [inlines];
      blocks.push(list);
    } else if (/^Heading([1-6])$/i.test(style) || references.headingStyles?.has(style)) {
      const level = /^Heading([1-6])$/i.test(style)
        ? Number(style.match(/\d/)?.[0] || 1)
        : references.headingStyles.get(style);
      const heading = createHeading(level, text);
      if (inlines.length > 0) heading.inlines = inlines;
      blocks.push(heading);
    } else {
      const paragraph = createParagraph(text);
      if (inlines.length > 0) paragraph.inlines = inlines;
      blocks.push(paragraph);
    }
  }

  for (const id of [...xml.matchAll(/<w:footnoteReference\b[^>]*w:id="([^"]+)"/g)].map((match) => match[1])) {
    const footnote = references.footnotes?.get(id);
    if (footnote) blocks.push(createParagraph(`Footnote ${id}: ${footnote}`));
  }
  for (const id of [...xml.matchAll(/<w:commentReference\b[^>]*w:id="([^"]+)"/g)].map((match) => match[1])) {
    const comment = references.comments?.get(id);
    if (comment) blocks.push(createParagraph(`Comment ${id}: ${comment}`));
  }

  for (const imageId of imageIds) {
    const relationship = relationships.get(imageId);
    const target = resolvePartPath("word/document.xml", relationship?.target || "");
    const bytes = target ? zip.getBytes(target) : null;
    if (!bytes) {
      warnings.push(createWarning("lossy", "DOCX_IMAGE_MISSING", `DOCX image relationship ${imageId} could not be resolved.`));
      continue;
    }
    const mime = mimeFromPath(target);
    const docPr = xml.match(/<wp:docPr\b[^>]*\/?>/)?.[0] || "";
    const alt = getAttr(docPr, "descr") || getAttr(docPr, "title") || target.split("/").pop() || imageId;
    const asset = assetStore.add({
      name: target.split("/").pop() || imageId,
      mime,
      data: `data:${mime};base64,${bytesToBase64(bytes)}`,
      size: bytes.length,
      role: "image",
    });
    blocks.push(createAssetReference(asset.id, { alt, title: asset.name }));
  }

  return blocks;
}

function mergeAdjacentLists(blocks) {
  const merged = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    if (block.type === "list" && previous?.type === "list" && previous.ordered === block.ordered) {
      previous.items.push(...block.items);
      previous.itemMeta.push(...block.itemMeta);
    } else {
      merged.push(block);
    }
  }
  return merged;
}

export function readDocx({ content, title = "document", fileName = "", format = "docx" }) {
  const zip = readZipEntries(content);
  const documentXml = zip.getText("word/document.xml");
  if (!documentXml) {
    throw new ConversionError("DOCX 缺少 word/document.xml", {
      category: "parse",
      code: "DOCX_DOCUMENT_XML_MISSING",
      format,
    });
  }

  const relationships = parseRelationships(zip.getText("word/_rels/document.xml.rels"), "word/document.xml");
  const assetStore = createAssetStore();
  const warnings = [];
  const blocks = [];
  const body = documentXml.match(/<w:body\b[\s\S]*<\/w:body>/)?.[0] || documentXml;
  const references = {
    orderedNumIds: parseNumbering(zip.getText("word/numbering.xml")),
    headingStyles: parseHeadingStyleMap(zip.getText("word/styles.xml")),
    footnotes: parseIdTextMap(zip.getText("word/footnotes.xml"), "footnote"),
    comments: parseIdTextMap(zip.getText("word/comments.xml"), "comment"),
  };

  blocks.push(...parseRelatedParagraphs(zip, relationships, "/header"));

  for (const block of scanTopLevelBlocks(body)) {
    if (block.tag === "tbl") {
      const { table, hasMergedCells, hasNestedTable } = parseTable(block.xml);
      if (hasMergedCells) {
        warnings.push(createWarning("lossy", "DOCX_TABLE_MERGE_APPROXIMATED", "DOCX merged table cells were flattened into the DocumentModel table shape."));
      }
      if (hasNestedTable) {
        warnings.push(createWarning("lossy", "DOCX_NESTED_TABLE_FLATTENED", "DOCX nested tables were flattened into the parent cell text."));
      }
      if (table) blocks.push(table);
      continue;
    }
    blocks.push(...parseParagraph(block.xml, relationships, assetStore, zip, warnings, references));
  }

  blocks.push(...parseRelatedParagraphs(zip, relationships, "/footer"));

  if (blocks.length === 0) {
    warnings.push(createWarning("lossy", "DOCX_EMPTY_DOCUMENT", "DOCX document.xml did not produce readable blocks."));
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks: mergeAdjacentLists(blocks),
    assets: assetStore.toJSON(),
    metadata: withWarnings({
      ooxml: {
        container: "zip",
        documentPart: "word/document.xml",
        entryCount: zip.list().length,
        relationshipCount: relationships.size,
        compressionMethods: zip.methods(),
        fileName,
      },
    }, warnings),
  });
}
