export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// XML 1.0 非法字符（escapeHtml 不处理）：C0 控制区（\t \n \r 除外）+ U+FFFE/FFFF。
// 任何手拼 XML 的 writer 放行这些字符都会产出 Office/阅读器拒开的损坏文件（issue #96）。
const XML_ILLEGAL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function stripIllegalXmlChars(value) {
  return String(value ?? "").replace(XML_ILLEGAL_CHARS, "");
}

// XML 文本/属性统一出口：先剔非法字符再转义。HTML writer（浏览器容错）继续用 escapeHtml。
export function escapeXmlText(value) {
  return escapeHtml(stripIllegalXmlChars(value));
}

export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function normalizeNewlines(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function stripHtml(html) {
  return decodeEntities(
    String(html ?? "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n\n")
      .replace(/<\s*\/div\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripMarkdownInlineSyntax(value) {
  return String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^\)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1");
}
