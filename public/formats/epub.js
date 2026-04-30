import { createDocumentModel, createHeading, createParagraph, createTable } from "../core/document-model.js";
import { readZipEntries } from "../core/zip-container.js";
import { getAttr, resolvePartPath, stripTags } from "./ooxml-utils.js";

function parseManifest(opfXml) {
  const items = new Map();
  for (const itemMatch of String(opfXml || "").matchAll(/<item\b[^>]*\/?>/g)) {
    const tag = itemMatch[0];
    const id = getAttr(tag, "id");
    if (!id) continue;
    items.set(id, {
      id,
      href: getAttr(tag, "href"),
      mediaType: getAttr(tag, "media-type"),
    });
  }
  return items;
}

function parseXhtmlBlocks(html) {
  const blocks = [];
  const pattern = /<h([1-6])\b[\s\S]*?<\/h\1>|<p\b[\s\S]*?<\/p>|<table\b[\s\S]*?<\/table>/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const fragment = match[0];
    const heading = fragment.match(/^<h([1-6])/i);
    if (heading) {
      const text = stripTags(fragment);
      if (text) blocks.push(createHeading(Number(heading[1]), text));
      continue;
    }
    if (/^<p\b/i.test(fragment)) {
      const text = stripTags(fragment);
      if (text) blocks.push(createParagraph(text));
      continue;
    }
    const rows = [...fragment.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
      .map((rowMatch) => [...rowMatch[0].matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)].map((cell) => stripTags(cell[0])))
      .filter((row) => row.length > 0);
    const headers = rows.shift() || [];
    if (headers.length > 0) blocks.push(createTable(headers, rows));
  }
  return blocks;
}

export function readEpub({ content, title = "epub", fileName = "", format = "epub" }) {
  const zip = readZipEntries(content);
  const containerXml = zip.getText("META-INF/container.xml");
  const rootfile = getAttr(containerXml.match(/<rootfile\b[^>]*\/?>/)?.[0] || "", "full-path") || "content.opf";
  const opfXml = zip.getText(rootfile);
  const titleText = stripTags(opfXml.match(/<dc:title\b[\s\S]*?<\/dc:title>/)?.[0] || "") || title;
  const manifest = parseManifest(opfXml);
  const blocks = [createHeading(1, titleText)];
  let spineCount = 0;

  for (const itemref of opfXml.matchAll(/<itemref\b[^>]*\/?>/g)) {
    const idref = getAttr(itemref[0], "idref");
    const item = manifest.get(idref);
    if (!item) continue;
    const partPath = resolvePartPath(rootfile, item.href);
    const html = zip.getText(partPath);
    if (!html) continue;
    blocks.push(...parseXhtmlBlocks(html));
    spineCount += 1;
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: {
      epub: {
        rootfile,
        spineCount,
        entryCount: zip.list().length,
        fileName,
      },
    },
  });
}
