import {
  createFixedLayoutModel,
  createPage,
  createTextRun,
} from "../models/fixed-layout.js";

export const READING_ORDER_HEURISTIC = "heuristic-yx";

function sortLinesByReadingOrder(lines) {
  return [...lines].sort((a, b) => {
    const ay = a?.bbox?.y ?? 0;
    const by = b?.bbox?.y ?? 0;
    if (ay !== by) return ay - by;
    const ax = a?.bbox?.x ?? 0;
    const bx = b?.bbox?.x ?? 0;
    return ax - bx;
  });
}

function pageDimensions(page) {
  if (!page) return { width: 0, height: 0 };
  return {
    width: Number(page.width) || 0,
    height: Number(page.height) || 0,
  };
}

export function ocrResultToFixedLayoutPage(ocrResult, { pageNumber = 1, pageIndex = 0 } = {}) {
  const sourcePage = Array.isArray(ocrResult?.pages) ? ocrResult.pages[pageIndex] : null;
  const lines = Array.isArray(sourcePage?.lines) ? sourcePage.lines : [];
  const sorted = sortLinesByReadingOrder(lines);
  const { width, height } = pageDimensions(sourcePage);
  return createPage({
    pageNumber,
    size: { width, height, unit: "px" },
    textRuns: sorted.map((line) => createTextRun({
      text: line.text || "",
      bbox: line.bbox || null,
      confidence: line.confidence ?? 0,
    })),
    readingOrderHint: READING_ORDER_HEURISTIC,
  });
}

export function mergeOCRResultsToFixedLayout(results = [], { language = "auto", engine = "", modelVersion = "" } = {}) {
  if (!Array.isArray(results)) results = [];
  const pages = [];
  let totalRuns = 0;
  let totalConfidence = 0;
  let totalConfidenceSamples = 0;
  let runtimeMsTotal = 0;
  for (let i = 0; i < results.length; i += 1) {
    const page = ocrResultToFixedLayoutPage(results[i], { pageNumber: i + 1, pageIndex: 0 });
    pages.push(page);
    totalRuns += page.textRuns.length;
    runtimeMsTotal += Number(results[i]?.runtimeMs) || 0;
    if (typeof results[i]?.averageConfidence === "number") {
      totalConfidence += results[i].averageConfidence;
      totalConfidenceSamples += 1;
    }
  }
  const averageConfidence = totalConfidenceSamples > 0
    ? totalConfidence / totalConfidenceSamples
    : 0;
  return createFixedLayoutModel({
    pages,
    metadata: {
      readingOrder: READING_ORDER_HEURISTIC,
      ocr: {
        language: language || results[0]?.language || "auto",
        pageCount: pages.length,
        textRunCount: totalRuns,
        averageConfidence,
        runtimeMs: runtimeMsTotal,
        engine: engine || results[0]?.engine || "",
        modelVersion: modelVersion || results[0]?.modelVersion || "",
      },
    },
  });
}
