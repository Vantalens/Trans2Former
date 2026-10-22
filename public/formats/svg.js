import {
  createAssetReference,
  createDocumentModel,
  createHeading,
  createParagraph,
} from "../core/document-model.js";
import { createAssetStore } from "../core/asset-store.js";
import { bytesToDataUrl, textToBytes } from "../core/binary-utils.js";
import { stripTags } from "./ooxml-utils.js";

// SVG 是文本格式（登记在 TEXT_CONTENT_FORMATS）：注册表 read() 会先把 data URL /
// 字节流解码成 `<svg ...` 文本；reader 同时兼容直接传入 data:image/svg+xml URL
//（base64 或 percent-encoded），保证测试与非注册表调用路径也能工作。
function coerceSvgText(content) {
  const raw = String(content ?? "");
  const dataUrl = raw.match(/^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!dataUrl) return { text: raw, dataUrl: "" };
  const text = dataUrl[1]
    ? new TextDecoder("utf-8").decode(
        typeof Buffer !== "undefined"
          ? new Uint8Array(Buffer.from(dataUrl[2], "base64"))
          : Uint8Array.from(atob(dataUrl[2]), (char) => char.charCodeAt(0)),
      )
    : decodeURIComponent(dataUrl[2]);
  return { text, dataUrl: raw };
}

export function readSvg({ content, title = "image", fileName = "", format = "svg" }) {
  const { text, dataUrl } = coerceSvgText(content);
  if (!/<svg[\s>]/i.test(text)) {
    throw new Error("SVG 输入必须是 <svg> 文档文本或 data:image/svg+xml URL");
  }

  const docTitle = stripTags(text.match(/<title\b[\s\S]*?<\/title>/i)?.[0] || "") || title;
  const paragraphs = [...text.matchAll(/<text\b[\s\S]*?<\/text>/gi)]
    .map((match) => stripTags(match[0]))
    .filter(Boolean);

  const assetStore = createAssetStore();
  const svgDataUrl = dataUrl || bytesToDataUrl(textToBytes(text), "image/svg+xml");
  const fallbackName = String(title || "image").toLowerCase().endsWith(".svg") ? title : `${title}.svg`;
  const asset = assetStore.add({
    name: fileName || fallbackName,
    mime: "image/svg+xml",
    data: svgDataUrl,
    size: svgDataUrl.length,
    role: "image",
  });

  return createDocumentModel({
    title: docTitle,
    sourceFormat: format,
    blocks: [
      createHeading(1, docTitle),
      createAssetReference(asset.id, { alt: docTitle, title: docTitle }),
      ...paragraphs.map((line) => createParagraph(line)),
    ],
    assets: assetStore.toJSON(),
    metadata: {
      svg: {
        textElementCount: paragraphs.length,
        fileName,
      },
    },
  });
}
