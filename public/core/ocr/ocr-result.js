import { ConversionError } from "../conversion-error.js";
import { normalizeOCRLanguage, OCR_LANGUAGES } from "./ocr-language.js";

export const OCR_RESULT_SCHEMA_VERSION = "trans2former.ocr-result.v1";

export { OCR_LANGUAGES };

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function freezeDeep(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
    return Object.freeze(value);
  }
  return value;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUnitInterval(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function createOCRResult({
  language = "auto",
  pages = [],
  fullText = "",
  averageConfidence = 0,
  runtimeMs = 0,
  engine = "",
  modelVersion = "",
  warnings = [],
} = {}) {
  const result = {
    schemaVersion: OCR_RESULT_SCHEMA_VERSION,
    // 引擎边界传入的 tesseract 码（chi_sim/eng）在此归一化为 canonical 码；
    // validateOCRResult 本身不放松，未知值原样进入校验并被拒绝。
    language: normalizeOCRLanguage(language),
    pages: Array.isArray(pages) ? pages.map((page) => ({
      pageIndex: page?.pageIndex ?? 0,
      width: page?.width ?? 0,
      height: page?.height ?? 0,
      lines: Array.isArray(page?.lines) ? page.lines.map((line) => ({
        text: String(line?.text ?? ""),
        confidence: line?.confidence ?? 0,
        bbox: line?.bbox
          ? {
              x: line.bbox.x ?? 0,
              y: line.bbox.y ?? 0,
              w: line.bbox.w ?? 0,
              h: line.bbox.h ?? 0,
            }
          : null,
      })) : [],
    })) : pages,
    fullText: String(fullText || ""),
    averageConfidence,
    runtimeMs,
    engine: String(engine || ""),
    modelVersion: String(modelVersion || ""),
    warnings: Array.isArray(warnings) ? warnings.map((w) => ({ ...w })) : warnings,
  };
  validateOCRResult(result);
  return freezeDeep(result);
}

export function validateOCRResult(result) {
  if (!isPlainObject(result)) {
    throw new ConversionError("OCR result must be an object.", {
      category: "validate",
      code: "OCR_RESULT_INVALID",
      details: { reason: "not-an-object" },
    });
  }
  if (result.schemaVersion !== OCR_RESULT_SCHEMA_VERSION) {
    throw new ConversionError(`Unsupported OCR result schemaVersion: ${result.schemaVersion}`, {
      category: "validate",
      code: "OCR_RESULT_INVALID",
      details: { reason: "schema-version", expected: OCR_RESULT_SCHEMA_VERSION },
    });
  }
  if (!OCR_LANGUAGES.includes(result.language)) {
    throw new ConversionError(`Unknown OCR language: ${result.language}`, {
      category: "validate",
      code: "OCR_RESULT_INVALID",
      details: { reason: "unknown-language", language: result.language },
    });
  }
  if (!Array.isArray(result.pages)) {
    throw new ConversionError("OCR result pages must be an array.", {
      category: "validate",
      code: "OCR_RESULT_INVALID",
      details: { reason: "invalid-pages" },
    });
  }
  for (let i = 0; i < result.pages.length; i += 1) {
    const page = result.pages[i];
    if (!isPlainObject(page)) {
      throw new ConversionError(`OCR page ${i} must be an object.`, {
        category: "validate",
        code: "OCR_RESULT_INVALID",
        details: { reason: "invalid-page", index: i },
      });
    }
    if (!isNonNegativeNumber(page.pageIndex) || !isNonNegativeNumber(page.width) || !isNonNegativeNumber(page.height)) {
      throw new ConversionError(`OCR page ${i} pageIndex/width/height must be non-negative numbers.`, {
        category: "validate",
        code: "OCR_RESULT_INVALID",
        details: { reason: "invalid-page-geometry", index: i },
      });
    }
    if (!Array.isArray(page.lines)) {
      throw new ConversionError(`OCR page ${i} lines must be an array.`, {
        category: "validate",
        code: "OCR_RESULT_INVALID",
        details: { reason: "invalid-lines", index: i },
      });
    }
    for (let j = 0; j < page.lines.length; j += 1) {
      const line = page.lines[j];
      if (typeof line?.text !== "string") {
        throw new ConversionError(`OCR line ${i}.${j} text must be a string.`, {
          category: "validate",
          code: "OCR_RESULT_INVALID",
          details: { reason: "invalid-line-text", page: i, line: j },
        });
      }
      if (!isUnitInterval(line.confidence)) {
        throw new ConversionError(`OCR line ${i}.${j} confidence must be in [0, 1].`, {
          category: "validate",
          code: "OCR_RESULT_INVALID",
          details: { reason: "invalid-line-confidence", page: i, line: j },
        });
      }
    }
  }
  if (!isUnitInterval(result.averageConfidence)) {
    throw new ConversionError("OCR averageConfidence must be in [0, 1].", {
      category: "validate",
      code: "OCR_RESULT_INVALID",
      details: { reason: "invalid-average-confidence" },
    });
  }
  if (!isNonNegativeNumber(result.runtimeMs)) {
    throw new ConversionError("OCR runtimeMs must be non-negative.", {
      category: "validate",
      code: "OCR_RESULT_INVALID",
      details: { reason: "invalid-runtime" },
    });
  }
  return result;
}

export function summarizeOCRResult(result) {
  if (!isPlainObject(result)) return null;
  const pages = Array.isArray(result.pages) ? result.pages : [];
  const lineCount = pages.reduce((sum, page) => sum + (Array.isArray(page.lines) ? page.lines.length : 0), 0);
  return {
    pageCount: pages.length,
    lineCount,
    averageConfidence: result.averageConfidence ?? 0,
    fullTextLength: typeof result.fullText === "string" ? result.fullText.length : 0,
    engine: result.engine || "",
    modelVersion: result.modelVersion || "",
    runtimeMs: result.runtimeMs ?? 0,
    language: result.language || "auto",
  };
}
