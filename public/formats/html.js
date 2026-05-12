import {
  createCodeBlock,
  createDocumentModel,
  createHeading,
  createImage,
  createList,
  createParagraph,
  createQuote,
  createTable,
} from "../core/document-model.js";
import { escapeHtml } from "./text-utils.js";
import { modelToBodyHtml } from "./markdown.js";

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link", "source", "col", "area", "embed", "param", "wbr"]);
const BLOCK_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "div", "section", "article", "header", "footer", "main", "nav", "aside",
  "blockquote", "pre", "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "figure", "figcaption", "hr", "img",
]);

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

function getAttr(attrs, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, "i");
  const match = String(attrs || "").match(pattern);
  if (!match) return "";
  return decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

const TOKEN_PATTERN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<!doctype[^>]*>|<\?[\s\S]*?\?>|<\s*\/\s*([a-zA-Z][\w:-]*)\s*>|<\s*([a-zA-Z][\w:-]*)\b([^>]*?)\/\s*>|<\s*([a-zA-Z][\w:-]*)\b([^>]*?)>|([^<]+)/g;

function tokenizeHtml(source) {
  const events = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match;
  while ((match = TOKEN_PATTERN.exec(source))) {
    const token = match[0];
    if (!token) continue;
    if (token.startsWith("<!--") || token.startsWith("<?") || token.toLowerCase().startsWith("<!doctype")) continue;
    if (match[1] !== undefined) {
      events.push({ type: "text", text: match[1] });
      continue;
    }
    if (match[2]) {
      events.push({ type: "close", tag: match[2].toLowerCase() });
      continue;
    }
    if (match[3]) {
      events.push({ type: "void", tag: match[3].toLowerCase(), attrs: match[4] || "" });
      continue;
    }
    if (match[5]) {
      const tag = match[5].toLowerCase();
      const attrs = match[6] || "";
      if (VOID_TAGS.has(tag)) events.push({ type: "void", tag, attrs });
      else events.push({ type: "open", tag, attrs });
      continue;
    }
    if (match[7] !== undefined) {
      events.push({ type: "text", text: match[7] });
    }
  }
  return events;
}

function eventsToHtml(events) {
  return events.map((event) => {
    if (event.type === "text") return event.text;
    if (event.type === "open") return `<${event.tag}${event.attrs ? ` ${event.attrs.trim()}` : ""}>`;
    if (event.type === "close") return `</${event.tag}>`;
    if (event.type === "void") return `<${event.tag}${event.attrs ? ` ${event.attrs.trim()}` : ""}>`;
    return "";
  }).join("");
}

function inlineToMarkdown(html) {
  let text = String(html ?? "");
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "  \n");
  text = text.replace(/<\s*img\b([^>]*)\/?\s*>/gi, (_, attrs) => {
    const src = getAttr(attrs, "src");
    const alt = getAttr(attrs, "alt");
    const title = getAttr(attrs, "title");
    if (!src) return "";
    const titlePart = title ? ` "${title}"` : "";
    return `![${alt}](${src}${titlePart})`;
  });
  text = text.replace(/<\s*a\b([^>]*)>([\s\S]*?)<\s*\/\s*a\s*>/gi, (_, attrs, inner) => {
    const href = getAttr(attrs, "href");
    const innerText = inlineToMarkdown(inner);
    if (!href) return innerText;
    return `[${innerText}](${href})`;
  });
  text = text.replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_, _tag, inner) => `**${inlineToMarkdown(inner)}**`);
  text = text.replace(/<\s*(em|i)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_, _tag, inner) => `*${inlineToMarkdown(inner)}*`);
  text = text.replace(/<\s*code\b[^>]*>([\s\S]*?)<\s*\/\s*code\s*>/gi, (_, inner) => `\`${decodeHtmlEntities(inner).replace(/`/g, "\\`")}\``);
  text = text.replace(/<\s*(del|s|strike)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_, _tag, inner) => `~~${inlineToMarkdown(inner)}~~`);
  text = text.replace(/<\s*\/?[a-zA-Z][^>]*>/g, "");
  text = decodeHtmlEntities(text);
  return text.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function collectInline(events, start, stopTags) {
  const buffer = [];
  let index = start;
  let depth = 1;
  while (index < events.length) {
    const event = events[index];
    if (event.type === "open") {
      depth += 1;
      buffer.push(event);
    } else if (event.type === "close") {
      if (stopTags.has(event.tag)) {
        depth -= 1;
        if (depth === 0) return { events: buffer, nextIndex: index + 1 };
      } else {
        depth -= 1;
        buffer.push(event);
      }
    } else {
      buffer.push(event);
    }
    index += 1;
  }
  return { events: buffer, nextIndex: events.length };
}

function findClosingIndex(events, start, tag) {
  let depth = 1;
  for (let index = start; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === "open" && event.tag === tag) depth += 1;
    else if (event.type === "close" && event.tag === tag) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function sliceInline(events, start, closeIndex) {
  return inlineToMarkdown(eventsToHtml(events.slice(start, closeIndex)));
}

function extractListItems(events, start, closeIndex) {
  const items = [];
  const meta = [];
  let depth = 0;
  let index = start;
  while (index < closeIndex) {
    const event = events[index];
    if (event.type === "open" && (event.tag === "ul" || event.tag === "ol")) {
      depth += 1;
      index += 1;
      continue;
    }
    if (event.type === "close" && (event.tag === "ul" || event.tag === "ol")) {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }
    if (event.type === "open" && event.tag === "li") {
      const liClose = findClosingIndex(events, index + 1, "li");
      const end = liClose === -1 ? closeIndex : liClose;
      const text = sliceInline(events, index + 1, end);
      if (text) {
        items.push(text);
        meta.push({ depth, marker: "-" });
      }
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return { items, meta };
}

function extractTableRows(events, start, closeIndex) {
  const rows = [];
  let index = start;
  while (index < closeIndex) {
    const event = events[index];
    if (event.type === "open" && event.tag === "tr") {
      const trClose = findClosingIndex(events, index + 1, "tr");
      const end = trClose === -1 ? closeIndex : trClose;
      const cells = [];
      const cellTypes = [];
      let cursor = index + 1;
      while (cursor < end) {
        const cellEvent = events[cursor];
        if (cellEvent.type === "open" && (cellEvent.tag === "td" || cellEvent.tag === "th")) {
          const cellClose = findClosingIndex(events, cursor + 1, cellEvent.tag);
          const cellEnd = cellClose === -1 ? end : cellClose;
          cells.push(sliceInline(events, cursor + 1, cellEnd));
          cellTypes.push(cellEvent.tag);
          cursor = cellEnd + 1;
          continue;
        }
        cursor += 1;
      }
      if (cells.length > 0) rows.push({ cells, types: cellTypes });
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return rows;
}

function readBlocksFromEvents(events) {
  const blocks = [];
  let index = 0;
  let paragraphBuffer = [];

  function flushParagraph() {
    const text = paragraphBuffer.join("").trim();
    paragraphBuffer = [];
    if (text) blocks.push(createParagraph(text));
  }

  while (index < events.length) {
    const event = events[index];

    if (event.type === "text") {
      paragraphBuffer.push(event.text);
      index += 1;
      continue;
    }

    if (event.type === "void" && event.tag === "img") {
      flushParagraph();
      const src = getAttr(event.attrs, "src");
      const alt = getAttr(event.attrs, "alt");
      const title = getAttr(event.attrs, "title");
      if (src) blocks.push(createImage({ src, alt, title }));
      index += 1;
      continue;
    }

    if (event.type === "void" && event.tag === "hr") {
      flushParagraph();
      blocks.push(createParagraph("---"));
      index += 1;
      continue;
    }

    if (event.type === "void" || event.type === "close") {
      index += 1;
      continue;
    }

    const { tag } = event;

    if (BLOCK_TAGS.has(tag)) {
      flushParagraph();
      const closeIndex = findClosingIndex(events, index + 1, tag);
      const end = closeIndex === -1 ? events.length : closeIndex;

      if (/^h[1-6]$/.test(tag)) {
        const text = sliceInline(events, index + 1, end);
        if (text) blocks.push(createHeading(Number(tag.slice(1)), text));
      } else if (tag === "blockquote") {
        const text = sliceInline(events, index + 1, end);
        if (text) blocks.push(createQuote(text));
      } else if (tag === "pre") {
        const inner = eventsToHtml(events.slice(index + 1, end));
        const codeMatch = inner.match(/<\s*code\b[^>]*>([\s\S]*?)<\s*\/\s*code\s*>/i);
        const raw = decodeHtmlEntities(codeMatch ? codeMatch[1] : inner.replace(/<\/?[^>]+>/g, ""));
        if (raw.trim()) blocks.push(createCodeBlock(raw.replace(/^\n+/, "").replace(/\n+$/, "")));
      } else if (tag === "ul" || tag === "ol") {
        const { items, meta } = extractListItems(events, index + 1, end);
        if (items.length > 0) blocks.push(createList(items, tag === "ol", meta));
      } else if (tag === "table") {
        const allRows = extractTableRows(events, index + 1, end);
        if (allRows.length > 0) {
          let headers = [];
          let bodyRows = allRows;
          if (allRows[0].types.every((type) => type === "th")) {
            headers = allRows[0].cells;
            bodyRows = allRows.slice(1);
          } else if (allRows[0].types.some((type) => type === "th")) {
            headers = allRows[0].cells;
            bodyRows = allRows.slice(1);
          } else {
            headers = allRows[0].cells.map((_, i) => `列${i + 1}`);
          }
          blocks.push(createTable(headers, bodyRows.map((row) => row.cells)));
        }
      } else if (tag === "p") {
        const text = sliceInline(events, index + 1, end);
        if (text) blocks.push(createParagraph(text));
      } else if (tag === "li" || tag === "thead" || tag === "tbody" || tag === "tfoot" || tag === "tr" || tag === "th" || tag === "td" || tag === "figcaption") {
        // 应当被父级 block 处理；如果遇到孤立的，按段落降级
        const text = sliceInline(events, index + 1, end);
        if (text) blocks.push(createParagraph(text));
      } else {
        const inner = events.slice(index + 1, end);
        const innerBlocks = readBlocksFromEvents(inner);
        if (innerBlocks.length > 0) {
          blocks.push(...innerBlocks);
        } else {
          const text = sliceInline(events, index + 1, end);
          if (text) blocks.push(createParagraph(text));
        }
      }

      index = end + 1;
      continue;
    }

    // 顶层 inline：累积到段落缓冲
    const closeIndex = findClosingIndex(events, index + 1, tag);
    const end = closeIndex === -1 ? events.length : closeIndex;
    paragraphBuffer.push(eventsToHtml(events.slice(index, end + 1)));
    index = end + 1;
  }

  flushParagraph();
  return blocks;
}

function extractBodyHtml(source) {
  let text = String(source ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const bodyMatch = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];
  text = text.replace(/<!doctype[^>]*>/gi, "").replace(/<\/?html\b[^>]*>/gi, "").replace(/<head[\s\S]*?<\/head>/gi, "");
  return text;
}

export function readHtml({ content, title = "document", format = "html" }) {
  const body = extractBodyHtml(content);
  const events = tokenizeHtml(body);
  const blocks = readBlocksFromEvents(events);
  if (blocks.length === 0) {
    const fallback = inlineToMarkdown(body);
    if (fallback) blocks.push(createParagraph(fallback));
  }
  return createDocumentModel({ title, sourceFormat: format, blocks });
}

export function renderHtmlDocument({ bodyHtml, title = "document" }) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; padding: 32px; font-family: system-ui, "Segoe UI", sans-serif; line-height: 1.65; color: #17202a; }
      main { max-width: 880px; margin: 0 auto; }
      pre { padding: 14px; background: #f4f6f8; overflow: auto; border-radius: 8px; }
      code { font-family: "Cascadia Code", Consolas, monospace; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; padding: 6px 8px; }
      blockquote { margin-left: 0; padding-left: 1em; border-left: 4px solid #94a3b8; color: #475569; }
      img { max-width: 100%; }
      @media print { body { padding: 0; } main { max-width: none; } }
    </style>
  </head>
  <body>
    <main>${bodyHtml}</main>
  </body>
</html>`;
}

export function writeHtml({ model, title = model.title }) {
  const assetMap = new Map((model.assets || []).map((asset) => [asset.id, asset]));
  const bodyHtml = modelToBodyHtml(model).replace(
    /<figure data-asset-id="([^"]+)"><figcaption>([\s\S]*?)<\/figcaption><\/figure>/g,
    (_, assetId, caption) => {
      const asset = assetMap.get(assetId);
      if (!asset || !asset.mime.startsWith("image/")) {
        return `<figure><figcaption>${caption}</figcaption></figure>`;
      }
      return `<figure><img src="${asset.data}" alt="${caption}" /><figcaption>${caption}</figcaption></figure>`;
    }
  );

  return {
    type: "text",
    format: "html",
    data: renderHtmlDocument({ bodyHtml, title }),
    mime: "text/html;charset=utf-8",
  };
}

export function writePdfPrintHtml({ model, title = model.title }) {
  const html = writeHtml({ model, title });
  return {
    type: "print",
    format: "pdf",
    data: html.data,
    mime: "text/html;charset=utf-8",
  };
}
