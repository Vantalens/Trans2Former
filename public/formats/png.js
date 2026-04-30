import {
  createAssetReference,
  createDocumentModel,
  createHeading,
} from "../core/document-model.js";
import { createAssetStore } from "../core/asset-store.js";

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

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks: [
      createHeading(1, title),
      createAssetReference(asset.id, { alt: title, title }),
    ],
    assets: assetStore.toJSON(),
  });
}
