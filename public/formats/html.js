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
import {
  createInlineCode,
  createInlineDel,
  createInlineEm,
  createInlineLineBreak,
  createInlineLink,
  createInlineStrong,
  createInlineText,
  inlinesToMarkdown,
  inlinesToPlainText,
} from "../core/models/semantic-inlines.js";
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

// 常见 HTML 命名实体表。HTML5 完整实体表庞大（2200+ 项），只覆盖文档里高频使用的；
// 数字 / 16 进制实体由前两条 replace 兜底。
const NAMED_ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", middot: "·", bull: "•",
  times: "×", divide: "÷", plusmn: "±", deg: "°",
  sect: "§", para: "¶", micro: "µ",
  larr: "←", rarr: "→", uarr: "↑", darr: "↓",
  harr: "↔", crarr: "↵",
  euro: "€", pound: "£", yen: "¥", cent: "¢",
  iexcl: "¡", iquest: "¿",
  frac12: "½", frac14: "¼", frac34: "¾",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ",
  epsilon: "ε", lambda: "λ", mu: "μ", pi: "π",
  sigma: "σ", omega: "ω",
  infin: "∞", asymp: "≈", ne: "≠", le: "≤", ge: "≥",
  sum: "∑", prod: "∏", radic: "√", int: "∫",
  // 注意：&apos; 不是 HTML4 实体但 HTML5 / XHTML 允许，&#39; 也常见
};

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (raw, name) => {
      const decoded = NAMED_ENTITIES[name];
      return decoded != null ? decoded : raw;
    });
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

// 把 events 区间转换为 inline 节点数组。识别 strong/b、em/i、code、del/s/strike、
// a、br；其它内联标签透传内部节点；遇到 block-level 容器（在调用方已经剥离）
// 的 stray 节点会跳过。详见 docs/MULTI_MODEL_ARCHITECTURE.md。
function eventsToInlines(events, start, end) {
  const result = [];
  let index = start;
  while (index < end) {
    const event = events[index];
    if (!event) { index += 1; continue; }
    if (event.type === "text") {
      const text = decodeHtmlEntities(event.text);
      if (text) result.push(createInlineText(text));
      index += 1;
      continue;
    }
    if (event.type === "void") {
      if (event.tag === "br") {
        result.push(createInlineLineBreak());
      }
      // <img> 在内联位置忽略；block 级图片由 readBlocksFromEvents 单独处理
      index += 1;
      continue;
    }
    if (event.type === "close") {
      // stray close（嵌套不闭合）忽略
      index += 1;
      continue;
    }
    // open
    const tag = event.tag;
    const closeIndex = findClosingIndex(events, index + 1, tag);
    const innerEnd = closeIndex === -1 ? end : Math.min(closeIndex, end);
    if (tag === "strong" || tag === "b") {
      result.push(createInlineStrong(eventsToInlines(events, index + 1, innerEnd)));
    } else if (tag === "em" || tag === "i") {
      result.push(createInlineEm(eventsToInlines(events, index + 1, innerEnd)));
    } else if (tag === "code") {
      const inner = events.slice(index + 1, innerEnd)
        .filter((e) => e.type === "text")
        .map((e) => decodeHtmlEntities(e.text))
        .join("");
      result.push(createInlineCode(inner));
    } else if (tag === "del" || tag === "s" || tag === "strike") {
      result.push(createInlineDel(eventsToInlines(events, index + 1, innerEnd)));
    } else if (tag === "a") {
      result.push(createInlineLink({
        inlines: eventsToInlines(events, index + 1, innerEnd),
        href: getAttr(event.attrs, "href"),
        title: getAttr(event.attrs, "title"),
      }));
    } else {
      // 其它内联标签（span / sub / sup / mark / ...）：透传内部节点
      result.push(...eventsToInlines(events, index + 1, innerEnd));
    }
    index = (closeIndex === -1 ? end : closeIndex) + 1;
  }
  return result;
}

function trimInlines(inlines) {
  if (!Array.isArray(inlines) || inlines.length === 0) return inlines || [];
  // 头尾的纯 text 节点去掉首尾空白；中间的多余空白由 inlinesToPlainText 时再处理
  const cleaned = inlines.map((node, idx) => {
    if (node?.type !== "text") return node;
    let value = node.value;
    if (idx === 0) value = value.replace(/^\s+/, "");
    if (idx === inlines.length - 1) value = value.replace(/\s+$/, "");
    value = value.replace(/\s+/g, " ");
    return { ...node, value };
  }).filter((node) => !(node?.type === "text" && node.value === ""));
  return cleaned;
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
  return trimInlines(eventsToInlines(events, start, closeIndex));
}

function inlinesPlainTextTrimmed(inlines) {
  return inlinesToPlainText(inlines).replace(/\s+/g, " ").trim();
}

function makeBlockWithInlines(factory, inlines, ...args) {
  const plain = inlinesPlainTextTrimmed(inlines);
  const block = factory(...args, plain);
  if (Array.isArray(inlines) && inlines.length > 0) {
    block.inlines = inlines;
    block.text = plain;
  }
  return block;
}

function extractListItems(events, start, closeIndex) {
  const items = [];
  const itemInlines = [];
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
      const liEnd = liClose === -1 ? closeIndex : liClose;
      // 寻找当前 li 内第一个嵌套 ul/ol 的位置：嵌套子列表不应纳入当前 li 的文本，
      // 而是让外层循环按 depth+1 继续递归处理。
      let nestedListStart = -1;
      for (let scan = index + 1; scan < liEnd; scan += 1) {
        const inner = events[scan];
        if (inner.type === "open" && (inner.tag === "ul" || inner.tag === "ol")) {
          nestedListStart = scan;
          break;
        }
      }
      const inlineEnd = nestedListStart === -1 ? liEnd : nestedListStart;
      const inlines = sliceInline(events, index + 1, inlineEnd);
      const plain = inlinesPlainTextTrimmed(inlines);
      if (plain) {
        items.push(plain);
        itemInlines.push(inlines);
        meta.push({ depth, marker: "-" });
      }
      // 有嵌套列表时让外层循环接管（depth 计数会自然递增）；否则跳过整个 li。
      index = nestedListStart === -1 ? liEnd + 1 : nestedListStart;
      continue;
    }
    index += 1;
  }
  return { items, itemInlines, meta };
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
          // 表格单元格暂时只输出 plain text；行内格式在 P8-M3 表格升级时再细化
          cells.push(inlinesPlainTextTrimmed(sliceInline(events, cursor + 1, cellEnd)));
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
  let paragraphBuffer = []; // 顶层"散文"区域：累积 events，flush 时再转 inlines

  function flushParagraph() {
    if (paragraphBuffer.length === 0) return;
    const inlines = trimInlines(eventsToInlines(paragraphBuffer, 0, paragraphBuffer.length));
    paragraphBuffer = [];
    const plain = inlinesPlainTextTrimmed(inlines);
    if (!plain) return;
    const block = createParagraph(plain);
    if (inlines.length > 0) block.inlines = inlines;
    blocks.push(block);
  }

  function pushBlockFromInlines(factory, inlines, ...factoryArgs) {
    const plain = inlinesPlainTextTrimmed(inlines);
    if (!plain) return;
    const block = factory(...factoryArgs, plain);
    if (Array.isArray(inlines) && inlines.length > 0) {
      block.inlines = inlines;
      block.text = plain;
    }
    blocks.push(block);
  }

  while (index < events.length) {
    const event = events[index];

    if (event.type === "text") {
      paragraphBuffer.push(event);
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
        const inlines = sliceInline(events, index + 1, end);
        pushBlockFromInlines((level, plain) => createHeading(level, plain), inlines, Number(tag.slice(1)));
      } else if (tag === "blockquote") {
        const inlines = sliceInline(events, index + 1, end);
        pushBlockFromInlines((plain) => createQuote(plain), inlines);
      } else if (tag === "pre") {
        const inner = eventsToHtml(events.slice(index + 1, end));
        const codeMatch = inner.match(/<\s*code\b[^>]*>([\s\S]*?)<\s*\/\s*code\s*>/i);
        const raw = decodeHtmlEntities(codeMatch ? codeMatch[1] : inner.replace(/<\/?[^>]+>/g, ""));
        if (raw.trim()) blocks.push(createCodeBlock(raw.replace(/^\n+/, "").replace(/\n+$/, "")));
      } else if (tag === "ul" || tag === "ol") {
        const { items, itemInlines, meta } = extractListItems(events, index + 1, end);
        if (items.length > 0) {
          const list = createList(items, tag === "ol", meta);
          if (itemInlines.some((entry) => entry.length > 0)) {
            list.itemInlines = itemInlines;
          }
          blocks.push(list);
        }
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
        const inlines = sliceInline(events, index + 1, end);
        pushBlockFromInlines((plain) => createParagraph(plain), inlines);
      } else if (tag === "li" || tag === "thead" || tag === "tbody" || tag === "tfoot" || tag === "tr" || tag === "th" || tag === "td" || tag === "figcaption") {
        // 应当被父级 block 处理；如果遇到孤立的，按段落降级
        const inlines = sliceInline(events, index + 1, end);
        pushBlockFromInlines((plain) => createParagraph(plain), inlines);
      } else {
        const inner = events.slice(index + 1, end);
        const innerBlocks = readBlocksFromEvents(inner);
        if (innerBlocks.length > 0) {
          blocks.push(...innerBlocks);
        } else {
          const inlines = sliceInline(events, index + 1, end);
          pushBlockFromInlines((plain) => createParagraph(plain), inlines);
        }
      }

      index = end + 1;
      continue;
    }

    // 顶层 inline：累积到段落缓冲（保留 events 而非字符串，flush 时再产 inlines）
    const closeIndex = findClosingIndex(events, index + 1, tag);
    const end = closeIndex === -1 ? events.length : closeIndex;
    for (let i = index; i <= end && i < events.length; i += 1) {
      paragraphBuffer.push(events[i]);
    }
    index = end + 1;
  }

  flushParagraph();
  return blocks;
}

function extractBodyHtml(source) {
  let text = String(source ?? "")
    // 修复 issue #58: 处理未闭合的 script/style/noscript 标签
    .replace(/<script\b[^>]*>([\s\S]*?)(?:<\/script>|$)/gi, "")
    .replace(/<style\b[^>]*>([\s\S]*?)(?:<\/style>|$)/gi, "")
    .replace(/<noscript\b[^>]*>([\s\S]*?)(?:<\/noscript>|$)/gi, "");
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
    const fallbackInlines = sliceInline(tokenizeHtml(body), 0, Number.POSITIVE_INFINITY);
    const fallback = inlinesPlainTextTrimmed(fallbackInlines);
    if (fallback) {
      const block = createParagraph(fallback);
      if (fallbackInlines.length > 0) block.inlines = fallbackInlines;
      blocks.push(block);
    }
  }
  return createDocumentModel({ title, sourceFormat: format, blocks });
}

export function renderHtmlDocument({ bodyHtml, title = "document" }) {
  const formattedBody = String(bodyHtml || "")
    .split("\n")
    .map((line) => line ? `      ${line}` : "")
    .join("\n");
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
    <main>
${formattedBody}
    </main>
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
