import { withWarnings } from "../warnings.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { summarizeOCRResult } from "./ocr-result.js";
import { DEFAULT_OCR_LANGUAGE, normalizeOCRLanguage } from "./ocr-language.js";
import { blocksFromOcrResult, mapLinesToBlockIds } from "./ocr-structure.js";
import {
  createOCRUnavailableWarning,
  createOCREngineFailedWarning,
  createOCRLowConfidenceWarning,
} from "./ocr-warnings.js";

const LOW_CONFIDENCE_THRESHOLD = 0.6;

function findFirstImageAsset(model) {
  const blocks = Array.isArray(model?.blocks) ? model.blocks : [];
  for (const block of blocks) {
    if (block?.type === "asset" || block?.type === "image") return block;
  }
  return null;
}

function resolveAssetData(model, assetBlock) {
  if (assetBlock?.src) return assetBlock.src;
  const assets = Array.isArray(model?.assets) ? model.assets : [];
  const assetId = assetBlock?.assetId;
  if (!assetId) return null;
  const found = assets.find((entry) => entry?.id === assetId);
  return found?.data || null;
}

function cloneModel(model) {
  return {
    ...model,
    blocks: [...(model.blocks || [])],
    assets: [...(model.assets || [])],
    metadata: { ...(model.metadata || {}) },
  };
}


export async function enhanceWithOCR(model, { engine = null, registry = defaultOCRRegistry, language = DEFAULT_OCR_LANGUAGE } = {}) {
  const resolvedEngine = engine || registry.pickForTask("ocr-text");
  if (!resolvedEngine || !resolvedEngine.isAvailable()) {
    const next = cloneModel(model);
    next.metadata = withWarnings(next.metadata, [
      createOCRUnavailableWarning({
        engineId: resolvedEngine?.id || "none",
        manifestId: resolvedEngine?.manifestId || "",
        reason: resolvedEngine ? "engine-not-enabled" : "no-engine-registered",
      }),
    ]);
    return next;
  }

  const assetBlock = findFirstImageAsset(model);
  if (!assetBlock) {
    const next = cloneModel(model);
    next.metadata = withWarnings(next.metadata, [
      createOCREngineFailedWarning({
        engineId: resolvedEngine.id,
        manifestId: resolvedEngine.manifestId || "",
        reason: "no-image-asset",
      }),
    ]);
    return next;
  }

  const image = resolveAssetData(model, assetBlock);
  if (!image) {
    const next = cloneModel(model);
    next.metadata = withWarnings(next.metadata, [
      createOCREngineFailedWarning({
        engineId: resolvedEngine.id,
        manifestId: resolvedEngine.manifestId || "",
        reason: "asset-data-missing",
      }),
    ]);
    return next;
  }

  let result;
  try {
    result = await resolvedEngine.recognize({ image, options: { language: normalizeOCRLanguage(language) } });
  } catch (error) {
    const next = cloneModel(model);
    next.metadata = withWarnings(next.metadata, [
      createOCREngineFailedWarning({
        engineId: resolvedEngine.id,
        manifestId: resolvedEngine.manifestId || "",
        reason: error?.code || "recognize-threw",
        cause: error?.message || String(error),
      }),
    ]);
    return next;
  }

  // 格式识别增强：按版面（bbox/行高/间距）把识别行归并成标题+段落；几何不足时回退。
  const paragraphs = blocksFromOcrResult(result);
  const ocrWarnings = [];
  if (typeof result?.averageConfidence === "number" && result.averageConfidence < LOW_CONFIDENCE_THRESHOLD) {
    ocrWarnings.push(createOCRLowConfidenceWarning({
      averageConfidence: result.averageConfidence,
      threshold: LOW_CONFIDENCE_THRESHOLD,
      engineId: resolvedEngine.id,
    }));
  }

  const enhanced = cloneModel(model);
  const appendedStart = enhanced.blocks.length;
  enhanced.blocks = [...enhanced.blocks, ...paragraphs];
  // 给 OCR 追加块预赋稳定 id（绝对索引），让低置信修复能按 block.id 命中。document-audit 的
  // `id: block.id || ...` 会保留它，且 "ocr-block-" 前缀不与审计的 "block-N-hash" 冲突。
  for (let i = appendedStart; i < enhanced.blocks.length; i += 1) {
    if (!enhanced.blocks[i].id) enhanced.blocks[i].id = `ocr-block-${i}`;
  }
  enhanced.metadata = withWarnings(enhanced.metadata, ocrWarnings);
  enhanced.metadata.modelReview = {
    ...(enhanced.metadata.modelReview || {}),
    engine: resolvedEngine.id,
    modelVersion: result?.modelVersion || "",
    tasks: Array.from(new Set([...(enhanced.metadata.modelReview?.tasks || []), "ocr-text-recognition"])),
    inferenceMode: "local",
    ocr: summarizeOCRResult(result),
    // 质量把控：若引擎提供了质量评估（置信度分级、低置信行、旋转校正数），一并记录。
    ...(result?.quality ? { ocrQuality: result.quality } : {}),
  };
  enhanced.metadata.ocr = collectLineMetadata(result, enhanced.blocks, appendedStart);
  return enhanced;
}

function collectLineMetadata(result, blocks, appendedStart) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const flat = [];
  pages.forEach((page, pageIndex) => {
    const pageLines = Array.isArray(page.lines) ? page.lines : [];
    pageLines.forEach((line, lineIndex) => {
      flat.push({ pageIndex, lineIndex, line });
    });
  });
  // 用文本包含把每行映射到承载它的追加块的 id（处理「多行→一块」与结构归并），而不是按页
  // 索引硬猜（旧 blocks[appendedStart + pageIndex] 在每页多块/标题分块时会错配）。
  const appendedBlocks = blocks.slice(appendedStart);
  const blockIds = mapLinesToBlockIds(flat.map((f) => f.line), appendedBlocks);
  const lines = flat.map((f, i) => ({
    pageIndex: f.pageIndex,
    lineIndex: f.lineIndex,
    text: f.line.text || "",
    confidence: typeof f.line.confidence === "number" ? f.line.confidence : 0,
    bbox: f.line.bbox || null,
    blockId: blockIds[i] || "",
  }));
  return {
    language: result?.language || "auto",
    pageCount: pages.length,
    lineCount: lines.length,
    lines,
  };
}
