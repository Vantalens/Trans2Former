import { ConversionError } from "../conversion-error.js";

const VENDOR_PDFJS = "/vendor/pdfjs/pdf.min.mjs";

function ensureBrowserRuntime() {
  if (typeof globalThis === "undefined") {
    throw new ConversionError("Browser PDF rasterizer needs a DOM runtime.", {
      category: "convert",
      code: "OCR_RASTERIZER_UNAVAILABLE",
      details: { reason: "missing-globalThis" },
    });
  }
  if (typeof globalThis.document?.createElement !== "function") {
    throw new ConversionError("Browser PDF rasterizer needs document.createElement.", {
      category: "convert",
      code: "OCR_RASTERIZER_UNAVAILABLE",
      details: { reason: "missing-document" },
    });
  }
}

function decodePdfContent(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof content === "string") {
    if (content.startsWith("data:")) {
      const commaIdx = content.indexOf(",");
      const meta = content.slice(5, commaIdx);
      const isBase64 = meta.includes(";base64");
      const payload = content.slice(commaIdx + 1);
      if (isBase64) {
        const decoded = globalThis.atob(payload);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
        return bytes;
      }
      return new TextEncoder().encode(decodeURIComponent(payload));
    }
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i += 1) bytes[i] = content.charCodeAt(i) & 0xff;
    return bytes;
  }
  throw new ConversionError("Unsupported PDF content type for browser rasterizer.", {
    category: "validate",
    code: "OCR_RASTERIZER_FAILED",
    details: { reason: "unsupported-content-type" },
  });
}

async function loadPdfJs(vendorUrl = VENDOR_PDFJS) {
  try {
    const mod = await import(/* @vite-ignore */ vendorUrl);
    if (typeof mod?.getDocument !== "function") {
      throw new Error("vendor pdfjs missing getDocument");
    }
    return mod;
  } catch (error) {
    throw new ConversionError(`PDF.js vendor 加载失败：${error?.message || error}`, {
      category: "convert",
      code: "OCR_RASTERIZER_UNAVAILABLE",
      details: { reason: "vendor-pdfjs-load-failed", cause: String(error?.name || error?.message || "unknown"), vendorUrl },
    });
  }
}

async function openDocument(pdfjs, content) {
  const data = decodePdfContent(content);
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true });
  try {
    return await loadingTask.promise;
  } catch (error) {
    throw new ConversionError(`PDF document 解析失败：${error?.message || error}`, {
      category: "convert",
      code: "OCR_RASTERIZER_FAILED",
      details: { reason: "pdf-document-open-failed", cause: String(error?.name || error?.message || "unknown") },
    });
  }
}

export function createBrowserPdfPageRasterizer({ vendorUrl = VENDOR_PDFJS } = {}) {
  let pdfjsPromise = null;
  async function getPdfJs() {
    if (!pdfjsPromise) pdfjsPromise = loadPdfJs(vendorUrl);
    return pdfjsPromise;
  }

  return Object.freeze({
    async countPages({ content }) {
      ensureBrowserRuntime();
      const pdfjs = await getPdfJs();
      const document = await openDocument(pdfjs, content);
      try {
        return document.numPages;
      } finally {
        if (typeof document.destroy === "function") document.destroy();
      }
    },
    async rasterize({ content, pageIndex = 0, dpi = 144 }) {
      ensureBrowserRuntime();
      const pdfjs = await getPdfJs();
      const document = await openDocument(pdfjs, content);
      try {
        const page = await document.getPage(pageIndex + 1);
        try {
          const scale = Math.max(0.5, dpi / 72);
          const viewport = page.getViewport({ scale });
          const canvas = globalThis.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const canvasContext = canvas.getContext("2d");
          if (!canvasContext) {
            throw new ConversionError("Canvas context (2d) 不可用，无法 rasterize。", {
              category: "convert",
              code: "OCR_RASTERIZER_FAILED",
              details: { reason: "canvas-context-missing" },
            });
          }
          await page.render({ canvasContext, viewport }).promise;
          const dataUrl = canvas.toDataURL("image/png");
          return { dataUrl, width: canvas.width, height: canvas.height };
        } finally {
          if (typeof page.cleanup === "function") page.cleanup();
        }
      } catch (error) {
        if (error instanceof ConversionError) throw error;
        throw new ConversionError(`Rasterize PDF page ${pageIndex} 失败：${error?.message || error}`, {
          category: "convert",
          code: "OCR_RASTERIZER_FAILED",
          details: { reason: "page-render-failed", pageIndex, cause: String(error?.name || error?.message || "unknown") },
        });
      } finally {
        if (typeof document.destroy === "function") document.destroy();
      }
    },
  });
}
