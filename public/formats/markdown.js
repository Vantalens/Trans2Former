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
import { createWarning, withWarnings } from "../core/warnings.js";
import { escapeHtml, normalizeNewlines } from "./text-utils.js";

function inlineMarkdownToHtml(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[\^([^\]]+)\]/g, '<sup id="fnref-$1"><a href="#fn-$1">[$1]</a></sup>')
    .replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function markdownInlineFromText(text) {
  return String(text ?? "");
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableAlignments(line) {
  return splitTableRow(line).map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    if (trimmed.startsWith(":")) return "left";
    return "";
  });
}

function getListDepth(rawIndent) {
  const spaces = rawIndent.replaceAll("\t", "    ").length;
  return Math.floor(spaces / 2);
}

export function readMarkdown({ content, title = "document", format = "md" }) {
  const lines = normalizeNewlines(content).split("\n");
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listMeta = [];
  let listOrdered = false;
  let codeLines = [];
  let inCode = false;
  let codeLanguage = "";
  const warnings = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push(createParagraph(paragraph.join(" ")));
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push(createList(listItems, listOrdered, listMeta));
      listItems = [];
      listMeta = [];
      listOrdered = false;
    }
  }

  function flushCode() {
    blocks.push(createCodeBlock(codeLines.join("\n"), codeLanguage));
    codeLines = [];
    codeLanguage = "";
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const codeFence = line.match(/^```(\w+)?\s*$/);
    if (codeFence) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLanguage = codeFence[1] || "";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const footnoteDefinition = line.match(/^\[\^([^\]]+)\]:\s+(.+)$/);
    if (footnoteDefinition) {
      flushParagraph();
      flushList();
      const warning = createWarning(
        "info",
        "MARKDOWN_FOOTNOTE",
        "Markdown footnote was preserved as a readable quote and inline reference."
      );
      blocks.push({
        ...createQuote(`[${footnoteDefinition[1]}] ${footnoteDefinition[2]}`),
        warnings: [warning],
      });
      warnings.push(warning);
      continue;
    }

    const nextLine = lines[lineIndex + 1] || "";
    if (line.includes("|") && isTableSeparator(nextLine)) {
      flushParagraph();
      flushList();
      const headers = splitTableRow(line);
      const alignments = parseTableAlignments(nextLine);
      const rows = [];
      lineIndex += 2;
      while (lineIndex < lines.length && lines[lineIndex].includes("|") && lines[lineIndex].trim()) {
        rows.push(splitTableRow(lines[lineIndex]));
        lineIndex += 1;
      }
      lineIndex -= 1;
      blocks.push(createTable(headers, rows, alignments));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(createHeading(heading[1].length, heading[2]));
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^\)]+)\)$/);
    if (image) {
      flushParagraph();
      flushList();
      blocks.push(createImage({ alt: image[1], src: image[2] }));
      continue;
    }

    const list = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (list) {
      flushParagraph();
      const marker = list[2];
      if (listItems.length === 0) {
        listOrdered = /^\d+[.)]$/.test(marker);
      }
      listItems.push(list[3]);
      listMeta.push({ depth: getListDepth(list[1]), marker });
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(createQuote(quote[1]));
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (inCode) {
    flushCode();
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({}, warnings),
  });
}

export function writeMarkdown({ model }) {
  const markdown = model.blocks
    .map((block) => {
      if (block.type === "heading") {
        return `${"#".repeat(block.level)} ${markdownInlineFromText(block.text)}`;
      }
      if (block.type === "paragraph") {
        return markdownInlineFromText(block.text);
      }
      if (block.type === "quote") {
        return `> ${markdownInlineFromText(block.text)}`;
      }
      if (block.type === "list") {
        return block.items.map((item, index) => {
          const depth = Math.max(0, Number(block.itemMeta?.[index]?.depth) || 0);
          const indent = "  ".repeat(depth);
          const marker = block.ordered && depth === 0 ? `${index + 1}.` : "-";
          return `${indent}${marker} ${markdownInlineFromText(item)}`;
        }).join("\n");
      }
      if (block.type === "code") {
        return `\`\`\`${block.language || ""}\n${block.code}\n\`\`\``;
      }
      if (block.type === "table") {
        const headers = `| ${block.headers.join(" | ")} |`;
        const separator = `| ${block.headers.map((_, index) => {
          const alignment = block.alignments?.[index] || "";
          if (alignment === "left") return ":---";
          if (alignment === "center") return ":---:";
          if (alignment === "right") return "---:";
          return "---";
        }).join(" | ")} |`;
        const rows = block.rows.map((row) => `| ${row.join(" | ")} |`);
        return [headers, separator, ...rows].join("\n");
      }
      if (block.type === "image") {
        return `![${block.alt || ""}](${block.src || ""})`;
      }
      if (block.type === "asset") {
        return `![${block.alt || block.title || "asset"}](asset:${block.assetId})`;
      }
      if (block.type === "raw") {
        if (block.format !== "md" && block.format !== "markdown") {
          return "";
        }
        return block.content;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  return {
    type: "text",
    format: "md",
    data: `${markdown.trim()}\n`,
    mime: "text/markdown;charset=utf-8",
  };
}

export function blockToHtml(block) {
  if (block.type === "heading") {
    return `<h${block.level}>${inlineMarkdownToHtml(block.text)}</h${block.level}>`;
  }
  if (block.type === "paragraph") {
    return `<p>${inlineMarkdownToHtml(block.text)}</p>`;
  }
  if (block.type === "quote") {
    return `<blockquote>${inlineMarkdownToHtml(block.text)}</blockquote>`;
  }
  if (block.type === "list") {
    const tag = block.ordered ? "ol" : "ul";
    return `<${tag}>${block.items.map((item, index) => {
      const depth = Math.max(0, Number(block.itemMeta?.[index]?.depth) || 0);
      return `<li data-depth="${depth}">${inlineMarkdownToHtml(item)}</li>`;
    }).join("")}</${tag}>`;
  }
  if (block.type === "code") {
    const language = block.language ? ` class="language-${escapeHtml(block.language)}"` : "";
    return `<pre><code${language}>${escapeHtml(block.code)}</code></pre>`;
  }
  if (block.type === "table") {
    const alignAttr = (index) => {
      const alignment = block.alignments?.[index] || "";
      return alignment ? ` style="text-align:${alignment}"` : "";
    };
    const head = `<thead><tr>${block.headers.map((cell, index) => `<th${alignAttr(index)}>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`;
    const body = `<tbody>${block.rows.map((row) => `<tr>${row.map((cell, index) => `<td${alignAttr(index)}>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return `<table>${head}${body}</table>`;
  }
  if (block.type === "image") {
    return `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" />`;
  }
  if (block.type === "asset") {
    return `<figure data-asset-id="${escapeHtml(block.assetId)}"><figcaption>${escapeHtml(block.title || block.alt || block.assetId)}</figcaption></figure>`;
  }
  if (block.type === "raw" && block.format === "html") {
    return block.content;
  }
  return "";
}

export function modelToBodyHtml(model) {
  return model.blocks.map(blockToHtml).filter(Boolean).join("\n");
}
