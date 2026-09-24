import { createParagraph } from "../document-model.js";
import { createWarning, withWarnings } from "../warnings.js";
import { defaultOCRRegistry } from "./ocr-engine.js";
import { createOCREngineFailedWarning, createOCRUnavailableWarning, createOCRLowConfidenceWarning, createOCRScanPagesTruncatedWarning } from "./ocr-warnings.js";
import { DEFAULT_OCR_LANGUAGE, coerceOCRLanguage } from "./ocr-language.js";
import { defaultPdfPageRasterizer } from "./pdf-rasterizer.js";
import { mergeOCRResultsToFixedLayout } from "./ocr-to-fixed-layout.js";
import { mapLinesToBlockIds } from "./ocr-structure.js";
import { fixedLayoutToSemantic } from "../models/mappers.js";
import { createFixedLayoutModel, getFixedLayoutSummary } from "../models/fixed-layout.js";

export const MODEL_VISUAL_FIDELITY_LOST = "MODEL_VISUAL_FIDELITY_LOST";
export const MODEL_TEXT_ORDER_HEURISTIC = "MODEL_TEXT_ORDER_HEURISTIC";

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

function mergeOCRPagesWithSourceLayout(sourceLayout, ocrLayout, successfulIndices) {
  if (!Array.isArray(sourceLayout?.pages) || sourceLayout.pages.length === 0) return ocrLayout;
  const pages = sourceLayout.pages.map((page) => ({ ...page, textRuns: [...(page.textRuns || [])] }));
  for (let index = 0; index < successfulIndices.length; index += 1) {
    const pageIndex = successfulIndices[index];
    const sourcePage = pages[pageIndex];
    const ocrPage = ocrLayout.pages[index];
    if (!sourcePage || !ocrPage) continue;
    const sourceWidth = Number(sourcePage.size?.width);
    const sourceHeight = Number(sourcePage.size?.height);
    const ocrWidth = Number(ocrPage.size?.width);
    const ocrHeight = Number(ocrPage.size?.height);
    if (![sourceWidth, sourceHeight, ocrWidth, ocrHeight].every((value) => Number.isFinite(value) && value > 0)) {
      continue;
    }
    const scaleX = sourceWidth / ocrWidth;
    const scaleY = sourceHeight / ocrHeight;
    const textRuns = ocrPage.textRuns.map((run) => {
      if (!run.bbox) return run;
      const { x, y, w, h } = run.bbox;
      return {
        ...run,
        bbox: {
          x: x * scaleX,
          y: sourceHeight - (y + h) * scaleY,
          w: w * scaleX,
          h: h * scaleY,
        },
        fontSize: h * scaleY,
      };
    });
    sourcePage.textRuns.push(...textRuns);
  }
  return createFixedLayoutModel({
    pages,
    metadata: { ...(sourceLayout.metadata || {}), ocr: ocrLayout.metadata?.ocr },
  });
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
  // A page limit is an explicit partial-extraction choice. Invalid limits fall
  // back to all pages so the default path never silently drops later pages.
  const rawMaxPages = ctx?.options?.ocr?.maxScanPages;
  const configuredMaxPages = typeof rawMaxPages === "number" && Number.isFinite(rawMaxPages) && rawMaxPages >= 1
    ? Math.floor(rawMaxPages)
    : null;
  const dpi = typeof ctx?.options?.ocr?.dpi === "number" ? ctx.options.ocr.dpi : DEFAULT_DPI;
  // 用户语言偏好（options.ocr.language）归一化后传引擎；注意下方已有 `let language`
  // 累积变量（记录引擎返回的语言），此处必须用独立名字避免遮蔽。
  const requestedLanguage = ctx?.options?.ocr?.language
    ? coerceOCRLanguage(ctx.options.ocr.language)
    : DEFAULT_OCR_LANGUAGE;

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
  if (!Number.isSafeInteger(pageCount) || pageCount < 0) {
    return {
      ...model,
      metadata: withWarnings(model.metadata || {}, [createOCREngineFailedWarning({
        engineId: engine.id,
        manifestId: engine.manifestId || "",
        reason: "rasterizer-invalid-page-count",
        cause: String(pageCount),
      })]),
    };
  }
  const maxPages = configuredMaxPages ?? pageCount;
  const effectivePages = Math.min(maxPages, pageCount);
  const requestedIndices = Array.isArray(ctx.pageIndices)
    ? [...new Set(ctx.pageIndices)]
      .filter((index) => Number.isSafeInteger(index) && index >= 0 && index < pageCount)
      .sort((a, b) => a - b)
    : Array.from({ length: pageCount }, (_, index) => index);
  const pageIndices = requestedIndices.filter((index) => index < effectivePages);
  if (pageIndices.length === 0 && requestedIndices.length === 0) return model;

  const enhanced = cloneModel(model);
  const truncated = requestedIndices.length > pageIndices.length;
  if (truncated) {
    // 在循环前注入：即使后续每页 OCR 都失败，截断事实也不丢。
    enhanced.metadata = withWarnings(enhanced.metadata, [
      createOCRScanPagesTruncatedWarning({
        totalPages: pageCount,
        processedPages: pageIndices.length,
        maxScanPages: maxPages,
        engineId: engine.id,
      }),
    ]);
  }
  const lines = [];
  const aggregateConfidences = [];
  const pageResults = [];
  const successfulIndices = [];
  let runtimeMsTotal = 0;
  let language = "";
  let modelVersion = "";

  try {
    for (const pageIndex of pageIndices) {
      // 检查是否已取消
      if (ctx?.signal?.aborted) {
        throw new Error("OCR已取消");
      }

      let pageResult;
      try {
        const rendered = await rasterizer.rasterize({ content: ctx.content, pageIndex, dpi });
        pageResult = await engine.recognize({ image: rendered.dataUrl, options: { language: requestedLanguage } });
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
      successfulIndices.push(pageIndex);
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
  } finally {
    // 清理 rasterizer 缓存的 PDF document
    if (typeof rasterizer.dispose === "function") {
      try {
        await rasterizer.dispose();
      } catch (error) {
        // ignore cleanup errors
      }
    }
  }

  const averageConfidence = aggregateConfidences.length > 0
    ? aggregateConfidences.reduce((acc, value) => acc + value, 0) / aggregateConfidences.length
    : 0;

  const fixedLayout = mergeOCRResultsToFixedLayout(pageResults, { language, engine: engine.id, modelVersion });
  enhanced.fixedLayout = mergeOCRPagesWithSourceLayout(model.fixedLayout, fixedLayout, successfulIndices);

  const appendedStart = enhanced.blocks.length;
  const ocrBlocks = [];
  const ocrBlocksByPage = new Map();
  if (pageResults.length > 0) {
    for (let index = 0; index < fixedLayout.pages.length; index += 1) {
      const semantic = fixedLayoutToSemantic({ pages: [fixedLayout.pages[index]] }, {
        title: enhanced.title || "scan-ocr",
        sourceFormat: enhanced.sourceFormat || "pdf",
      });
      const pageBlocks = semantic.blocks || [];
      for (const block of pageBlocks) {
        if (!block.id) block.id = `ocr-block-${appendedStart + ocrBlocks.length}`;
        ocrBlocks.push(block);
      }
      ocrBlocksByPage.set(successfulIndices[index], pageBlocks);
    }
    const pageBlockCounts = model.metadata?.pdf?.pageBlockCounts;
    const canInterleave = Array.isArray(pageBlockCounts)
      && pageBlockCounts.length === pageCount
      && pageBlockCounts.every((count) => Number.isSafeInteger(count) && count >= 0)
      && pageBlockCounts.reduce((sum, count) => sum + count, 0) === enhanced.blocks.length;
    if (canInterleave) {
      const orderedBlocks = [];
      let offset = 0;
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const count = pageBlockCounts[pageIndex];
        orderedBlocks.push(...enhanced.blocks.slice(offset, offset + count));
        orderedBlocks.push(...(ocrBlocksByPage.get(pageIndex) || []));
        offset += count;
      }
      enhanced.blocks = orderedBlocks;
    } else {
      enhanced.blocks.push(...ocrBlocks);
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
  const blockIds = mapLinesToBlockIds(lines, ocrBlocks);
  lines.forEach((ocrLine, i) => { ocrLine.blockId = blockIds[i] || ""; });

  enhanced.metadata.ocr = {
    language: language || "auto",
    pageCount: pageIndices.length,
    totalPageCount: typeof pageCount === "number" ? Math.max(pageCount, effectivePages) : effectivePages,
    truncated,
    pageIndices,
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
      pageCount: pageIndices.length,
      totalPageCount: typeof pageCount === "number" ? Math.max(pageCount, effectivePages) : effectivePages,
      truncated,
      pageIndices,
      lineCount: lines.length,
      averageConfidence,
      runtimeMs: runtimeMsTotal,
      engine: engine.id,
      modelVersion: modelVersion || "",
      language: language || "auto",
      fullTextLength: lines.reduce((acc, line) => acc + (line.text?.length || 0), 0),
      fixedLayout: getFixedLayoutSummary(enhanced.fixedLayout),
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
