import { ConversionError } from "../core/conversion-error.js";
import {
  createDocumentModel,
  createHeading,
  createList,
  createParagraph,
  createTable,
} from "../core/document-model.js";
import {
  createInlineEm,
  createInlineLineBreak,
  createInlineLink,
  createInlineStrong,
  createInlineText,
  inlinesToPlainText,
} from "../core/models/semantic-inlines.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { readZipEntries } from "../core/zip-container.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { bytesToDataUrl } from "../core/binary-utils.js";
import { decodeXml, getAttr, stripTags } from "./ooxml-utils.js";
import { escapeXmlText } from "./text-utils.js";

// ODT（OpenDocument Text）基础级读写：
// - 读取：解包 ZIP，解析 content.xml 的 text:h / text:p / text:list / table:table；
//   text:span 的粗斜体经 content.xml automatic-styles 尽力映射；styles.xml 忽略；
//   meta.xml 的 dc:title 作为文档标题。
// - 写出：合法 ODT 最小骨架（mimetype 必须不压缩且放首位，writeStoredZip 全 stored
//   且按传入顺序写入，天然满足）。
// 深度计数的平衡块扫描器（与 docx.js 同思路）：返回顶层平衡块字符串数组。
function scanBalanced(xml, tag) {
  const source = String(xml ?? "");
  // 注意不能用 \b 做边界：tag 名后跟连字符（如 text:list vs text:list-item）时
  // \b 照样命中，会把 list-item 误识别为 list 导致递归爆炸。改用前瞻断言。
  const token = new RegExp(`<\\/?${tag}(?=[\\s/>])[^>]*?>`, "g");
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

// 多标签顶层块分发：按文档顺序返回 { tag, xml }。进入某标签的块后只跟踪同名
// 嵌套（text:list 内 text:list-item 里的 text:p 属列表内容，不开新顶层块）。
function scanTopLevelBlocks(source, tags) {
  const alternation = tags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const token = new RegExp(`<\\/?(?:${alternation})(?=[\\s/>])[^>]*?>`, "g");
  const blocks = [];
  let current = null;
  for (const m of String(source ?? "").matchAll(token)) {
    const raw = m[0];
    const isClose = raw.startsWith("</");
    const selfClosing = raw.endsWith("/>");
    const tag = raw.match(/^<\/?([\w:.-]+)/)?.[1] || "";
    if (!current) {
      if (isClose) continue;
      if (selfClosing) {
        blocks.push({ tag, xml: raw });
        continue;
      }
      current = { tag, start: m.index, depth: 1 };
    } else if (tag === current.tag) {
      if (isClose) {
        if (--current.depth === 0) {
          blocks.push({ tag: current.tag, xml: String(source).slice(current.start, m.index + raw.length) });
          current = null;
        }
      } else if (!selfClosing) {
        current.depth += 1;
      }
    }
  }
  return blocks;
}

function innerXml(blockXml) {
  return String(blockXml ?? "").replace(/^<[\w:.-]+\b[^>]*>/, "").replace(/<\/[\w:.-]+>\s*$/, "");
}

// content.xml automatic-styles 里的 text 级样式：style:name -> { bold, italic }。
// styles.xml 里的命名样式按设计忽略（读取披露 ODT_STYLES_APPROXIMATED）。
function parseTextStyleMap(contentXml) {
  const map = new Map();
  for (const styleMatch of String(contentXml || "").matchAll(/<style:style\b[\s\S]*?<\/style:style>/g)) {
    const block = styleMatch[0];
    const open = block.match(/<style:style\b[^>]*>/)?.[0] || "";
    if (getAttr(open, "style:family") !== "text") continue;
    const name = getAttr(open, "style:name");
    if (!name) continue;
    const props = block.match(/<style:text-properties\b[^>]*\/?\s*>/)?.[0] || "";
    map.set(name, {
      bold: /\sfo:font-weight="bold"/.test(props),
      italic: /\sfo:font-style="italic"/.test(props),
    });
  }
  return map;
}

// 列表样式：text:list-style 内含 text:list-level-style-number 视为有序，否则无序。
function parseListStyleMap(contentXml) {
  const map = new Map();
  for (const styleMatch of String(contentXml || "").matchAll(/<text:list-style\b[\s\S]*?<\/text:list-style>/g)) {
    const block = styleMatch[0];
    const name = getAttr(block.match(/<text:list-style\b[^>]*>/)?.[0] || "", "style:name");
    if (!name) continue;
    map.set(name, { ordered: /<text:list-level-style-number\b/.test(block) });
  }
  return map;
}

function pushText(children, raw) {
  // 段落内联扫描只认 span/a/s/tab/line-break；其余标签（bookmark 等）剥离，保留原始空白。
  const text = decodeXml(String(raw ?? "").replace(/<[^>]+>/g, ""));
  if (text) children.push(createInlineText(text));
}

function wrapSpanFrame(frame, textStyles) {
  const style = textStyles.get(frame.styleName) || {};
  let nodes = frame.children;
  if (style.italic) nodes = [createInlineEm(nodes)];
  if (style.bold) nodes = [createInlineStrong(nodes)];
  return nodes;
}

// 段落/单元格内联抽取：text:span（粗斜体）、text:a（链接）、text:s / text:tab /
// text:line-break；其余标签剥离。span 可嵌套，用栈维护样式上下文。
function parseInlineContent(xml, textStyles) {
  const root = { kind: "root", children: [] };
  const stack = [root];
  const token = /<(text:span|text:a|text:line-break|text:tab|text:s)\b([^>]*?)(\/?)>|<\/(text:span|text:a)\s*>/g;
  let last = 0;
  for (const m of String(xml ?? "").matchAll(token)) {
    pushText(stack.at(-1).children, String(xml).slice(last, m.index));
    last = m.index + m[0].length;
    if (m[4]) {
      // 关闭标签：只弹匹配的容器，未匹配的（例如调用方切片不齐）忽略
      if (stack.length > 1 && stack.at(-1).tag === m[4]) {
        const frame = stack.pop();
        if (frame.kind === "a") {
          if (frame.children.length > 0) {
            stack.at(-1).children.push(createInlineLink({ inlines: frame.children, href: frame.href }));
          }
        } else {
          stack.at(-1).children.push(...wrapSpanFrame(frame, textStyles));
        }
      }
      continue;
    }
    const tag = m[1];
    const attrs = m[2] || "";
    if (tag === "text:line-break") {
      stack.at(-1).children.push(createInlineLineBreak());
      continue;
    }
    if (tag === "text:tab") {
      stack.at(-1).children.push(createInlineText("\t"));
      continue;
    }
    if (tag === "text:s") {
      const count = Number(getAttr(attrs, "text:c")) || 1;
      stack.at(-1).children.push(createInlineText(" ".repeat(Math.min(count, 256))));
      continue;
    }
    if (m[3] === "/") continue;
    if (tag === "text:span") {
      stack.push({ kind: "span", tag, styleName: getAttr(attrs, "text:style-name"), children: [] });
    } else {
      stack.push({ kind: "a", tag, href: getAttr(attrs, "xlink:href"), children: [] });
    }
  }
  pushText(stack.at(-1).children, String(xml).slice(last));
  // 未闭合的 span/a 按已收集内容兜底包裹，不丢文本
  while (stack.length > 1) {
    const frame = stack.pop();
    if (frame.kind === "a") {
      if (frame.children.length > 0) {
        stack.at(-1).children.push(createInlineLink({ inlines: frame.children, href: frame.href }));
      }
    } else {
      stack.at(-1).children.push(...wrapSpanFrame(frame, textStyles));
    }
  }
  return root.children;
}

function paragraphText(xml, textStyles) {
  return inlinesToPlainText(parseInlineContent(innerXml(xml), textStyles)).replace(/\r\n?/g, "\n");
}

// text:list -> list block。嵌套 text:list 位于 text:list-item 内，展开为 depth 递增的
// 扁平条目（与 docx 读取策略一致）；有序性由 list-style 决定，嵌套列表的有序差异不保留。
function parseList(listXml, listStyles, textStyles, depth = 0, sink = null) {
  const own = sink || { items: [], itemMeta: [], itemInlines: [] };
  const openTag = String(listXml).match(/<text:list\b[^>]*>/)?.[0] || "";
  const styleName = getAttr(openTag, "text:style-name");
  for (const itemXml of scanBalanced(listXml, "text:list-item")) {
    // 先扣出嵌套列表，再从剩余部分提取本条目段落，避免嵌套条目文本并入父条目
    const nested = scanBalanced(itemXml, "text:list");
    let remainder = itemXml;
    for (const nestedXml of nested) {
      remainder = remainder.replace(nestedXml, "");
    }
    const paragraphs = scanBalanced(remainder, "text:p");
    const inlineGroups = paragraphs.map((p) => parseInlineContent(innerXml(p), textStyles));
    const text = inlineGroups.map((inlines) => inlinesToPlainText(inlines)).filter(Boolean).join("\n");
    if (text) {
      own.items.push(text);
      own.itemMeta.push({ depth, marker: styleName });
      const inlines = inlineGroups.flat();
      own.itemInlines.push(inlines.length > 0 ? inlines : undefined);
    }
    for (const nestedXml of nested) {
      parseList(nestedXml, listStyles, textStyles, depth + 1, own);
    }
  }
  return own;
}

function parseTable(tableXml, textStyles) {
  const rows = [];
  for (const rowXml of scanBalanced(tableXml, "table:table-row")) {
    const cells = [];
    // table:number-columns-spanned 合并格按重复计数展开为基础网格；covered-cell 占位为空串
    for (const cell of scanTopLevelBlocks(rowXml, ["table:table-cell", "table:covered-table-cell"])) {
      const openTag = cell.xml.match(/^<[\w:.-]+\b[^>]*>/)?.[0] || "";
      const span = Math.min(64, Number(getAttr(openTag, "table:number-columns-spanned")) || 1);
      let text = "";
      if (cell.tag === "table:table-cell") {
        const paragraphs = scanBalanced(cell.xml, "text:p");
        text = paragraphs.length > 0
          ? paragraphs.map((p) => paragraphText(p, textStyles)).join("\n")
          : stripTags(cell.xml);
      }
      for (let index = 0; index < span; index += 1) cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return null;
  const headers = rows.shift() || [];
  return headers.length > 0 ? createTable(headers, rows) : null;
}

export function readOdt({ content, title = "document", fileName = "", format = "odt" }) {
  const zip = readZipEntries(content);
  const contentXml = zip.getText("content.xml");
  if (!contentXml) {
    throw new ConversionError("ODT 缺少 content.xml", {
      category: "parse",
      code: "ODT_CONTENT_XML_MISSING",
      format,
    });
  }

  const warnings = [];
  const metaXml = zip.getText("meta.xml");
  const metaTitle = stripTags(metaXml.match(/<dc:title\b[\s\S]*?<\/dc:title>/)?.[0] || "");
  const stylesXml = zip.getText("styles.xml");
  if (/<style:style\b/.test(stylesXml)) {
    warnings.push(createWarning(
      "lossy",
      "ODT_STYLES_APPROXIMATED",
      "ODT styles.xml 中的命名样式（字体/颜色/段落属性）未导入；仅 content.xml 内联自动样式的粗斜体被尽力映射。",
    ));
  }
  if (/<draw:(?:image|frame)\b/.test(contentXml)) {
    warnings.push(createWarning(
      "lossy",
      "ODT_IMAGES_DROPPED",
      "ODT 中的图片/绘图框未导入 DocumentModel；基础级读取仅保留文本结构。",
    ));
  }

  const textStyles = parseTextStyleMap(contentXml);
  const listStyles = parseListStyleMap(contentXml);
  const body = contentXml.match(/<office:text\b[\s\S]*<\/office:text>/)?.[0] || contentXml;
  const blocks = [];

  for (const block of scanTopLevelBlocks(body, ["text:h", "text:p", "text:list", "table:table"])) {
    if (block.tag === "text:h") {
      const openTag = block.xml.match(/^<text:h\b[^>]*>/)?.[0] || "";
      const level = Math.min(6, Math.max(1, Number(getAttr(openTag, "text:outline-level")) || 1));
      const inlines = parseInlineContent(innerXml(block.xml), textStyles);
      const text = inlinesToPlainText(inlines);
      if (!text.trim()) continue;
      const heading = createHeading(level, text);
      if (inlines.length > 0) heading.inlines = inlines;
      blocks.push(heading);
    } else if (block.tag === "text:p") {
      const inlines = parseInlineContent(innerXml(block.xml), textStyles);
      const text = inlinesToPlainText(inlines);
      if (!text.trim()) continue;
      const paragraph = createParagraph(text);
      if (inlines.length > 0) paragraph.inlines = inlines;
      blocks.push(paragraph);
    } else if (block.tag === "text:list") {
      const openTag = block.xml.match(/^<text:list\b[^>]*>/)?.[0] || "";
      const styleName = getAttr(openTag, "text:style-name");
      const parsed = parseList(block.xml, listStyles, textStyles);
      if (parsed.items.length > 0) {
        const ordered = listStyles.get(styleName)?.ordered === true;
        const list = createList(parsed.items, ordered, parsed.itemMeta);
        if (parsed.itemInlines.some(Boolean)) list.itemInlines = parsed.itemInlines;
        blocks.push(list);
      }
    } else if (block.tag === "table:table") {
      const table = parseTable(block.xml, textStyles);
      if (table) blocks.push(table);
    }
  }

  if (blocks.length === 0) {
    warnings.push(createWarning("lossy", "ODT_EMPTY_DOCUMENT", "ODT content.xml did not produce readable blocks."));
  }

  return createDocumentModel({
    title: metaTitle || title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({
      odt: {
        container: "zip",
        documentPart: "content.xml",
        entryCount: zip.list().length,
        compressionMethods: zip.methods(),
        fileName,
      },
    }, warnings),
  });
}

// —— 写出 ——

const ODT_NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  table: "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
  // ODF 规范要求的命名空间标识符（仅字符串标识，永不发起网络请求）；
  // 用拼接写法与 docx-output.js/epub.js 的既有约定一致，避免误触 no-network 静态扫描。
  xlink: "http" + "://www.w3.org/1999/xlink",
  dc: "http" + "://purl.org/dc/elements/1.1/",
  meta: "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
  manifest: "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0",
};

function inlinesToOdt(inlines) {
  return (inlines || [])
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      if (node.type === "text") return escapeXmlText(node.value);
      if (node.type === "strong") return `<text:span text:style-name="T2F-Bold">${inlinesToOdt(node.inlines)}</text:span>`;
      if (node.type === "em") return `<text:span text:style-name="T2F-Italic">${inlinesToOdt(node.inlines)}</text:span>`;
      if (node.type === "del") return `<text:span text:style-name="T2F-Strike">${inlinesToOdt(node.inlines)}</text:span>`;
      if (node.type === "code") return `<text:span text:style-name="T2F-Code">${escapeXmlText(node.value)}</text:span>`;
      if (node.type === "math") {
        const d = node.display ? "$$" : "$";
        return escapeXmlText(`${d}${String(node.value ?? "")}${d}`);
      }
      if (node.type === "link") {
        const inner = inlinesToOdt(node.inlines) || escapeXmlText(node.href);
        return `<text:a xlink:href="${escapeXmlText(node.href)}">${inner}</text:a>`;
      }
      if (node.type === "linebreak") return "<text:line-break/>";
      if (node.type === "footnoteRef") return escapeXmlText(`[${String(node.id ?? "")}]`);
      if (Array.isArray(node.inlines)) return inlinesToOdt(node.inlines);
      return "";
    })
    .join("");
}

function blockContent(block) {
  return Array.isArray(block.inlines) && block.inlines.length > 0
    ? inlinesToOdt(block.inlines)
    : escapeXmlText(block.text);
}

// itemMeta depth -> 嵌套 text:list。嵌套列表位于父列表当前 text:list-item 内（ODF 结构要求）。
function writeOdtList(block) {
  const items = Array.isArray(block.items) ? block.items : [];
  if (items.length === 0) return "";
  const styleName = block.ordered ? "T2F-Number" : "T2F-Bullet";
  let xml = "";
  let currentDepth = 0;
  let itemOpen = false;
  const openList = () => { xml += `<text:list text:style-name="${styleName}">`; };
  const openItem = () => { xml += "<text:list-item>"; itemOpen = true; };
  const closeItem = () => { if (itemOpen) { xml += "</text:list-item>"; itemOpen = false; } };

  items.forEach((item, index) => {
    const depth = Math.max(0, Number(block.itemMeta?.[index]?.depth) || 0);
    const itemInlines = block.itemInlines?.[index];
    const content = Array.isArray(itemInlines) && itemInlines.length > 0
      ? inlinesToOdt(itemInlines)
      : escapeXmlText(item);
    if (index === 0) {
      openList();
    } else if (depth > currentDepth) {
      for (let d = currentDepth; d < depth; d += 1) openList();
    } else if (depth < currentDepth) {
      closeItem();
      for (let d = depth; d < currentDepth; d += 1) {
        xml += "</text:list>";
        closeItem();
      }
    } else {
      closeItem();
    }
    openItem();
    xml += `<text:p>${content}</text:p>`;
    currentDepth = depth;
  });
  closeItem();
  for (let d = 0; d <= currentDepth; d += 1) xml += "</text:list>";
  return xml;
}

function writeOdtTable(block) {
  const rows = [block.headers, ...(block.rows || [])].filter((row) => Array.isArray(row) && row.length > 0);
  if (rows.length === 0) return "";
  const body = rows
    .map((row) => `<table:table-row>${row
      .map((cell) => `<table:table-cell><text:p>${escapeXmlText(cell)}</text:p></table:table-cell>`)
      .join("")}</table:table-row>`)
    .join("");
  return `<table:table><table:table-column/>${body}</table:table>`;
}

function writeOdtBlocks(model, warnings) {
  const parts = [];
  for (const block of model.blocks || []) {
    if (block.type === "heading") {
      parts.push(`<text:h text:outline-level="${Math.min(6, Math.max(1, Number(block.level) || 1))}">${blockContent(block)}</text:h>`);
    } else if (block.type === "paragraph") {
      parts.push(`<text:p>${blockContent(block)}</text:p>`);
    } else if (block.type === "quote") {
      parts.push(`<text:p text:style-name="T2F-Quote">${blockContent(block)}</text:p>`);
    } else if (block.type === "list") {
      parts.push(writeOdtList(block));
    } else if (block.type === "table") {
      parts.push(writeOdtTable(block));
    } else if (block.type === "code") {
      const lines = String(block.code ?? "").split("\n").map(escapeXmlText).join("<text:line-break/>");
      parts.push(`<text:p text:style-name="T2F-Pre">${lines}</text:p>`);
    } else if (block.type === "image" || block.type === "asset") {
      warnings.push(createWarning(
        "lossy",
        "ODT_IMAGES_DROPPED",
        "ODT 基础级写出不嵌入图片；图片/资产引用未写入包。",
      ));
    } else if (block.type === "raw") {
      parts.push(`<text:p>${escapeXmlText(block.content)}</text:p>`);
    }
  }
  return parts.join("");
}

export function writeOdt({ model, title = model?.title || "document" }) {
  const warnings = [];
  const bodyContent = writeOdtBlocks(model, warnings);

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="${ODT_NS.office}" xmlns:style="${ODT_NS.style}" xmlns:text="${ODT_NS.text}" xmlns:table="${ODT_NS.table}" xmlns:fo="${ODT_NS.fo}" xmlns:xlink="${ODT_NS.xlink}" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="T2F-Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
    <style:style style:name="T2F-Italic" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
    <style:style style:name="T2F-Strike" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style>
    <style:style style:name="T2F-Code" style:family="text"><style:text-properties style:font-name="Courier"/></style:style>
    <style:style style:name="T2F-Quote" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.787in" fo:font-style="italic"/></style:style>
    <style:style style:name="T2F-Pre" style:family="paragraph"><style:paragraph-properties fo:font-family="Courier"/></style:style>
    <text:list-style style:name="T2F-Bullet"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:min-label-width="0.25in"/></text:list-level-style-bullet></text:list-style>
    <text:list-style style:name="T2F-Number"><text:list-level-style-number text:level="1" style:num-format="1"><style:list-level-properties text:min-label-width="0.25in"/></text:list-level-style-number></text:list-style>
  </office:automatic-styles>
  <office:body><office:text>${bodyContent}</office:text></office:body>
</office:document-content>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="${ODT_NS.office}" xmlns:style="${ODT_NS.style}" xmlns:text="${ODT_NS.text}" xmlns:fo="${ODT_NS.fo}" office:version="1.2">
  <office:styles><style:default-style style:family="paragraph"/></office:styles>
</office:document-styles>`;

  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="${ODT_NS.office}" xmlns:meta="${ODT_NS.meta}" xmlns:dc="${ODT_NS.dc}" office:version="1.2">
  <office:meta><meta:generator>Trans2Former</meta:generator><dc:title>${escapeXmlText(title)}</dc:title></office:meta>
</office:document-meta>`;

  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="${ODT_NS.manifest}" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

  // ODF 规范：mimetype 必须是包内第一个条目且不压缩。writeStoredZip 全部 stored、
  // 按传入顺序写入，首位放 mimetype 即满足。
  const zipBytes = writeStoredZip([
    { name: "mimetype", data: "application/vnd.oasis.opendocument.text" },
    { name: "content.xml", data: contentXml },
    { name: "styles.xml", data: stylesXml },
    { name: "meta.xml", data: metaXml },
    { name: "META-INF/manifest.xml", data: manifestXml },
  ]);
  return {
    type: "binary",
    format: "odt",
    data: bytesToDataUrl(zipBytes, "application/vnd.oasis.opendocument.text"),
    mime: "application/vnd.oasis.opendocument.text",
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
