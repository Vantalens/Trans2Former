import {
  createAssetReference,
  createDocumentModel,
  createHeading,
} from "../core/document-model.js";
import { createAssetStore } from "../core/asset-store.js";
import { withWarnings } from "../core/warnings.js";
import { defaultOCRRegistry } from "../core/ocr/ocr-engine.js";
import { createOCRUnavailableWarning } from "../core/ocr/ocr-warnings.js";

export function readPng({ content, title = "image", fileName = "", format = "png" }) {
  const data = String(content ?? "");
  if (!data.startsWith("data:image/png;base64,")) {
    throw new Error("PNG 输入必须是浏览器读取的 data URL");
  }

  const assetStore = createAssetStore();
  const fallbackName = String(title || "image").toLowerCase().endsWith(".png") ? title : `${title}.png`;
  const asset = assetStore.add({
    name: fileName || fallbackName,
    mime: "image/png",
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
