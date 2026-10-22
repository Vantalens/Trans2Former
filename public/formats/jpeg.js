import {
  createAssetReference,
  createDocumentModel,
  createHeading,
} from "../core/document-model.js";
import { createAssetStore } from "../core/asset-store.js";
import { withWarnings } from "../core/warnings.js";
import { defaultOCRRegistry } from "../core/ocr/ocr-engine.js";
import { createOCRUnavailableWarning } from "../core/ocr/ocr-warnings.js";

export function readJpeg({ content, title = "image", fileName = "", format = "jpeg" }) {
  const data = String(content ?? "");
  if (!data.startsWith("data:image/jpeg;base64,")) {
    throw new Error("JPEG 输入必须是浏览器读取的 data URL");
  }

  const assetStore = createAssetStore();
  const fallbackName = /\.(jpe?g|jfif)$/i.test(String(title || "")) ? title : `${title}.jpg`;
  const asset = assetStore.add({
    name: fileName || fallbackName,
    mime: "image/jpeg",
    data,
    size: data.length,
    role: "image",
  });

  const ocrEngine = defaultOCRRegistry.pickForTask("ocr-text");
  const ocrWarnings = [];
  if (!ocrEngine || !ocrEngine.isAvailable()) {
    ocrWarnings.push(createOCRUnavailableWarning({
      engineId: ocrEngine?.id || "none",
      manifestId: ocrEngine?.manifestId || "",
      reason: ocrEngine ? "engine-not-enabled" : "no-engine-registered",
    }));
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks: [
      createHeading(1, title),
      createAssetReference(asset.id, { alt: title, title }),
    ],
    assets: assetStore.toJSON(),
    metadata: withWarnings({}, ocrWarnings),
  });
}
