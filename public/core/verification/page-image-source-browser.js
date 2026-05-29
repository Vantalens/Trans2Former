// 浏览器/Tauri 端像素源实现：PDF 经 vendor pdfjs rasterize 得 PNG dataUrl，PNG 直接用
// 其 dataUrl/bytes，统一通过 Image → canvas → getImageData 取 RGBA 像素。仅在 DOM runtime
// 可用；Node 测试用注入 stub。本文件不联网，所有资源走同源 vendor / blob / dataUrl。

import { ConversionError } from "../conversion-error.js";
import { createBrowserPdfPageRasterizer } from "../ocr/pdf-rasterizer-browser.js";

function ensureBrowserRuntime() {
  if (typeof globalThis === "undefined" || typeof globalThis.document?.createElement !== "function") {
    throw new ConversionError("Browser page image source needs a DOM runtime.", {
      category: "convert",
      code: "VERIFICATION_IMAGE_SOURCE_UNAVAILABLE",
      details: { reason: "missing-document" },
    });
  }
}

function toPngDataUrl(content) {
  if (typeof content === "string") {
    if (content.startsWith("data:")) return content;
    // 裸 base64 / 二进制字符串：包成 png dataUrl 让浏览器解码。
    return `data:image/png;base64,${globalThis.btoa(content)}`;
  }
  if (content instanceof Uint8Array || content instanceof ArrayBuffer) {
    const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return `data:image/png;base64,${globalThis.btoa(binary)}`;
  }
  throw new ConversionError("Unsupported PNG content type for browser image source.", {
    category: "validate",
    code: "VERIFICATION_IMAGE_SOURCE_FAILED",
    details: { reason: "unsupported-content-type" },
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ConversionError("Image 解码失败。", {
      category: "convert",
      code: "VERIFICATION_IMAGE_SOURCE_FAILED",
      details: { reason: "image-decode-failed" },
    }));
    image.src = dataUrl;
  });
}

function drawToPixels(image, width, height) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ConversionError("Canvas 2d context 不可用。", {
      category: "convert",
      code: "VERIFICATION_IMAGE_SOURCE_FAILED",
      details: { reason: "canvas-context-missing" },
    });
  }
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { pixels: imageData.data, width, height };
}

export function createBrowserPageImageSource({ dpi = 144 } = {}) {
  let pdfRasterizer = null;
  function getPdfRasterizer() {
    if (!pdfRasterizer) pdfRasterizer = createBrowserPdfPageRasterizer();
    return pdfRasterizer;
  }

  return Object.freeze({
    async getPageImage({ format, content, pageIndex = 0, dpi: dpiOverride } = {}) {
      ensureBrowserRuntime();
      const normalized = String(format || "").toLowerCase();
      if (normalized === "pdf") {
        const raster = await getPdfRasterizer().rasterize({ content, pageIndex, dpi: dpiOverride || dpi });
        const image = await loadImage(raster.dataUrl);
        return drawToPixels(image, raster.width, raster.height);
      }
      if (normalized === "png") {
        const image = await loadImage(toPngDataUrl(content));
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        return drawToPixels(image, width, height);
      }
      throw new ConversionError(`像素源不支持格式：${normalized}`, {
        category: "convert",
        code: "VERIFICATION_IMAGE_SOURCE_FAILED",
        details: { reason: "format-not-rasterizable", format: normalized },
      });
    },
  });
}
