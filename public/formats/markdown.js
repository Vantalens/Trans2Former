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
import { inlinesToHtml, inlinesToMarkdown } from "../core/models/semantic-inlines.js";
import { getInlineTokens } from "./inline-tokens.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { escapeHtml, normalizeNewlines } from "./text-utils.js";

// 所有 writer 共用统一 inline 流水线：优先消费 reader 已存的 block.inlines，
// 否则用 getInlineTokens 从 block.text 解析 markdown 内联（识别 ~~del~~、粗斜体、
// 带 title 的 link 等），再转成目标格式。
function blockTextToMarkdown(block) {
  return inlinesToMarkdown(getInlineTokens(block));
}

function blockTextToHtml(block) {
  return inlinesToHtml(getInlineTokens(block));
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

    // 引用块识别：连续的以 `>` 开头的行（含纯 `>` 的段落分隔行、`>>` 的嵌套行）
    // 合并到同一个 quote 块；段落分隔用空字符串保留，行间空格连接。
    if (/^>\s*/.test(line)) {
      flushParagraph();
      flushList();
      const quoteLines = [];
      while (lineIndex < lines.length) {
        const candidate = lines[lineIndex];
        if (!/^>\s*/.test(candidate)) break;
        const stripped = candidate.replace(/^>\s?/, "");
        // 段落分隔行（`>` 后空白）→ 用一个空字符串表示段落边界
        if (stripped.trim() === "") {
          quoteLines.push("");
        } else {
          quoteLines.push(stripped);
        }
        lineIndex += 1;
      }
      lineIndex -= 1;
      // 把分段后的多段连成单个 quote.text（段落间用空格分隔，保证不丢内容）
      const merged = quoteLines.filter((l) => l !== "").join(" ");
      if (merged) blocks.push(createQuote(merged));
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

export function writeMarkdown({ model, options = {} }) {
  const profile = String(options.profile || "ai-ready").toLowerCase();
  const includeArchiveSummary = profile === "archive";
  const keepStrictRoundTripHints = profile === "strict-round-trip";
  const markdown = model.blocks
    .map((block) => {
      if (block.type === "heading") {
        return `${"#".repeat(block.level)} ${blockTextToMarkdown(block)}`;
      }
      if (block.type === "paragraph") {
        return blockTextToMarkdown(block);
      }
      if (block.type === "quote") {
        return `> ${blockTextToMarkdown(block)}`;
      }
      if (block.type === "list") {
        // 有序列表编号只对 depth=0 的项递增，子项用 "-"，避免跨嵌套子项跳号
        // （例如 1. → 2. → [嵌套子项] → 5. 应该是 3.）
        let orderedCounter = 0;
        return block.items.map((item, index) => {
          const depth = Math.max(0, Number(block.itemMeta?.[index]?.depth) || 0);
          const indent = "  ".repeat(depth);
          let marker = "-";
          if (block.ordered && depth === 0) {
            orderedCounter += 1;
            marker = `${orderedCounter}.`;
          }
          const itemInlines = Array.isArray(block.itemInlines?.[index]) && block.itemInlines[index].length > 0
            ? block.itemInlines[index]
            : getInlineTokens({ text: item });
          return `${indent}${marker} ${inlinesToMarkdown(itemInlines)}`;
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
        if (block.format === "md" || block.format === "markdown") {
          return block.content;
        }
        if (block.format === "html") {
          return "";
        }
        const fenceLang = String(block.format || "").replace(/[^a-zA-Z0-9_+\-]/g, "");
        return `\`\`\`${fenceLang}\n${block.content}\n\`\`\``;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  const archiveSummary = includeArchiveSummary
    ? [
      "",
      "---",
      `title: ${String(model.title || "document")}`,
      `source-format: ${String(model.sourceFormat || "md")}`,
      `blocks: ${model.blocks.length}`,
      `warnings: ${(model.metadata?.warnings || []).length}`,
      "---",
    ].join("\n")
    : "";

  const strictHints = keepStrictRoundTripHints
    ? [
      "",
      `<!-- round-trip: ${String(model.sourceFormat || "md")} -->`,
      ...(model.metadata?.warnings || []).map((warning) => `<!-- warning:${warning.code} -->`),
    ].join("\n")
    : "";

  return {
    type: "text",
    format: "md",
    data: `${markdown.trim()}${archiveSummary}${strictHints}\n`,
    mime: "text/markdown;charset=utf-8",
  };
}

export function blockToHtml(block) {
  if (block.type === "heading") {
    return `<h${block.level}>${blockTextToHtml(block)}</h${block.level}>`;
  }
  if (block.type === "paragraph") {
    return `<p>${blockTextToHtml(block)}</p>`;
  }
  if (block.type === "quote") {
    return `<blockquote>${blockTextToHtml(block)}</blockquote>`;
  }
  if (block.type === "list") {
    return listBlockToHtml(block);
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
    const head = [
      "  <thead>",
      `    <tr>${block.headers.map((cell, index) => `<th${alignAttr(index)}>${escapeHtml(cell)}</th>`).join("")}</tr>`,
      "  </thead>",
    ].join("\n");
    const body = [
      "  <tbody>",
      ...block.rows.map((row) => `    <tr>${row.map((cell, index) => `<td${alignAttr(index)}>${escapeHtml(cell)}</td>`).join("")}</tr>`),
      "  </tbody>",
    ].join("\n");
    return `<table>\n${head}\n${body}\n</table>`;
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
  if (block.type === "raw" && block.format && block.format !== "md" && block.format !== "markdown") {
    const lang = String(block.format).replace(/[^a-zA-Z0-9_+\-]/g, "");
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
    return `<pre><code${langClass}>${escapeHtml(block.content)}</code></pre>`;
  }
  return "";
}

function listBlockToHtml(block) {
  const items = block.items || [];
  const meta = block.itemMeta || [];
  const itemHtml = (index) => {
    const itemInlines = Array.isArray(block.itemInlines?.[index]) && block.itemInlines[index].length > 0
      ? block.itemInlines[index]
      : getInlineTokens({ text: items[index] });
    return inlinesToHtml(itemInlines);
  };
  const depthAt = (index) => Math.max(0, Number(meta[index]?.depth) || 0);
  const tagForDepth = (depth) => (block.ordered && depth === 0 ? "ol" : "ul");

  function renderAt(startIndex, depth, indentLevel) {
    const tag = tagForDepth(depth);
    const lines = [`${"  ".repeat(indentLevel)}<${tag}>`];
    let index = startIndex;
    while (index < items.length) {
      const itemDepth = depthAt(index);
      if (itemDepth < depth) break;
      if (itemDepth > depth) {
        const nested = renderAt(index, itemDepth, indentLevel + 1);
        lines.push(...nested.lines);
        index = nested.nextIndex;
        continue;
      }

      let inner = itemHtml(index);
      index += 1;
      if (index < items.length && depthAt(index) > depth) {
        const nested = renderAt(index, depthAt(index), indentLevel + 2);
        inner = `${inner}\n${nested.lines.join("\n")}\n${"  ".repeat(indentLevel + 1)}`;
        index = nested.nextIndex;
      }
      lines.push(`${"  ".repeat(indentLevel + 1)}<li>${inner}</li>`);
    }
    lines.push(`${"  ".repeat(indentLevel)}</${tag}>`);
    return { lines, nextIndex: index };
  }

  return renderAt(0, 0, 0).lines.join("\n");
}

export function modelToBodyHtml(model) {
  return model.blocks.map(blockToHtml).filter(Boolean).join("\n");
}
