import { createParagraph } from "../document-model.js";
import { createWarning, withWarnings } from "../warnings.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { createOCREngineFailedWarning, createOCRUnavailableWarning, createOCRLowConfidenceWarning, createOCRScanPagesTruncatedWarning } from "./ocr-warnings.js";
import { defaultPdfPageRasterizer } from "./pdf-rasterizer.js";
import { mergeOCRResultsToFixedLayout } from "./ocr-to-fixed-layout.js";
import { mapLinesToBlockIds } from "./ocr-structure.js";
import { fixedLayoutToSemantic } from "../models/mappers.js";
import { getFixedLayoutSummary } from "../models/fixed-layout.js";

export const MODEL_VISUAL_FIDELITY_LOST = "MODEL_VISUAL_FIDELITY_LOST";
export const MODEL_TEXT_ORDER_HEURISTIC = "MODEL_TEXT_ORDER_HEURISTIC";

const DEFAULT_MAX_SCAN_PAGES = 5;
const DEFAULT_DPI = 144;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

function cloneModel(model) {
  return {
    ...model,
    blocks: [...(model.blocks || [])],
    assets: [...(model.assets || [])],
    metadata: { ...(model.metadata || {}) },
  };
}

function paragraphsFromPageResult(result) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const paragraphs = [];
  for (const page of pages) {
    const lines = Array.isArray(page.lines) ? page.lines : [];
    const text = lines.map((line) => line.text).filter(Boolean).join("\n");
    if (text.trim().length > 0) paragraphs.push(createParagraph(text));
  }
  if (paragraphs.length === 0 && typeof result?.fullText === "string" && result.fullText.trim().length > 0) {
    paragraphs.push(createParagraph(result.fullText));
  }
  return paragraphs;
}

export async function runScannedPdfOCRStage(model, ctx = {}) {
  if (ctx?.options?.ocr?.enabled === false) return model;
  const registry = ctx.ocrRegistry || defaultOCRRegistry;
  const engine = ctx.ocrEngine || registry.pickForTask("ocr-text");
  if (!engine || !engine.isAvailable()) {
    return {
      ...model,
      metadata: withWarnings(model.metadata || {}, [
        createOCRUnavailableWarning({
          engineId: engine?.id || "none",
          manifestId: engine?.manifestId || "",
          reason: engine ? "engine-not-enabled" : "no-engine-registered",
          task: "ocr-text",
        }),
      ]),
    };
  }
  const rasterizer = ctx.rasterizer || defaultPdfPageRasterizer;
  const maxPages = typeof ctx?.options?.ocr?.maxScanPages === "number"
    ? ctx.options.ocr.maxScanPages
    : DEFAULT_MAX_SCAN_PAGES;
  const dpi = typeof ctx?.options?.ocr?.dpi === "number" ? ctx.options.ocr.dpi : DEFAULT_DPI;

  let pageCount;
  try {
    pageCount = await rasterizer.countPages({ content: ctx.content });
  } catch (error) {
    return {
      ...model,
      metadata: withWarnings(model.metadata || {}, [
        createOCREngineFailedWarning({
          engineId: engine.id,
          manifestId: engine.manifestId || "",
          reason: error?.code || "rasterizer-count-pages-failed",
          cause: error?.message || String(error),
        }),
      ]),
    };
  }
  const effectivePages = Math.min(maxPages, Math.max(1, pageCount || 0));
  if (effectivePages === 0) return model;

  const enhanced = cloneModel(model);
  const truncated = typeof pageCount === "number" && pageCount > effectivePages;
  if (truncated) {
    // 在循环前注入：即使后续每页 OCR 都失败，截断事实也不丢。
    enhanced.metadata = withWarnings(enhanced.metadata, [
      createOCRScanPagesTruncatedWarning({
        totalPages: pageCount,
        processedPages: effectivePages,
        maxScanPages: maxPages,
        engineId: engine.id,
      }),
    ]);
  }
  const lines = [];
  const aggregateConfidences = [];
  const pageResults = [];
  let runtimeMsTotal = 0;
  let language = "";
  let modelVersion = "";

  for (let pageIndex = 0; pageIndex < effectivePages; pageIndex += 1) {
    let pageResult;
    try {
      const rendered = await rasterizer.rasterize({ content: ctx.content, pageIndex, dpi });
      pageResult = await engine.recognize({ image: rendered.dataUrl, options: { language: "chi_sim" } });
    } catch (error) {
      enhanced.metadata = withWarnings(enhanced.metadata, [
        createOCREngineFailedWarning({
          engineId: engine.id,
          manifestId: engine.manifestId || "",
          reason: error?.code || "page-stage-failed",
          cause: `page=${pageIndex}: ${error?.message || error}`,
        }),
      ]);
      continue;
    }
    pageResults.push(pageResult);
    runtimeMsTotal += pageResult?.runtimeMs || 0;
    if (typeof pageResult?.averageConfidence === "number") aggregateConfidences.push(pageResult.averageConfidence);
    language = language || pageResult?.language || "";
    modelVersion = modelVersion || pageResult?.modelVersion || "";
    const pageLines = Array.isArray(pageResult?.pages?.[0]?.lines) ? pageResult.pages[0].lines : [];
    pageLines.forEach((line, lineIndex) => {
      lines.push({
        pageIndex,
        lineIndex,
        text: line.text || "",
        confidence: typeof line.confidence === "number" ? line.confidence : 0,
        bbox: line.bbox || null,
        blockId: "",
      });
    });
  }

  const averageConfidence = aggregateConfidences.length > 0
    ? aggregateConfidences.reduce((acc, value) => acc + value, 0) / aggregateConfidences.length
    : 0;

  const fixedLayout = mergeOCRResultsToFixedLayout(pageResults, { language, engine: engine.id, modelVersion });
  enhanced.fixedLayout = fixedLayout;

  const appendedStart = enhanced.blocks.length;
  if (pageResults.length > 0) {
    const semanticFromLayout = fixedLayoutToSemantic(fixedLayout, {
      title: enhanced.title || "scan-ocr",
      sourceFormat: enhanced.sourceFormat || "pdf",
    });
    enhanced.blocks.push(...(semanticFromLayout.blocks || []));
    // 给追加块预赋稳定 id（绝对索引），供低置信修复按 block.id 命中；document-audit 保留之。
    for (let i = appendedStart; i < enhanced.blocks.length; i += 1) {
      if (!enhanced.blocks[i].id) enhanced.blocks[i].id = `ocr-block-${i}`;
    }
    enhanced.metadata = withWarnings(enhanced.metadata, [
      createWarning(
        "info",
        MODEL_VISUAL_FIDELITY_LOST,
        "扫描 PDF OCR 仅恢复文本，不还原原始版面、字体、图像。质量报告以文本为准。",
        { engineId: engine.id, pageCount: pageResults.length },
      ),
      createWarning(
        "info",
        MODEL_TEXT_ORDER_HEURISTIC,
        "扫描 PDF 阅读顺序使用 bbox y → x 启发式，未做多栏 / 标题层级推断。",
        { engineId: engine.id, readingOrder: "heuristic-yx" },
      ),
    ]);
  }

  // 用文本包含把每行映射到承载它的追加块的 id。不能按 lines 顺序硬配索引：
  // mergeOCRResultsToFixedLayout 会按阅读顺序（bbox y→x）重排，lines 顺序 ≠ 块顺序。
  const appendedBlocks = enhanced.blocks.slice(appendedStart);
  const blockIds = mapLinesToBlockIds(lines, appendedBlocks);
  lines.forEach((ocrLine, i) => { ocrLine.blockId = blockIds[i] || ""; });

  enhanced.metadata.ocr = {
    language: language || "auto",
    pageCount: effectivePages,
    totalPageCount: typeof pageCount === "number" ? pageCount : effectivePages,
    truncated,
    lineCount: lines.length,
    lines,
  };
  enhanced.metadata.modelReview = {
    ...(enhanced.metadata.modelReview || {}),
    engine: engine.id,
    modelVersion: modelVersion || "",
    tasks: Array.from(new Set([...(enhanced.metadata.modelReview?.tasks || []), "ocr-text-recognition", "scan-pdf-rasterize"])),
    inferenceMode: "local",
    ocr: {
      pageCount: effectivePages,
      totalPageCount: typeof pageCount === "number" ? pageCount : effectivePages,
      lineCount: lines.length,
      averageConfidence,
      runtimeMs: runtimeMsTotal,
      engine: engine.id,
      modelVersion: modelVersion || "",
      language: language || "auto",
      fullTextLength: lines.reduce((acc, line) => acc + (line.text?.length || 0), 0),
      fixedLayout: getFixedLayoutSummary(fixedLayout),
    },
  };

  if (averageConfidence > 0 && averageConfidence < LOW_CONFIDENCE_THRESHOLD) {
    enhanced.metadata = withWarnings(enhanced.metadata, [
      createOCRLowConfidenceWarning({
        averageConfidence,
        threshold: LOW_CONFIDENCE_THRESHOLD,
        engineId: engine.id,
      }),
    ]);
  }

  return enhanced;
}
