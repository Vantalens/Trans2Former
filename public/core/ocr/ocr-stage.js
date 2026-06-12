import { defaultOCRRegistry } from "./ocr-engine.js";
import { enhanceWithOCR } from "./png-ocr.js";
import { createOCREngineFailedWarning } from "./ocr-warnings.js";
import { DEFAULT_OCR_LANGUAGE, coerceOCRLanguage } from "./ocr-language.js";
import { withWarnings } from "../warnings.js";

function shouldSkip(ctx) {
  return Boolean(ctx?.options?.ocr?.enabled === false);
}

export async function runOCRStage(model, ctx = {}) {
  if (shouldSkip(ctx)) return model;
  const registry = ctx.ocrRegistry || defaultOCRRegistry;
  const engine = ctx.ocrEngine || registry.pickForTask("ocr-text");
  if (!engine) return model;
  try {
    const enhanced = await enhanceWithOCR(model, { engine, registry, language: getDefaultOCRLanguage(ctx) });
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
