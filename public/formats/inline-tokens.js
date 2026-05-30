// 共享 inline token 解析器。所有 writer 用这里的 getInlineTokens(block) 拿到
// 统一格式的 inline 节点数组：优先消费 reader 已存的 block.inlines，
// 否则从 block.text 按 Markdown 内联语法回落解析。
//
// 返回节点形态与 core/models/semantic-inlines.js 保持一致：
//   { type: "text",      value }
//   { type: "code",      value }
//   { type: "strong",    inlines: [...] }
//   { type: "em",        inlines: [...] }
//   { type: "del",       inlines: [...] }
//   { type: "link",      href, title, inlines: [...] }
//   { type: "linebreak" }

import { normalizeInlines } from "../core/models/semantic-inlines.js";

// 递归解析支持嵌套，例如 "**bold _italic_**" 会得到
// strong(em(italic)) 而不是扁平的整段加粗。
export function parseInlineMarkdown(text) {
  const source = String(text ?? "");
  const tokens = [];
  let buffer = "";
  let index = 0;

  function pushText() {
    if (buffer) {
      tokens.push({ type: "text", value: buffer });
      buffer = "";
    }
  }

  function matchDelimited(open, close) {
    if (!source.startsWith(open, index)) return null;
    const start = index + open.length;
    const end = source.indexOf(close, start);
    if (end === -1 || end === start) return null;
    return { inner: source.slice(start, end), next: end + close.length };
  }

  function matchEmphasis(marker) {
    // *em* / _em_ —— 单字符标记。避免吃掉 **bold** 已经匹配的情况由调用顺序保证。
    if (source[index] !== marker) return null;
    let cursor = index + 1;
    while (cursor < source.length) {
      if (source[cursor] === marker && source[cursor - 1] !== "\\") {
        const inner = source.slice(index + 1, cursor);
        if (!inner || inner.includes("\n")) return null;
        return { inner, next: cursor + 1 };
      }
      cursor += 1;
    }
    return null;
  }

  while (index < source.length) {
    const ch = source[index];

    // LaTeX 数学：$$...$$（块级）/ $...$（行内）。内容逐字保留，不递归、不转义（须在转义
    // 处理之前，避免 \frac 的反斜杠被吃掉）。行内启发式：定界符内侧不得为空白，避免把
    // "$5 ... $10" 这类货币误判为数学。
    if (ch === "$") {
      if (source.startsWith("$$", index)) {
        const end = source.indexOf("$$", index + 2);
        if (end > index + 2) {
          const inner = source.slice(index + 2, end);
          if (inner.trim()) {
            pushText();
            tokens.push({ type: "math", display: true, value: inner });
            index = end + 2;
            continue;
          }
        }
      } else {
        const end = source.indexOf("$", index + 1);
        if (end > index + 1) {
          const inner = source.slice(index + 1, end);
          if (inner && !inner.includes("\n") && !/^\s/.test(inner) && !/\s$/.test(inner)) {
            pushText();
            tokens.push({ type: "math", display: false, value: inner });
            index = end + 1;
            continue;
          }
        }
      }
    }

    // 转义
    if (ch === "\\" && index + 1 < source.length) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }

    // 脚注引用 [^id] —— 优先于普通 link / image 匹配
    if (ch === "[" && source[index + 1] === "^") {
      const close = source.indexOf("]", index + 2);
      if (close !== -1) {
        const id = source.slice(index + 2, close).trim();
        if (id && !/\s/.test(id)) {
          pushText();
          tokens.push({ type: "footnoteRef", id });
          index = close + 1;
          continue;
        }
      }
    }

    // 行内代码 `...` —— 内容不递归
    if (ch === "`") {
      const end = source.indexOf("`", index + 1);
      if (end !== -1) {
        pushText();
        tokens.push({ type: "code", value: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    // 图片 ![alt](src) —— 在 inline 上下文里仅保留 alt
    if (ch === "!" && source[index + 1] === "[") {
      const altClose = source.indexOf("]", index + 2);
      if (altClose !== -1 && source[altClose + 1] === "(") {
        const hrefClose = source.indexOf(")", altClose + 2);
        if (hrefClose !== -1) {
          pushText();
          const alt = source.slice(index + 2, altClose);
          if (alt) tokens.push({ type: "text", value: alt });
          index = hrefClose + 1;
          continue;
        }
      }
    }

    // 链接 [text](href "title")
    if (ch === "[") {
      const textClose = source.indexOf("]", index + 1);
      if (textClose !== -1 && source[textClose + 1] === "(") {
        const hrefClose = source.indexOf(")", textClose + 2);
        if (hrefClose !== -1) {
          pushText();
          const linkText = source.slice(index + 1, textClose);
          const hrefRaw = source.slice(textClose + 2, hrefClose).trim();
          let href = hrefRaw;
          let title = "";
          const titleMatch = hrefRaw.match(/^(\S+)\s+"([^"]*)"$/);
          if (titleMatch) {
            href = titleMatch[1];
            title = titleMatch[2];
          }
          tokens.push({
            type: "link",
            href,
            title,
            inlines: parseInlineMarkdown(linkText),
          });
          index = hrefClose + 1;
          continue;
        }
      }
    }

    // 删除线 ~~...~~
    if (ch === "~" && source[index + 1] === "~") {
      const match = matchDelimited("~~", "~~");
      if (match) {
        pushText();
        tokens.push({ type: "del", inlines: parseInlineMarkdown(match.inner) });
        index = match.next;
        continue;
      }
    }

    // 粗斜体 ***...*** / ___...___（先于 ** / __）。
    // markdown 标准把三星号视为 strong+em 嵌套，简化处理：strong > em > inner。
    if (
      (ch === "*" && source[index + 1] === "*" && source[index + 2] === "*")
      || (ch === "_" && source[index + 1] === "_" && source[index + 2] === "_")
    ) {
      const marker = ch.repeat(3);
      const match = matchDelimited(marker, marker);
      if (match) {
        pushText();
        tokens.push({
          type: "strong",
          inlines: [{ type: "em", inlines: parseInlineMarkdown(match.inner) }],
        });
        index = match.next;
        continue;
      }
    }

    // 粗体 **...** / __...__（先于斜体匹配）
    if ((ch === "*" && source[index + 1] === "*") || (ch === "_" && source[index + 1] === "_")) {
      const marker = ch + ch;
      const match = matchDelimited(marker, marker);
      if (match) {
        pushText();
        tokens.push({ type: "strong", inlines: parseInlineMarkdown(match.inner) });
        index = match.next;
        continue;
      }
    }

    // 斜体 *...* / _..._
    if (ch === "*" || ch === "_") {
      const match = matchEmphasis(ch);
      if (match) {
        pushText();
        tokens.push({ type: "em", inlines: parseInlineMarkdown(match.inner) });
        index = match.next;
        continue;
      }
    }

    buffer += ch;
    index += 1;
  }

  pushText();
  return tokens;
}

// Writer 统一入口：拿 block 的 inline tokens。
// 优先消费 reader 存的 block.inlines；否则按 markdown 回落解析 block.text。
export function getInlineTokens(block) {
  if (!block) return [];
  if (Array.isArray(block.inlines) && block.inlines.length > 0) {
    return normalizeInlines(block.inlines);
  }
  return parseInlineMarkdown(block.text ?? "");
}

// 表格单元格也可能带 inlines（虽然当前 reader 还没存）；
// 给字符串单元格也走解析以保住 markdown 标记。
export function getCellInlineTokens(cell) {
  if (cell && typeof cell === "object" && Array.isArray(cell.inlines)) {
    return normalizeInlines(cell.inlines);
  }
  return parseInlineMarkdown(typeof cell === "string" ? cell : String(cell ?? ""));
}
