// 跨模型 mapper 真实实现。RoutePlanner 在 P8-M1 注册的 mapper 只声明了 from /
// to / lossLevel / forcedWarnings；本文件提供对应的纯函数转换实现，让外部调
// 用方在需要时显式调 mapper（例如 convert() 链路自动选路、或外部插件需要从
// 一个模型派生另一个模型）。
//
// 每个 mapper 都按"保守降级"原则：只搬运能直接对应的字段，丢失的细节由调用
// 方在 metadata.warnings 里登记 forcedWarnings；mapper 自己不操作 warnings 列
// 表，避免和 RoutePlanner 重复。
//
// 详见 docs/MULTI_MODEL_ARCHITECTURE.md 跨模型 Mapper 章节。

import {
  createCodeBlock,
  createDocumentModel,
  createHeading,
  createList,
  createParagraph,
  createQuote,
  createTable,
} from "../document-model.js";
import { createWorkbookModel } from "./workbook-model.js";
import { createSlideModel } from "./slide-model.js";
import { createFixedLayoutModel, createTextRun } from "./fixed-layout.js";

// WorkbookModel → SemanticDoc：每个 sheet 转成 heading + table block。
export function workbookToSemantic(workbook, { title = "workbook", sourceFormat = "" } = {}) {
  const blocks = [];
  for (const sheet of workbook?.sheets || []) {
    if (sheet.name) blocks.push(createHeading(2, sheet.name));
    if (Array.isArray(sheet.headers) && sheet.headers.length > 0) {
      blocks.push(createTable(sheet.headers, sheet.rows || []));
    }
  }
  return createDocumentModel({
    title,
    sourceFormat,
    blocks,
  });
}

// SemanticDoc → WorkbookModel：把 SemanticDoc 中的每个 table block 转成单 sheet。
// 非 table 块被忽略；调用方应当在 forcedWarnings 中登记 MODEL_NO_FORMULA_INFO。
export function semanticToWorkbook(model, { defaultSheetName = "Sheet 1" } = {}) {
  const sheets = [];
  let counter = 1;
  for (const block of model?.blocks || []) {
    if (block.type !== "table") continue;
    sheets.push({
      name: counter === 1 ? defaultSheetName : `${defaultSheetName} ${counter}`,
      headers: [...(block.headers || [])],
      rows: (block.rows || []).map((row) => [...row]),
    });
    counter += 1;
  }
  return createWorkbookModel({ sheets });
}

// SlideModel → SemanticDoc：每张 slide 输出 heading + 每个 shape.text 段落 +
// notes 单独段落。
export function slideToSemantic(slideModel, { title = "presentation", sourceFormat = "" } = {}) {
  const blocks = [];
  for (const slide of slideModel?.slides || []) {
    const headerText = slide.title
      ? `Slide ${slide.pageNumber}: ${slide.title}`
      : `Slide ${slide.pageNumber}`;
    blocks.push(createHeading(2, headerText));
    for (const shape of slide.shapes || []) {
      if (shape.type !== "text") continue;
      const text = String(shape.text || "").trim();
      if (text && text !== slide.title) blocks.push(createParagraph(text));
    }
    if (slide.notes) {
      blocks.push(createQuote(`Speaker notes: ${slide.notes}`));
    }
  }
  return createDocumentModel({
    title,
    sourceFormat,
    blocks,
  });
}

// SemanticDoc → SlideModel：保守策略 —— 每个 heading 起一张 slide，下属 paragraph
// 转 shape.text。调用方应当在 forcedWarnings 中登记 MODEL_LAYOUT_AUTO_GENERATED。
export function semanticToSlide(model) {
  const slides = [];
  let current = null;
  let pageNumber = 0;
  function startSlide(title) {
    pageNumber += 1;
    current = {
      pageNumber,
      title: String(title || ""),
      shapes: title ? [{ type: "text", text: String(title) }] : [],
      notes: "",
    };
    slides.push(current);
  }
  for (const block of model?.blocks || []) {
    if (block.type === "heading") {
      startSlide(block.text);
    } else if (block.type === "paragraph" || block.type === "quote") {
      if (!current) startSlide("");
      current.shapes.push({ type: "text", text: String(block.text || "") });
    }
  }
  return createSlideModel({ slides });
}

// FixedLayoutModel → SemanticDoc：保守降级，每个 textRun 转一个 paragraph，
// 不做版面分析（reader 做版面分析的责任）；调用方应当在 forcedWarnings 中登记
// MODEL_VISUAL_FIDELITY_LOST + MODEL_TEXT_ORDER_HEURISTIC。
export function fixedLayoutToSemantic(layoutModel, { title = "document", sourceFormat = "" } = {}) {
  const blocks = [];
  for (const page of layoutModel?.pages || []) {
    for (const run of page.textRuns || []) {
      const text = String(run.text || "").trim();
      if (text) blocks.push(createParagraph(text));
    }
  }
  return createDocumentModel({
    title,
    sourceFormat,
    blocks,
  });
}

// SemanticDoc → FixedLayoutModel：占位实现，把每个 paragraph 视作单独 textRun，
// y 坐标按顺序递减。真正的程序化排版应当由 pdf-output 一类的 writer 完成。
export function semanticToFixedLayout(model) {
  const textRuns = [];
  let cursorY = 800;
  for (const block of model?.blocks || []) {
    const text = String(block.text || "").trim();
    if (!text) continue;
    const fontSize = block.type === "heading" ? Math.max(14, 24 - (block.level || 1) * 2) : 11;
    textRuns.push(createTextRun({
      text,
      bbox: { x: 72, y: cursorY, w: 451, h: fontSize },
      fontSize,
      fontWeight: block.type === "heading" ? "bold" : "regular",
    }));
    cursorY -= fontSize * 1.6;
  }
  return createFixedLayoutModel({
    pages: [{
      pageNumber: 1,
      size: { width: 595, height: 842, unit: "pt" },
      textRuns,
    }],
  });
}
