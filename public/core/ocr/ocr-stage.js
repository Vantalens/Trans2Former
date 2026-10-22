import { defaultOCRRegistry } from "./ocr-engine.js";
import { enhanceWithOCR } from "./png-ocr.js";
import { createOCREngineFailedWarning, createSvgRasterizeUnsupportedWarning } from "./ocr-warnings.js";
import { DEFAULT_OCR_LANGUAGE, coerceOCRLanguage } from "./ocr-language.js";
import { withWarnings } from "../warnings.js";

function shouldSkip(ctx) {
  return Boolean(ctx?.options?.ocr?.enabled === false);
}

export async function runOCRStage(model, ctx = {}) {
  if (shouldSkip(ctx)) return model;

  // 检查是否已取消
  if (ctx?.signal?.aborted) {
    throw new Error("OCR已取消");
  }

  const registry = ctx.ocrRegistry || defaultOCRRegistry;
  const engine = ctx.ocrEngine || registry.pickForTask("ocr-text");

  // SVG 源：OCR 引擎消费位图，SVG 必须先栅格化。核心包不内置栅格化（浏览器可经
  // options.ocr.svgRasterize / ctx.svgRasterize 注入）；无栅格化能力时跳过识别并如实
  // 披露，绝不在 Node / Worker 环境因触碰 DOM 而崩溃。
  const sourceFormat = String(ctx?.from || model?.sourceFormat || "").toLowerCase();
  if (sourceFormat === "svg") {
    const rasterize = typeof ctx?.svgRasterize === "function"
      ? ctx.svgRasterize
      : (typeof ctx?.options?.ocr?.svgRasterize === "function" ? ctx.options.ocr.svgRasterize : null);
    if (typeof rasterize !== "function") {
      return {
        ...model,
        metadata: withWarnings(model.metadata || {}, [
          createSvgRasterizeUnsupportedWarning({
            engineId: engine?.id || "none",
            manifestId: engine?.manifestId || "",
          }),
        ]),
      };
    }
    try {
      const rasterDataUrl = await rasterize(model);
      if (typeof rasterDataUrl !== "string" || !rasterDataUrl.startsWith("data:image/")) {
        throw new Error("svg-rasterize-invalid-output");
      }
      const assets = (model.assets || []).map((asset, index) =>
        index === 0 ? { ...asset, data: rasterDataUrl, mime: "image/png" } : asset);
      model = { ...model, assets };
    } catch (error) {
      return {
        ...model,
        metadata: withWarnings(model.metadata || {}, [
          createOCREngineFailedWarning({
            engineId: engine?.id || "unknown",
            manifestId: engine?.manifestId || "",
            reason: "svg-rasterize-failed",
            cause: error?.message || String(error),
          }),
        ]),
      };
    }
  }

  if (!engine) return model;
  try {
    const enhanced = await enhanceWithOCR(model, {
      engine,
      registry,
      language: getDefaultOCRLanguage(ctx),
      signal: ctx.signal
    });
    return enhanced;
  } catch (error) {
    return {
      ...model,
      metadata: withWarnings(model.metadata || {}, [
        createOCREngineFailedWarning({
          engineId: engine?.id || "unknown",
          manifestId: engine?.manifestId || "",
          reason: error?.code || "stage-failed",
          cause: error?.message || String(error),
        }),
      ]),
    };
  }
}

export function getDefaultOCRLanguage(ctx = {}) {
  const raw = ctx?.options?.ocr?.language;
  return raw ? coerceOCRLanguage(raw) : DEFAULT_OCR_LANGUAGE;
}
