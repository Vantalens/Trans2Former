import { withWarnings } from "../warnings.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { summarizeOCRResult } from "./ocr-result.js";
import { blocksFromOcrResult } from "./ocr-structure.js";
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


export async function enhanceWithOCR(model, { engine = null, registry = defaultOCRRegistry } = {}) {
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
    result = await resolvedEngine.recognize({ image, options: { language: "chi_sim" } });
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
  const lines = [];
  pages.forEach((page, pageIndex) => {
    const pageLines = Array.isArray(page.lines) ? page.lines : [];
    pageLines.forEach((line, lineIndex) => {
      // Each appended paragraph corresponds to a page; pick the block that
      // received the paragraph for this page so repair candidates can refer
      // back to it by id.
      const block = blocks[appendedStart + pageIndex];
      lines.push({
        pageIndex,
        lineIndex,
        text: line.text || "",
        confidence: typeof line.confidence === "number" ? line.confidence : 0,
        bbox: line.bbox || null,
        blockId: block?.id || "",
      });
    });
  });
  return {
    language: result?.language || "auto",
    pageCount: pages.length,
    lineCount: lines.length,
    lines,
  };
}
