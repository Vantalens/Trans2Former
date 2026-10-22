import {
  createCodeBlock,
  createDocumentModel,
  createHeading,
  createList,
  createParagraph,
  createQuote,
} from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { normalizeInlines } from "../core/models/semantic-inlines.js";
import { getCellInlineTokens, getInlineTokens } from "./inline-tokens.js";

// LaTeX 基础级读写：
// 读：\section 族 → heading、段落、itemize/enumerate → list、verbatim → code、
//     quote → quote；数学环境（$…$ / \[…\] / equation 等）原样保留为段落文本。
// 写：从 DocumentModel 生成基本 .tex 骨架（article + inputenc + amsmath）。

const SECTION_COMMANDS = {
  part: 1,
  chapter: 1,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5,
};

const LIST_ENVIRONMENTS = new Set(["itemize", "enumerate", "description"]);
const VERBATIM_ENVIRONMENTS = new Set(["verbatim", "lstlisting", "minted"]);
const MATH_ENVIRONMENTS = new Set(["equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "displaymath"]);
const SKIP_ENVIRONMENTS = new Set(["document", "abstract", "figure", "table", "tabular", "thebibliography", "titlepage"]);

function stripComments(line) {
  let result = "";
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "\\" && i + 1 < line.length) {
      result += line[i] + line[i + 1];
      i += 1;
      continue;
    }
    if (line[i] === "%") break;
    result += line[i];
  }
  return result;
}

// 剥离/展开常见行内命令：格式命令保留内部文本，转义字符还原字面量。
function flattenInline(text, warnings) {
  let out = String(text ?? "");
  // \verb|...| / \verb*|...|
  out = out.replace(/\\verb\*?(?=.)(.)([\s\S]*?)\1/g, (_, _delim, body) => body);
  // 常见单参数格式命令
  let previous;
  do {
    previous = out;
    out = out.replace(/\\(?:textbf|textit|textsl|textsc|textrm|textsf|texttt|emph|underline|mathbf|mathit|mathrm|text)\s*\{([^{}]*)\}/g, "$1");
  } while (out !== previous);
  // 转义字符
  out = out.replace(/\\([&%$#_{}])/g, "$1");
  out = out.replace(/\\textbackslash\s*\{\}/g, "\\");
  out = out.replace(/\\[,;:!]/g, " ");
  out = out.replace(/\\newline|\\linebreak\b/g, "\n");
  out = out.replace(/\\\\/g, "\n");
  out = out.replace(/~/g, " ");
  return out;
}

function isMathPassthrough(text) {
  const trimmed = String(text).trim();
  return trimmed.startsWith("\\[") || trimmed.startsWith("\\begin{equation")
    || trimmed.startsWith("\\begin{align") || trimmed.startsWith("\\begin{gather");
}

export function readLatex({ content, title = "document", format = "latex" }) {
  const warnings = [];
  const source = String(content ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = [];
  let docTitle = "";
  let droppedCommands = 0;

  // 只处理 document 环境内的内容；之前的 preamble 仅提取 \title。
  const beginDoc = source.search(/\\begin\{document\}/);
  const preamble = beginDoc === -1 ? "" : source.slice(0, beginDoc);
  const body = beginDoc === -1 ? source : source.slice(beginDoc);
  const titleMatch = preamble.match(/\\title\{([\s\S]*?)\}/);
  if (titleMatch) docTitle = flattenInline(titleMatch[1], warnings).trim();

  // 逐行扫描；verbatim / 数学 / 列表环境按块处理
  const lines = body.split("\n").map(stripComments);
  let i = 0;
  let paragraphBuffer = [];

  const flushParagraph = () => {
    const text = flattenInline(paragraphBuffer.join(" "), warnings)
      .replace(/\s*\n\s*/g, "\n")
      .trim();
    paragraphBuffer = [];
    if (text !== "") blocks.push(createParagraph(text));
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const beginMatch = trimmed.match(/^\\begin\{([^}]+)\}/);
    if (beginMatch) {
      const env = beginMatch[1];
      if (env === "document") {
        // document 环境只是骨架：不进入块收集，直接跳过该行
        i += 1;
        continue;
      }
      flushParagraph();
      const endPattern = new RegExp(`\\\\end\\{${env.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`);
      const collected = [];
      let j = i + 1;
      let closed = false;
      // 同一行闭合的情况（\begin{...}...\end{...}）
      const inlineEnd = trimmed.match(endPattern);
      if (inlineEnd && inlineEnd.index > 0) {
        collected.push(trimmed.slice(beginMatch[0].length, inlineEnd.index));
        closed = true;
      } else {
        const firstLineRest = trimmed.slice(beginMatch[0].length);
        if (firstLineRest) collected.push(firstLineRest);
        while (j < lines.length) {
          const endMatch = lines[j].match(endPattern);
          if (endMatch) {
            const before = lines[j].slice(0, endMatch.index);
            if (before.trim()) collected.push(before);
            closed = true;
            break;
          }
          collected.push(lines[j]);
          j += 1;
        }
      }
      i = closed ? (inlineEnd ? i : j) : j;

      if (VERBATIM_ENVIRONMENTS.has(env)) {
        blocks.push(createCodeBlock(collected.join("\n").replace(/^\n+|\n+$/g, ""), env === "verbatim" ? "" : env));
      } else if (LIST_ENVIRONMENTS.has(env)) {
        const items = [];
        let current = [];
        for (const entryLine of collected.join("\n").split("\n")) {
          const itemMatch = entryLine.match(/\\item(?:\[[^\]]*\])?\s*(.*)/);
          if (itemMatch) {
            if (current.length > 0) items.push(current.join(" "));
            current = [itemMatch[1]];
          } else if (current.length > 0) {
            current.push(entryLine);
          }
        }
        if (current.length > 0) items.push(current.join(" "));
        const cleaned = items.map((item) => flattenInline(item, warnings).replace(/\s+/g, " ").trim()).filter(Boolean);
        if (cleaned.length > 0) blocks.push(createList(cleaned, env === "enumerate"));
      } else if (MATH_ENVIRONMENTS.has(env)) {
        // 数学环境原样保留
        const math = [`\\begin{${env}}`, ...collected, `\\end{${env}}`].join("\n").trim();
        blocks.push(createParagraph(math));
      } else if (env === "quote" || env === "quotation") {
        const quote = flattenInline(collected.join(" "), warnings).replace(/\s+/g, " ").trim();
        if (quote) blocks.push(createQuote(quote));
      } else if (SKIP_ENVIRONMENTS.has(env)) {
        // 文档骨架与浮动体环境：document 透传已在切片时处理；figure/table 等降级
        if (env !== "document") {
          warnings.push(createWarning(
            "lossy",
            "LATEX_FLOATS_DROPPED",
            `LaTeX ${env} 环境内容未导入（浮动体/表格环境降级）。`,
          ));
        }
      } else {
        const inner = flattenInline(collected.join(" "), warnings).replace(/\s+/g, " ").trim();
        if (inner) blocks.push(createParagraph(inner));
      }
      i += 1;
      continue;
    }

    const sectionMatch = trimmed.match(/^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{([\s\S]*)\}\s*$/);
    if (sectionMatch) {
      flushParagraph();
      const level = SECTION_COMMANDS[sectionMatch[1]] || 1;
      blocks.push(createHeading(level, flattenInline(sectionMatch[2], warnings).trim()));
      i += 1;
      continue;
    }

    const displayMathMatch = trimmed.match(/^\\\[([\s\S]*)$/);
    if (displayMathMatch) {
      flushParagraph();
      const collected = [displayMathMatch[1]];
      let closed = /\\\]\s*$/.test(displayMathMatch[1]);
      if (closed) collected[0] = collected[0].replace(/\\\]\s*$/, "");
      let j = i + 1;
      while (!closed && j < lines.length) {
        if (/\\\]\s*$/.test(lines[j])) {
          collected.push(lines[j].replace(/\\\]\s*$/, ""));
          closed = true;
          break;
        }
        collected.push(lines[j]);
        j += 1;
      }
      const mathBody = collected.join("\n").replace(/^\n+|\n+$/g, "").trim();
      // 统一为 $$…$$，Markdown 输出与 KaTeX 渲染都能原样识别
      blocks.push(createParagraph(`$$\n${mathBody}\n$$`));
      i = closed ? j + 1 : j;
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      i += 1;
      continue;
    }
    if (/^\\(maketitle|tableofcontents|newpage|clearpage|bibliography|printbibliography)\b/.test(trimmed)) {
      i += 1;
      continue;
    }
    if (/^\\(documentclass|usepackage|setlength|newcommand|renewcommand|definecolor)/.test(trimmed)) {
      i += 1;
      continue;
    }
    if (/^\\end\{document\}/.test(trimmed)) break;
    if (/^\\[a-zA-Z]+/.test(trimmed) && !/\\[a-zA-Z]+\s*\{/.test(trimmed) && trimmed.replace(/\\[a-zA-Z]+\*?/g, "").trim() === "") {
      // 纯命令行（无文本参数），如 \centering、\vspace{...} 的前半形态
      droppedCommands += 1;
      i += 1;
      continue;
    }
    paragraphBuffer.push(trimmed);
    i += 1;
  }
  flushParagraph();

  if (droppedCommands > 0) {
    warnings.push(createWarning(
      "info",
      "LATEX_COMMANDS_STRIPPED",
      `已忽略 ${droppedCommands} 个无文本参数的 LaTeX 命令（如 \\centering）。`,
      { droppedCommands },
    ));
  }
  if (blocks.length === 0) blocks.push(createParagraph("(empty LaTeX document)"));
  if (docTitle) blocks.unshift(createHeading(1, docTitle));

  return createDocumentModel({
    title: docTitle || title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({}, warnings),
  });
}

function escapeLatexText(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

// 行内节点 → LaTeX。block.text 可能仍含 markdown 源标记（`**粗体**`），
// 统一经 getInlineTokens 解析后渲染，避免标记原样泄漏进 .tex 输出。
// del 无原生命令（\sout 依赖 ulem 宏包），降级为正文内容本身。
function inlinesToLatex(inlines) {
  return normalizeInlines(inlines).map((node) => {
    switch (node.type) {
      case "strong":
        return `\\textbf{${inlinesToLatex(node.inlines)}}`;
      case "em":
        return `\\emph{${inlinesToLatex(node.inlines)}}`;
      case "del":
        return inlinesToLatex(node.inlines);
      case "code":
        return `\\texttt{${escapeLatexText(node.value)}}`;
      case "link": {
        const label = inlinesToLatex(node.inlines) || escapeLatexText(node.href);
        return node.href ? `\\href{${escapeLatexUrl(node.href)}}{${label}}` : label;
      }
      case "linebreak":
        return "\\\\";
      case "math":
        return node.display ? `\\[${String(node.value ?? "").trim()}\\]` : `$${String(node.value ?? "").trim()}$`;
      case "footnote-ref":
        return "";
      default:
        return escapeLatexText(node.value);
    }
  }).join("");
}

function escapeLatexUrl(url) {
  return String(url ?? "").replace(/([%#{}])/g, "\\$1");
}

function looksLikeMath(text) {
  const trimmed = String(text).trim();
  return trimmed.startsWith("$") || isMathPassthrough(trimmed);
}

const HEADING_BY_LEVEL = {
  1: "section",
  2: "subsection",
  3: "subsubsection",
  4: "paragraph",
  5: "subparagraph",
  6: "subparagraph",
};

export function writeLatex({ model, title = model.title }) {
  const warnings = [];
  const body = [];
  for (const block of model.blocks || []) {
    if (block.type === "heading") {
      const command = HEADING_BY_LEVEL[Math.min(6, Math.max(1, block.level))] || "section";
      body.push(`\\${command}{${escapeLatexText(block.text)}}`);
      continue;
    }
    if (block.type === "paragraph") {
      if (looksLikeMath(block.text)) {
        body.push(String(block.text).trim());
      } else {
        body.push(inlinesToLatex(getInlineTokens(block)));
      }
      continue;
    }
    if (block.type === "quote") {
      body.push(`\\begin{quote}\n${inlinesToLatex(getInlineTokens(block))}\n\\end{quote}`);
      continue;
    }
    if (block.type === "code") {
      body.push(`\\begin{verbatim}\n${String(block.code).replace(/\n+$/, "")}\n\\end{verbatim}`);
      continue;
    }
    if (block.type === "list") {
      const env = block.ordered ? "enumerate" : "itemize";
      const items = (block.items || []).map((item, index) => {
        const itemInlines = Array.isArray(block.itemInlines?.[index])
          ? block.itemInlines[index]
          : getInlineTokens({ text: item });
        return `  \\item ${inlinesToLatex(itemInlines)}`;
      });
      body.push(`\\begin{${env}}\n${items.join("\n")}\n\\end{${env}}`);
      continue;
    }
    if (block.type === "table") {
      const columns = Math.max(1, block.headers.length);
      const spec = "l".repeat(columns);
      const rows = [block.headers, ...block.rows].map((row, rowIndex) => {
        const cells = Array.from({ length: columns }, (_, index) =>
          inlinesToLatex(getCellInlineTokens(row[index] ?? "")));
        return `${cells.join(" & ")} \\\\`;
      });
      body.push(`\\begin{tabular}{${spec}}\n${rows.join("\n")}\n\\end{tabular}`);
      warnings.push(createWarning(
        "lossy",
        "LATEX_TABLE_BASIC",
        "表格以基础 tabular 环境写出，列宽与对齐信息未保留。",
      ));
      continue;
    }
    if (block.type === "image" || block.type === "asset") {
      warnings.push(createWarning(
        "lossy",
        "LATEX_IMAGES_DROPPED",
        "图片/资产引用未写入 LaTeX 输出（无本地图形包绑定）。",
      ));
      continue;
    }
    if (block.type === "raw") continue;
  }

  const document = [
    "\\documentclass{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage{amsmath}",
    "\\usepackage{hyperref}",
    `\\title{${escapeLatexText(title || "document")}}`,
    "\\begin{document}",
    "\\maketitle",
    "",
    body.join("\n\n"),
    "",
    "\\end{document}",
    "",
  ].join("\n");

  return {
    type: "text",
    format: "latex",
    data: document,
    mime: "application/x-latex;charset=utf-8",
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
