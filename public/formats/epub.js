import { createCodeBlock, createDocumentModel, createHeading, createList, createParagraph, createQuote, createTable } from "../core/document-model.js";
import { bytesToDataUrl } from "../core/binary-utils.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { readZipEntries } from "../core/zip-container.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { decodeXml, getAttr, resolvePartPath, stripTags } from "./ooxml-utils.js";
import { writeHtml } from "./html.js";
import { escapeHtml, stripIllegalXmlChars } from "./text-utils.js";

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
  // 块级识别覆盖 ul/ol/blockquote/pre（issue #95——旧实现把它们整体跳过，
  // 列表/引用/代码全部丢失）。matchAll 按最左位置取胜：blockquote/ul 的起始
  // 位置先于其内部 <p>，内部段落不会被重复提取；<p\b 不匹配 <pre。
  const pattern = /<h([1-6])\b[\s\S]*?<\/h\1>|<(ul|ol)\b[\s\S]*?<\/\2>|<blockquote\b[\s\S]*?<\/blockquote>|<pre\b[\s\S]*?<\/pre>|<p\b[\s\S]*?<\/p>|<table\b[\s\S]*?<\/table>/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const fragment = match[0];
    const heading = fragment.match(/^<h([1-6])/i);
    if (heading) {
      const text = stripTags(fragment);
      if (text) blocks.push(createHeading(Number(heading[1]), text));
      continue;
    }
    if (/^<(ul|ol)/i.test(fragment)) {
      const ordered = /^<ol/i.test(fragment);
      const items = [...fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((m) => stripTags(m[1]))
        .filter(Boolean);
      if (items.length > 0) blocks.push(createList(items, ordered));
      continue;
    }
    if (/^<blockquote/i.test(fragment)) {
      const text = stripTags(fragment);
      if (text) blocks.push(createQuote(text));
      continue;
    }
    if (/^<pre/i.test(fragment)) {
      // 不能用 stripTags——它会把代码换行压成空格
      const inner = fragment
        .replace(/^<pre\b[^>]*>/i, "")
        .replace(/<\/pre>$/i, "")
        .replace(/^\s*<code\b[^>]*>/i, "")
        .replace(/<\/code>\s*$/i, "");
      const code = decodeXml(inner.replace(/<[^>]+>/g, "")).replace(/^\n+|\s+$/g, "");
      const language = fragment.match(/class="[^"]*language-([\w+-]+)/i)?.[1] || "";
      if (code) blocks.push(createCodeBlock(code, language));
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
  const warnings = [];
  const blocks = [createHeading(1, titleText)];
  let spineCount = 0;

  for (const itemref of opfXml.matchAll(/<itemref\b[^>]*\/?>/g)) {
    const idref = getAttr(itemref[0], "idref");
    const item = manifest.get(idref);
    if (!item) continue;
    const partPath = resolvePartPath(rootfile, item.href);
    const html = zip.getText(partPath);
    if (!html) continue;
    const parsed = parseXhtmlBlocks(html);
    if (parsed.length === 0) {
      // 无法识别的块级标记（如全 <div> 排版）：兜底拉平为段落并如实登记损失
      const bodyText = stripTags(html.match(/<body\b[\s\S]*<\/body>/i)?.[0] || html);
      if (bodyText) {
        parsed.push(createParagraph(bodyText));
        warnings.push(createWarning(
          "lossy",
          "EPUB_CONTENT_UNRECOGNIZED",
          `EPUB spine item ${item.href} had no recognizable block markup; text was flattened into a paragraph.`,
        ));
      }
    }
    blocks.push(...parsed);
    spineCount += 1;
  }

  return createDocumentModel({
    // dc:title 优先（issue #95 顺带修复：之前解析了却被丢弃）
    title: titleText || title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({
      epub: {
        rootfile,
        spineCount,
        entryCount: zip.list().length,
        fileName,
      },
    }, warnings),
  });
}

function htmlToXhtml(html, namespaces) {
  let xhtml = html
    .replace(/^<!doctype[^>]*>/i, "")
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // 更健壮的 HTML 标签替换
  const htmlMatch = xhtml.match(/<html\s+([^>]*)>/i);
  if (htmlMatch) {
    let attrs = htmlMatch[1]
      .replace(/\s*\blang="[^"]*"/i, "")
      .replace(/\s*\bxml:lang="[^"]*"/i, "")
      .replace(/\s*\bxmlns(?::[A-Za-z0-9_-]+)?="[^"]*"/g, "")
      .trim();
    xhtml = xhtml.replace(
      /<html\s+[^>]*>/i,
      `<html xmlns="${namespaces.xhtml}" lang="zh-CN" xml:lang="zh-CN"${attrs ? ' ' + attrs : ''}>`
    );
  } else if (xhtml.match(/<html\s*>/i)) {
    xhtml = xhtml.replace(/<html\s*>/i, `<html xmlns="${namespaces.xhtml}" lang="zh-CN" xml:lang="zh-CN">`);
  } else {
    const bodyMatch = xhtml.match(/<body[\s\S]*<\/body>/i);
    if (bodyMatch) {
      xhtml = `<html xmlns="${namespaces.xhtml}" lang="zh-CN" xml:lang="zh-CN"><head><title>Document</title></head>${bodyMatch[0]}</html>`;
    } else {
      xhtml = `<html xmlns="${namespaces.xhtml}" lang="zh-CN" xml:lang="zh-CN"><head><title>Document</title></head><body>${xhtml}</body></html>`;
    }
  }

  // 确保自闭合标签
  xhtml = xhtml.replace(/<(br|hr|img|meta|link|input)\b([^>]*?)(\/?)>/gi, (_, tag, attrs) => {
    const normalizedAttrs = String(attrs || "").replace(/\s*\/\s*$/, "").trim();
    return `<${tag}${normalizedAttrs ? ` ${normalizedAttrs}` : ""}/>`;
  });

  // 转义 HTML 实体为 XML 实体
  xhtml = xhtml.replace(/&nbsp;/g, "&#160;");

  // issue #96：XML 1.0 非法控制字符会让 EPUB 阅读器拒开；writeHtml 已是 HTML
  // 实体转义后的纯文本，控制字符必为字面字符，单遍剔除即可
  return stripIllegalXmlChars(xhtml);
}

export function writeEpub({ model, title = model.title }) {
  const XHTML_NS = "http" + "://www.w3.org/1999/xhtml";
  const OPF_NS = "http" + "://www.idpf.org/2007/opf";
  const DC_NS = "http" + "://purl.org/dc/elements/1.1/";
  const EPUB_OPS_NS = "http" + "://www.idpf.org/2007/ops";

  const htmlOutput = writeHtml({ model, title }).data;
  const body = htmlToXhtml(htmlOutput, { xhtml: XHTML_NS });

  const zipBytes = writeStoredZip([
    { name: "mimetype", data: "application/epub+zip" },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    },
    {
      name: "OEBPS/content.opf",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="${OPF_NS}" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="${DC_NS}"><dc:identifier id="bookid">trans2former-${Date.now()}</dc:identifier><dc:title>${escapeHtml(title)}</dc:title><dc:language>zh-CN</dc:language></metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`,
    },
    {
      name: "OEBPS/nav.xhtml",
      data: `<?xml version="1.0" encoding="UTF-8"?><html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_OPS_NS}" lang="zh-CN"><head><title>${escapeHtml(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">${escapeHtml(title)}</a></li></ol></nav></body></html>`,
    },
    { name: "OEBPS/chapter.xhtml", data: `<?xml version="1.0" encoding="UTF-8"?>${body}` },
  ]);
  return {
    type: "binary",
    format: "epub",
    data: bytesToDataUrl(zipBytes, "application/epub+zip"),
    mime: "application/epub+zip",
  };
}
