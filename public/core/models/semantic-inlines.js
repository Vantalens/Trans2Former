// 行内节点工厂 + 渲染工具。block.inlines 数组里每个元素都是这里定义的节点。
// 节点类型：
//   - text: 纯文本叶子节点 { value }
//   - strong / em / del / sub / sup: 容器节点 { inlines: [...] }
//   - code: 行内代码 { value }（不递归）
//   - link: 链接 { href, title, inlines: [...] }
//   - linebreak: 强制换行（HTML <br> / Markdown 双空格换行）
//   - footnoteRef: 脚注引用 { id }（HTML 渲染为 <sup id="fnref-id">，Markdown 保留 [^id]）
//
// 兼容输入：normalizeInlines 接受字符串、单节点对象或混合数组，统一规范化为
// 节点数组。null/undefined 被忽略。

// 只转义在 markdown 内联里"无歧义就会被解析成语法"的字符：
//   \ ` * _ ~
// 不转义 [ ] < > —— 它们在文本节点里出现时（task list "[x]"、字面尖括号等）
// 几乎都是用户期望的字面字符；inline 节点流里真正的 link/autolink 已经是
// 结构化节点，不会再走 text 路径。
function escapeMarkdownInlineText(value) {
  return String(value ?? "").replace(/([\\`*_~])/g, "\\$1");
}

function escapeHtmlInline(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createInlineText(value) {
  return { type: "text", value: String(value ?? "") };
}

export function createInlineStrong(content) {
  return { type: "strong", inlines: normalizeInlines(content) };
}

export function createInlineEm(content) {
  return { type: "em", inlines: normalizeInlines(content) };
}

export function createInlineLink({ inlines, href = "", title = "" } = {}) {
  return {
    type: "link",
    href: String(href || ""),
    title: String(title || ""),
    inlines: normalizeInlines(inlines),
  };
}

export function createInlineCode(value) {
  return { type: "code", value: String(value ?? "") };
}

export function createInlineDel(content) {
  return { type: "del", inlines: normalizeInlines(content) };
}

export function createInlineLineBreak() {
  return { type: "linebreak" };
}

export function createInlineFootnoteRef(id) {
  return { type: "footnoteRef", id: String(id ?? "") };
}

export function normalizeInlines(input) {
  if (input === null || input === undefined) return [];
  if (typeof input === "string") {
    return input ? [createInlineText(input)] : [];
  }
  if (Array.isArray(input)) {
    return input
      .flatMap((item) => normalizeInlines(item))
      .filter(Boolean);
  }
  if (typeof input === "object" && typeof input.type === "string") {
    return [input];
  }
  return [];
}

export function inlinesToPlainText(inlines) {
  return (inlines || [])
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      if (node.type === "text" || node.type === "code") return String(node.value ?? "");
      if (node.type === "linebreak") return "\n";
      if (Array.isArray(node.inlines)) return inlinesToPlainText(node.inlines);
      return "";
    })
    .join("");
}

export function inlinesToMarkdown(inlines) {
  return (inlines || [])
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      if (node.type === "text") return escapeMarkdownInlineText(node.value);
      if (node.type === "strong") return `**${inlinesToMarkdown(node.inlines)}**`;
      if (node.type === "em") return `*${inlinesToMarkdown(node.inlines)}*`;
      if (node.type === "del") return `~~${inlinesToMarkdown(node.inlines)}~~`;
      if (node.type === "code") return `\`${String(node.value ?? "").replace(/`/g, "\\`")}\``;
      if (node.type === "link") {
        const inner = inlinesToMarkdown(node.inlines) || node.href || "";
        const title = node.title ? ` "${node.title.replace(/"/g, '\\"')}"` : "";
        return `[${inner}](${node.href}${title})`;
      }
      if (node.type === "linebreak") return "  \n";
      if (node.type === "footnoteRef") return `[^${String(node.id ?? "")}]`;
      if (Array.isArray(node.inlines)) return inlinesToMarkdown(node.inlines);
      return "";
    })
    .join("");
}

export function inlinesToHtml(inlines) {
  return (inlines || [])
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      if (node.type === "text") return escapeHtmlInline(node.value);
      if (node.type === "strong") return `<strong>${inlinesToHtml(node.inlines)}</strong>`;
      if (node.type === "em") return `<em>${inlinesToHtml(node.inlines)}</em>`;
      if (node.type === "del") return `<del>${inlinesToHtml(node.inlines)}</del>`;
      if (node.type === "code") return `<code>${escapeHtmlInline(node.value)}</code>`;
      if (node.type === "link") {
        const inner = inlinesToHtml(node.inlines);
        const titleAttr = node.title ? ` title="${escapeHtmlInline(node.title)}"` : "";
        return `<a href="${escapeHtmlInline(node.href)}"${titleAttr} target="_blank" rel="noreferrer">${inner}</a>`;
      }
      if (node.type === "linebreak") return "<br />";
      if (node.type === "footnoteRef") {
        const id = escapeHtmlInline(node.id ?? "");
        return `<sup id="fnref-${id}"><a href="#fn-${id}">[${id}]</a></sup>`;
      }
      if (Array.isArray(node.inlines)) return inlinesToHtml(node.inlines);
      return "";
    })
    .join("");
}
