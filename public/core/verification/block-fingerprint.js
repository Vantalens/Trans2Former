// 共享指纹模块：原 repair-engine.js 的 blockFingerprint / modelFingerprint 抽出，
// 行为字节级不变；额外暴露 getBlockKey / extractBlockFields / BLOCK_FIELDS_BY_TYPE
// 给 verification-stage 的字段级 diff 用。ROUND_TRIP_FORMATS 也搬到这里作为单一来源。

export const ROUND_TRIP_FORMATS = new Set(["md", "html", "json", "csv", "txt", "xml"]);

export const BLOCK_FIELDS_BY_TYPE = {
  heading: ["type", "level", "text"],
  paragraph: ["type", "text"],
  quote: ["type", "text"],
  code: ["type", "language", "code"],
  list: ["type", "ordered", "items"],
  table: ["type", "headers", "rows"],
  image: ["type", "src", "alt"],
  asset: ["type", "assetId", "alt"],
  raw: ["type", "format", "content"],
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(8, "0").slice(0, 8);
}

export function blockFingerprint(block) {
  if (!isPlainObject(block)) return "";
  if (block.type === "heading") return `h${block.level}|${block.text || ""}`;
  if (block.type === "paragraph" || block.type === "quote") return `${block.type}|${block.text || ""}`;
  if (block.type === "code") return `code|${block.language || ""}|${block.code || ""}`;
  if (block.type === "list") return `list|${block.ordered ? "ol" : "ul"}|${(block.items || []).join("")}`;
  if (block.type === "table") {
    return `table|${(block.headers || []).join("")}|${(block.rows || []).map((row) => (row || []).join("")).join("")}`;
  }
  if (block.type === "image" || block.type === "asset") {
    return `${block.type}|${block.src || ""}|${block.alt || ""}|${block.assetId || ""}`;
  }
  if (block.type === "raw") return `raw|${block.format || ""}|${block.content || ""}`;
  return block.type || "";
}

export function modelFingerprint(model) {
  return (model?.blocks || []).map(blockFingerprint).join("");
}

export function extractBlockFields(block) {
  if (!isPlainObject(block)) return { type: "" };
  const fields = BLOCK_FIELDS_BY_TYPE[block.type] || ["type"];
  const subset = {};
  for (const field of fields) {
    const value = block[field];
    if (Array.isArray(value)) {
      subset[field] = value.map((entry) => Array.isArray(entry) ? entry.map(String) : (entry === undefined || entry === null ? "" : String(entry)));
    } else if (value === undefined || value === null) {
      subset[field] = "";
    } else if (typeof value === "boolean" || typeof value === "number") {
      subset[field] = value;
    } else {
      subset[field] = String(value);
    }
  }
  return subset;
}

export function getBlockKey(block, index) {
  if (isPlainObject(block) && typeof block.id === "string" && block.id.length > 0) {
    return block.id;
  }
  const fields = extractBlockFields(block);
  const fingerprint = stableHash(JSON.stringify(fields));
  return `${fields.type || "unknown"}-${index}-${fingerprint}`;
}
