import { createAssetReference, createDocumentModel, createHeading, createParagraph, createTable } from "../core/document-model.js";
import { createAssetStore } from "../core/asset-store.js";
import { readZipEntries } from "../core/zip-container.js";
import { extractTextTags, getAttr, parseRelationships, resolvePartPath } from "./ooxml-utils.js";

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

function parseTables(xml) {
  const tables = [];
  for (const tableMatch of String(xml || "").matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/g)) {
    const rows = [...tableMatch[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)]
      .map((rowMatch) => [...rowMatch[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map((cellMatch) => extractTextTags(cellMatch[0], "a:t").trim()))
      .filter((row) => row.length > 0);
    const headers = rows.shift() || [];
    if (headers.length > 0) tables.push(createTable(headers, rows));
  }
  return tables;
}

function parsePictures(xml, relationships, zip, assetStore) {
  const blocks = [];
  for (const picMatch of String(xml || "").matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
    const imageId = getAttr(picMatch[0].match(/<a:blip\b[^>]*\/?>/)?.[0] || "", "r:embed");
    const relationship = relationships.get(imageId);
    const target = relationship?.resolvedTarget || resolvePartPath("ppt/slides/slide1.xml", relationship?.target || "");
    const bytes = target ? zip.getBytes(target) : null;
    if (!bytes) continue;
    const mime = mimeFromPath(target);
    const cNvPr = picMatch[0].match(/<p:cNvPr\b[^>]*\/?>/)?.[0] || "";
    const alt = getAttr(cNvPr, "descr") || getAttr(cNvPr, "name") || target.split("/").pop() || imageId;
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

function parseSlide(xml, index, relationships, zip, assetStore) {
  const shapes = [...String(xml || "").matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)];
  const texts = shapes.map((shape) => extractTextTags(shape[0], "a:t").trim()).filter(Boolean);
  const blocks = [];
  if (texts.length > 0) {
    blocks.push(createHeading(2, `Slide ${index}: ${texts[0]}`));
    texts.slice(1).forEach((text) => blocks.push(createParagraph(text)));
  }
  blocks.push(...parsePictures(xml, relationships, zip, assetStore));
  blocks.push(...parseTables(xml));
  return blocks;
}

export function readPptx({ content, title = "presentation", fileName = "", format = "pptx" }) {
  const zip = readZipEntries(content);
  const rels = parseRelationships(zip.getText("ppt/_rels/presentation.xml.rels"), "ppt/presentation.xml");
  const assetStore = createAssetStore();
  const slideTargets = [...rels.values()]
    .filter((relationship) => relationship.type.includes("/slide") || relationship.type === "slide")
    .map((relationship) => relationship.resolvedTarget)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const blocks = [];
  let notesSlideCount = 0;
  let masterReferenceCount = 0;
  slideTargets.forEach((target, index) => {
    const slideRels = parseRelationships(zip.getText(`${target.split("/").slice(0, -1).join("/")}/_rels/${target.split("/").pop()}.rels`), target);
    blocks.push(...parseSlide(zip.getText(target), index + 1, slideRels, zip, assetStore));
    for (const relationship of slideRels.values()) {
      if (relationship.type.endsWith("/notesSlide") || relationship.type === "notesSlide") {
        notesSlideCount += 1;
        const notesText = extractTextTags(zip.getText(relationship.resolvedTarget), "a:t").trim();
        if (notesText) blocks.push(createParagraph(`Speaker notes: ${notesText}`));
      }
      if (relationship.type.endsWith("/slideMaster") || relationship.type === "slideMaster") {
        masterReferenceCount += 1;
      }
    }
  });
  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    assets: assetStore.toJSON(),
    metadata: {
      ooxml: {
        container: "zip",
        presentationPart: "ppt/presentation.xml",
        slideCount: slideTargets.length,
        notesSlideCount,
        masterReferenceCount,
        compressionMethods: zip.methods(),
        entryCount: zip.list().length,
        fileName,
      },
    },
  });
}
