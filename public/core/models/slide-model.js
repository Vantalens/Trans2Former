// SlideModel：演示稿规范模型，承载 slide / shape / speaker notes / layout slot /
// master 引用。PPTX reader 在产出 SemanticDoc 的同时在 model 顶层挂 model.slides，
// 让需要保留页面结构的 writer / mapper 直接消费。
//
// 详见 docs/MULTI_MODEL_ARCHITECTURE.md。

export function createSlideModel({
  slides = [],
  master = "",
  layout = "",
  metadata = {},
} = {}) {
  return {
    schemaVersion: "trans2former.slide.v1",
    slides: slides.map((slide) => createSlide(slide)),
    master: String(master || ""),
    layout: String(layout || ""),
    metadata: { ...metadata },
  };
}

export function createSlide({
  pageNumber = 0,
  title = "",
  layout = "",
  shapes = [],
  notes = "",
  noteInlines = null,
} = {}) {
  return {
    pageNumber: Number(pageNumber) || 0,
    title: String(title || ""),
    layout: String(layout || ""),
    shapes: shapes.map((shape) => createShape(shape)),
    notes: String(notes || ""),
    noteInlines: Array.isArray(noteInlines) ? noteInlines : null,
  };
}

export function createShape({
  type = "text",
  text = "",
  bbox = null,
  assetId = "",
  style = "",
  inlines = null,
} = {}) {
  return {
    type: String(type || "text"),
    text: String(text || ""),
    bbox: bbox ? {
      x: Number(bbox.x) || 0,
      y: Number(bbox.y) || 0,
      w: Number(bbox.w) || 0,
      h: Number(bbox.h) || 0,
    } : null,
    assetId: String(assetId || ""),
    style: String(style || ""),
    inlines: Array.isArray(inlines) ? inlines : null,
  };
}

export function getSlideSummary(slideModel) {
  if (!slideModel || !Array.isArray(slideModel.slides)) {
    return { slideCount: 0, shapeCount: 0, noteCount: 0 };
  }
  return {
    slideCount: slideModel.slides.length,
    shapeCount: slideModel.slides.reduce(
      (sum, slide) => sum + slide.shapes.length,
      0
    ),
    noteCount: slideModel.slides.filter((slide) => slide.notes).length,
  };
}
