// OCR 回读：P9-C 三层检验第三层。把转换输出（PDF）栅格化后用 OCR 引擎读回文本，
// 与原始 SemanticDoc 文本做字符级多重集相似度，写入 qualityReport.ocrReadback。
// engine / rasterizer 复用已注册的 ocr-text 资源；Node 默认不可用 → eligible:false。

import { createWarning } from "../warnings.js";
import { defaultOCRRegistry } from "../ocr/ocr-engine.js";
import { normalizeOCRLanguage } from "../ocr/ocr-language.js";
import { defaultPdfPageRasterizer } from "../ocr/pdf-rasterizer.js";

export const OCR_READBACK_DRIFT = "OCR_READBACK_DRIFT";
export const OCR_READBACK_FAILED = "OCR_READBACK_FAILED";
export const DEFAULT_OCR_READBACK_THRESHOLD = 0.7;

// 当前唯一可栅格化的文本 writer。
const OCR_READBACK_OUTPUT_FORMATS = new Set(["pdf"]);

export function normalizeText(value) {
  let text = String(value ?? "");
  if (typeof text.normalize === "function") text = text.normalize("NFKC");
  return text.toLowerCase().replace(/\s+/g, "");
}

function charMultiset(normalized) {
  const counts = new Map();
  for (const ch of normalized) {
    counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  return counts;
}

// 字符级多重集 recall / precision / f1，跨中英文与 OCR 噪声稳健。
export function compareText(original, recognized) {
  const normOriginal = normalizeText(original);
  const normRecognized = normalizeText(recognized);
  const originalCounts = charMultiset(normOriginal);
  const recognizedCounts = charMultiset(normRecognized);

  let intersection = 0;
  for (const [ch, count] of originalCounts) {
    const other = recognizedCounts.get(ch) || 0;
    intersection += Math.min(count, other);
  }

  const originalLength = normOriginal.length;
  const recognizedLength = normRecognized.length;
  const recall = originalLength > 0 ? intersection / originalLength : (recognizedLength === 0 ? 1 : 0);
  const precision = recognizedLength > 0 ? intersection / recognizedLength : (originalLength === 0 ? 1 : 0);
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    recall,
    precision,
    f1,
    originalLength,
    recognizedLength,
    intersection,
  };
}

function textOfBlock(block) {
  if (!block || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (Array.isArray(block.items)) return block.items.join("\n");
  if (Array.isArray(block.rows)) {
    const head = Array.isArray(block.headers) ? block.headers.join(" ") : "";
    return [head, ...block.rows.map((row) => (Array.isArray(row) ? row.join(" ") : ""))].join("\n");
  }
  if (typeof block.code === "string") return block.code;
  if (typeof block.content === "string") return block.content;
  if (typeof block.alt === "string") return block.alt;
  return "";
}

export function extractModelText(model) {
  const blocks = Array.isArray(model?.blocks) ? model.blocks : [];
  return blocks.map(textOfBlock).filter((text) => text && text.trim().length > 0).join("\n");
}

function recognizedTextOf(ocrResult) {
  if (typeof ocrResult?.fullText === "string" && ocrResult.fullText.trim().length > 0) {
    return ocrResult.fullText;
  }
  const pages = Array.isArray(ocrResult?.pages) ? ocrResult.pages : [];
  return pages
    .flatMap((page) => (Array.isArray(page.lines) ? page.lines.map((line) => line.text) : []))
    .filter(Boolean)
    .join("\n");
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export async function runOcrReadbackLayer({
  model,
  output,
  ctx,
  engine = null,
  rasterizer = defaultPdfPageRasterizer,
  registry = defaultOCRRegistry,
} = {}) {
  const start = nowMs();
  const skip = (reason, warnings = []) => ({ eligible: false, reason, ocrReadback: null, warnings, runtimeMs: nowMs() - start });

  if (!OCR_READBACK_OUTPUT_FORMATS.has(ctx?.to)) {
    return skip("output-not-rasterizable-for-ocr");
  }
  const originalText = extractModelText(model);
  if (originalText.trim().length === 0) {
    return skip("no-source-text");
  }

  const resolvedEngine = engine || registry.pickForTask("ocr-text");
  let available = false;
  try {
    available = Boolean(resolvedEngine) && resolvedEngine.isAvailable() === true;
  } catch (error) {
    available = false;
  }
  if (!available) {
    return skip("ocr-engine-unavailable");
  }

  const threshold = typeof ctx?.options?.verification?.ocrReadbackThreshold === "number"
    ? ctx.options.verification.ocrReadbackThreshold
    : DEFAULT_OCR_READBACK_THRESHOLD;
  const language = normalizeOCRLanguage(ctx?.options?.ocr?.language);

  let recognized;
  try {
    const raster = await rasterizer.rasterize({ content: output?.data, pageIndex: 0 });
    recognized = await resolvedEngine.recognize({ image: raster.dataUrl, options: { language } });
  } catch (error) {
    const cause = error?.code || error?.message || "unknown";
    if (cause === "OCR_RASTERIZER_UNAVAILABLE") {
      return skip("rasterizer-unavailable");
    }
    return skip(`readback-failed:${cause}`, [
      createWarning("info", OCR_READBACK_FAILED, `OCR 回读失败：${cause}.`, { from: ctx?.from, to: ctx?.to, cause }),
    ]);
  }

  const recognizedText = recognizedTextOf(recognized);
  const similarity = compareText(originalText, recognizedText);
  const passed = similarity.f1 >= threshold;
  const ocrReadback = {
    recall: similarity.recall,
    precision: similarity.precision,
    f1: similarity.f1,
    threshold,
    passed,
    engineId: resolvedEngine.id,
    originalLength: similarity.originalLength,
    recognizedLength: similarity.recognizedLength,
    averageConfidence: typeof recognized?.averageConfidence === "number" ? recognized.averageConfidence : null,
    pageIndex: 0,
  };
  const warnings = passed
    ? []
    : [createWarning(
      "info",
      OCR_READBACK_DRIFT,
      `OCR 回读 ${ctx?.from} → ${ctx?.to} 低于阈值（f1 ${similarity.f1.toFixed(3)} < ${threshold}）。`,
      { from: ctx?.from, to: ctx?.to, f1: similarity.f1, recall: similarity.recall, precision: similarity.precision, threshold },
    )];

  return {
    eligible: true,
    reason: "completed",
    ocrReadback,
    warnings,
    runtimeMs: nowMs() - start,
  };
}
