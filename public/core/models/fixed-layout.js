// FixedLayoutModel：固定页面规范模型，承载 page / textRun / glyph / bbox /
// annotation / signature。PDF / OFD reader 在产出 SemanticDoc 的同时在 model
// 顶层挂 model.fixedLayout，让需要保留视觉布局的 mapper 和 writer 能直接消费。
//
// 详见 docs/MULTI_MODEL_ARCHITECTURE.md。

export function createFixedLayoutModel({
  pages = [],
  metadata = {},
} = {}) {
  return {
    schemaVersion: "trans2former.fixedlayout.v1",
    pages: pages.map((page) => createPage(page)),
    metadata: { ...metadata },
  };
}

export function createPage({
  pageNumber = 0,
  size = { width: 0, height: 0, unit: "pt" },
  rotation = 0,
  textRuns = [],
  annotations = [],
  signatures = [],
  assets = [],
  readingOrderHint = "",
} = {}) {
  return {
    pageNumber: Number(pageNumber) || 0,
    size: {
      width: Number(size?.width) || 0,
      height: Number(size?.height) || 0,
      unit: String(size?.unit || "pt"),
    },
    rotation: Number(rotation) || 0,
    textRuns: textRuns.map((run) => createTextRun(run)),
    annotations: annotations.map((annotation) => createAnnotation(annotation)),
    signatures: signatures.map((signature) => ({
      bbox: signature?.bbox ? createBbox(signature.bbox) : null,
      signerName: String(signature?.signerName || ""),
      reason: String(signature?.reason || ""),
    })),
    assets: assets.map((asset) => ({
      assetId: String(asset?.assetId || ""),
      bbox: asset?.bbox ? createBbox(asset.bbox) : null,
    })),
    readingOrderHint: String(readingOrderHint || ""),
  };
}

export function createTextRun({
  text = "",
  bbox = null,
  fontName = "",
  fontSize = 0,
  fontWeight = "",
  confidence = 0,
} = {}) {
  return {
    text: String(text ?? ""),
    bbox: bbox ? createBbox(bbox) : null,
    fontName: String(fontName || ""),
    fontSize: Number(fontSize) || 0,
    fontWeight: String(fontWeight || ""),
    confidence: Number.isFinite(Number(confidence)) ? Math.max(0, Math.min(1, Number(confidence))) : 0,
  };
}

export function createAnnotation({
  type = "",
  bbox = null,
  target = "",
  text = "",
} = {}) {
  return {
    type: String(type || ""),
    bbox: bbox ? createBbox(bbox) : null,
    target: String(target || ""),
    text: String(text || ""),
  };
}

export function createBbox(input) {
  if (!input) return null;
  return {
    x: Number(input.x) || 0,
    y: Number(input.y) || 0,
    w: Number(input.w) || 0,
    h: Number(input.h) || 0,
  };
}

export function getFixedLayoutSummary(model) {
  if (!model || !Array.isArray(model.pages)) {
    return { pageCount: 0, textRunCount: 0, annotationCount: 0, signatureCount: 0 };
  }
  return {
    pageCount: model.pages.length,
    textRunCount: model.pages.reduce((sum, page) => sum + page.textRuns.length, 0),
    annotationCount: model.pages.reduce((sum, page) => sum + page.annotations.length, 0),
    signatureCount: model.pages.reduce((sum, page) => sum + page.signatures.length, 0),
  };
}
