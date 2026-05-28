import { ConversionError } from "../conversion-error.js";
import { OCR_UNAVAILABLE } from "./ocr-warnings.js";

export const PLACEHOLDER_OCR_MANIFEST_ID = "ocr-text.placeholder.0.1.0";

export const placeholderOCREngine = Object.freeze({
  id: "placeholder",
  taskCapabilities: ["ocr-text"],
  manifestId: PLACEHOLDER_OCR_MANIFEST_ID,
  isAvailable() {
    return false;
  },
  async recognize() {
    throw new ConversionError(
      "OCR placeholder engine cannot recognize images; enable a real OCR engine first.",
      {
        category: "convert",
        code: OCR_UNAVAILABLE,
        details: { engineId: "placeholder", manifestId: PLACEHOLDER_OCR_MANIFEST_ID, reason: "engine-not-enabled" },
      },
    );
  },
});
