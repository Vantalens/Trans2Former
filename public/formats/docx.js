import { ConversionError } from "../core/conversion-error.js";
import {
  createAssetReference,
  createDocumentModel,
  createHeading,
  createList,
  createParagraph,
  createTable,
} from "../core/document-model.js";
import { createAssetStore } from "../core/asset-store.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { readZipEntries } from "../core/zip-container.js";
import { decodeXml, extractTextTags, getAttr, parseRelationships, resolvePartPath } from "./ooxml-utils.js";

function extractText(xml) {
  return extractTextTags(xml, "w:t");
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

function parseTable(xml) {
  const hasMergedCells = /<w:(gridSpan|vMerge)\b/.test(xml);
  const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)]
    .map((rowMatch) => [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)]
      .map((cellMatch) => extractText(cellMatch[0]).trim()))
    .filter((row) => row.length > 0);
  const headers = rows.shift() || [];
  const table = headers.length > 0 ? createTable(headers, rows) : null;
  return { table, hasMergedCells };
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

function parseParagraph(xml, relationships, assetStore, zip, warnings, references = {}) {
  const style = getAttr(xml.match(/<w:pStyle\b[^>]*\/?>/)?.[0] || "", "w:val");
  const text = extractText(xml).trim();
  const hyperlinkIds = [...xml.matchAll(/<w:hyperlink\b[^>]*r:id="([^"]+)"/g)].map((match) => match[1]);
  const imageIds = [...xml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)].map((match) => match[1]);
  const numPr = xml.match(/<w:numPr\b[\s\S]*?<\/w:numPr>/)?.[0] || "";
  const listMeta = numPr ? {
    depth: Number(getAttr(numPr.match(/<w:ilvl\b[^>]*\/?>/)?.[0] || "", "w:val")) || 0,
    numId: getAttr(numPr.match(/<w:numId\b[^>]*\/?>/)?.[0] || "", "w:val"),
  } : null;

  const blocks = [];
  if (text) {
    const linkTargets = hyperlinkIds
      .map((id) => relationships.get(id))
      .filter(Boolean)
      .map((relationship) => relationship.target);
    const textWithLinks = linkTargets.length > 0 ? `${text} (${linkTargets.join(", ")})` : text;
    if (listMeta) {
      blocks.push(createList([textWithLinks], references.orderedNumIds?.has(listMeta.numId), [{
        depth: listMeta.depth,
        marker: listMeta.numId,
      }]));
    } else if (/^Heading([1-6])$/i.test(style)) {
      blocks.push(createHeading(Number(style.match(/\d/)?.[0] || 1), textWithLinks));
    } else {
      blocks.push(createParagraph(textWithLinks));
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
    footnotes: parseIdTextMap(zip.getText("word/footnotes.xml"), "footnote"),
    comments: parseIdTextMap(zip.getText("word/comments.xml"), "comment"),
  };

  blocks.push(...parseRelatedParagraphs(zip, relationships, "/header"));

  for (const match of body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g)) {
    if (match[1] === "tbl") {
      const { table, hasMergedCells } = parseTable(match[0]);
      if (hasMergedCells) {
        warnings.push(createWarning("lossy", "DOCX_TABLE_MERGE_APPROXIMATED", "DOCX merged table cells were flattened into the DocumentModel table shape."));
      }
      if (table) blocks.push(table);
      continue;
    }
    blocks.push(...parseParagraph(match[0], relationships, assetStore, zip, warnings, references));
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
