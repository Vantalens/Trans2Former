function decodeCodePoint(code) {
  return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "";
}

export function decodeXml(value) {
  return String(value ?? "")
    // 数字字符引用（&#26376; / &#x6708;，openpyxl 等生成器常用）必须先于命名实体解码：
    // 若先解 &amp;，双重转义的 "&amp;#26376;" 会被错解成真实字符。
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => decodeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => decodeCodePoint(Number(dec)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

export function getAttr(xml, name) {
  const escaped = name.replace(":", "\\:");
  const pattern = new RegExp(`\\s${escaped}="([^"]*)"`);
  return decodeXml(String(xml ?? "").match(pattern)?.[1] || "");
}

export function stripTags(xml) {
  return decodeXml(String(xml ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function dirname(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  return normalized.includes("/") ? normalized.split("/").slice(0, -1).join("/") : "";
}

export function resolvePartPath(basePath, target) {
  if (!target) return "";
  if (/^[a-z]+:/i.test(target)) return target;
  // ECMA-376：Target 以 "/" 开头时是包根绝对路径（openpyxl 等生成器的习惯写法，
  // 如 Target="/xl/worksheets/sheet1.xml"），不能再与 basePath 拼接，
  // 否则会拼出 xl/xl/... 导致部件查找失败、整表被跳过。
  const base = target.startsWith("/") ? "" : dirname(basePath);
  const parts = `${base}/${target}`.split("/");
  const resolved = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

export function parseRelationships(xml, basePath = "") {
  const relationships = new Map();
  for (const match of String(xml ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = match[1] || "";
    const id = getAttr(attrs, "Id");
    if (!id) continue;
    const target = getAttr(attrs, "Target");
    relationships.set(id, {
      id,
      type: getAttr(attrs, "Type"),
      target,
      resolvedTarget: resolvePartPath(basePath, target),
      targetMode: getAttr(attrs, "TargetMode"),
    });
  }
  return relationships;
}

export function extractTextTags(xml, tagNamePattern = "[aw]:t|w:t|a:t|t") {
  const pattern = new RegExp(`<(${tagNamePattern})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "g");
  return [...String(xml ?? "").matchAll(pattern)].map((match) => decodeXml(match[2])).join("");
}
