import { ConversionError } from "../core/conversion-error.js";
import { createDocumentModel, createParagraph, createRawBlock } from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { escapeHtml, stripHtml } from "./text-utils.js";

function parseAttributes(rawAttributes = "") {
  const attributes = {};
  const namespaces = [];
  const attributePattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attributePattern.exec(rawAttributes))) {
    const name = match[1];
    const value = match[3] ?? match[4] ?? "";
    if (name === "xmlns" || name.startsWith("xmlns:")) {
      namespaces.push({
        prefix: name.includes(":") ? name.split(":").slice(1).join(":") : "",
        uri: value,
      });
    } else {
      attributes[name] = value;
    }
  }
  return { attributes, namespaces };
}

function formatOpenTag(tagName, attributes) {
  const attributeText = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
  return `<${tagName}${attributeText}>`;
}

function parserError(message, format) {
  return new ConversionError(`XML 解析失败: ${message}`, {
    category: "parse",
    code: "XML_PARSE_ERROR",
    format,
  });
}

function parseXmlSummary(source, format) {
  const lines = [];
  const stack = [];
  const metadata = {
    rootElement: "",
    namespaces: [],
    attributes: {},
  };
  const warnings = [];
  const tokenPattern = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[^>]+>|[^<]+/g;
  let match;

  while ((match = tokenPattern.exec(source))) {
    const token = match[0];
    if (!token || token.startsWith("<?") || token.startsWith("<!--")) {
      continue;
    }
    if (token.startsWith("<![CDATA[")) {
      const text = token.slice(9, -3).trim();
      if (text) lines.push(`${"  ".repeat(stack.length)}${text}`);
      continue;
    }
    if (!token.startsWith("<")) {
      const text = token.trim();
      if (text) lines.push(`${"  ".repeat(stack.length)}${text}`);
      continue;
    }
    if (token.startsWith("</")) {
      const closingName = token.slice(2, -1).trim();
      const openName = stack.pop();
      if (openName !== closingName) {
        throw parserError(`expected </${openName || "none"}> but found </${closingName}>`, format);
      }
      continue;
    }

    const selfClosing = token.endsWith("/>");
    const body = token.slice(1, selfClosing ? -2 : -1).trim();
    const [tagName = "", ...rest] = body.split(/\s+/);
    if (!tagName) {
      throw parserError("empty tag name", format);
    }
    const rawAttributes = rest.join(" ");
    const parsed = parseAttributes(rawAttributes);
    if (!metadata.rootElement) {
      metadata.rootElement = tagName;
    }
    if (parsed.namespaces.length > 0) {
      metadata.namespaces.push(...parsed.namespaces);
    }
    if (Object.keys(parsed.attributes).length > 0) {
      metadata.attributes[tagName] = {
        ...(metadata.attributes[tagName] || {}),
        ...parsed.attributes,
      };
    }
    lines.push(`${"  ".repeat(stack.length)}${formatOpenTag(tagName, parsed.attributes)}`);
    if (!selfClosing) {
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    throw parserError(`unclosed tag <${stack.at(-1)}>`, format);
  }
  if (!metadata.rootElement) {
    throw parserError("missing root element", format);
  }
  if (Object.keys(metadata.attributes).length > 0) {
    warnings.push(createWarning("info", "XML_ATTRIBUTES_EXTRACTED", "XML attributes were extracted into metadata and readable preview text."));
  }

  return { text: lines.join("\n"), metadata, warnings };
}

function walkXmlNode(node, depth = 0, lines = []) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    if (text) lines.push(`${"  ".repeat(depth)}${text}`);
    return lines;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return lines;
  }
  const attributes = Object.fromEntries(Array.from(node.attributes || [])
    .filter((attribute) => attribute.name !== "xmlns" && !attribute.name.startsWith("xmlns:"))
    .map((attribute) => [attribute.name, attribute.value]));
  lines.push(`${"  ".repeat(depth)}${formatOpenTag(node.tagName, attributes)}`);
  Array.from(node.childNodes).forEach((child) => walkXmlNode(child, depth + 1, lines));
  return lines;
}

function extractDomMetadata(root) {
  const namespaces = [];
  const attributes = {};
  Array.from(root.querySelectorAll("*")).concat(root).forEach((element) => {
    const parsed = parseAttributes(Array.from(element.attributes || [])
      .map((attribute) => `${attribute.name}="${attribute.value}"`)
      .join(" "));
    if (parsed.namespaces.length > 0) namespaces.push(...parsed.namespaces);
    if (Object.keys(parsed.attributes).length > 0) {
      attributes[element.tagName] = {
        ...(attributes[element.tagName] || {}),
        ...parsed.attributes,
      };
    }
  });
  return { namespaces, attributes };
}

export function readXml({ content, title = "xml", format = "xml" }) {
  const source = String(content ?? "");
  if (typeof DOMParser === "undefined") {
    const parsed = parseXmlSummary(source, format);
    return createDocumentModel({
      title,
      sourceFormat: format,
      blocks: [createRawBlock("xml", source), createParagraph(parsed.text || stripHtml(source))],
      metadata: withWarnings({ rawXml: source, ...parsed.metadata }, parsed.warnings),
    });
  }

  const doc = new DOMParser().parseFromString(source, "application/xml");
  const parserErrorNode = doc.querySelector("parsererror");
  if (parserErrorNode) {
    throw parserError(parserErrorNode.textContent.trim(), format);
  }
  const text = walkXmlNode(doc.documentElement).join("\n");
  const domMetadata = extractDomMetadata(doc.documentElement);
  const warnings = Object.keys(domMetadata.attributes).length > 0
    ? [createWarning("info", "XML_ATTRIBUTES_EXTRACTED", "XML attributes were extracted into metadata and readable preview text.")]
    : [];
  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks: [createRawBlock("xml", source), createParagraph(text)],
    metadata: withWarnings({
      rootElement: doc.documentElement.tagName,
      namespaces: domMetadata.namespaces,
      attributes: domMetadata.attributes,
    }, warnings),
  });
}

export function writeXml({ model, title = model.title }) {
  const blocks = model.blocks.map((block, index) => {
    if (block.type === "heading") return `    <heading level="${block.level}">${escapeHtml(block.text)}</heading>`;
    if (block.type === "paragraph") return `    <paragraph>${escapeHtml(block.text)}</paragraph>`;
    if (block.type === "quote") return `    <quote>${escapeHtml(block.text)}</quote>`;
    if (block.type === "code") return `    <code language="${escapeHtml(block.language)}"><![CDATA[${block.code}]]></code>`;
    if (block.type === "table") {
      const header = `      <headers>${block.headers.map((cell) => `<cell>${escapeHtml(cell)}</cell>`).join("")}</headers>`;
      const rows = block.rows.map((row) => `      <row>${row.map((cell) => `<cell>${escapeHtml(cell)}</cell>`).join("")}</row>`).join("\n");
      return `    <table>\n${header}\n${rows}\n    </table>`;
    }
    if (block.type === "image") return `    <image src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" />`;
    if (block.type === "asset") return `    <asset-ref id="${escapeHtml(block.assetId)}" alt="${escapeHtml(block.alt)}" />`;
    if (block.type === "raw") return `    <raw index="${index}" format="${escapeHtml(block.format)}"><![CDATA[${block.content}]]></raw>`;
    return "";
  }).filter(Boolean).join("\n");

  return {
    type: "text",
    format: "xml",
    data: `<?xml version="1.0" encoding="UTF-8"?>\n<document schemaVersion="${model.schemaVersion}" title="${escapeHtml(title)}" sourceFormat="${escapeHtml(model.sourceFormat)}">\n  <blocks>\n${blocks}\n  </blocks>\n</document>\n`,
    mime: "application/xml;charset=utf-8",
  };
}
