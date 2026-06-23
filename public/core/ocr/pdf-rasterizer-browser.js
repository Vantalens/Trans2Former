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

  // PDF document 缓存：按 content 的弱标识缓存已打开的 document，避免多页扫描时重复解析
  let cachedDocument = null;
  let cachedContentRef = null;

  async function getCachedDocument(pdfjs, content) {
    // 简单缓存策略：如果 content 引用相同（多页扫描场景），复用 document
    if (cachedDocument && cachedContentRef === content) {
      return cachedDocument;
    }
    // 清理旧的 document
    if (cachedDocument && typeof cachedDocument.destroy === "function") {
      try {
        cachedDocument.destroy();
      } catch (error) {
        // ignore cleanup errors
      }
    }
    // 打开新 document 并缓存
    cachedDocument = await openDocument(pdfjs, content);
    cachedContentRef = content;
    return cachedDocument;
  }

  return Object.freeze({
    async countPages({ content }) {
      ensureBrowserRuntime();
      const pdfjs = await getPdfJs();
      const document = await getCachedDocument(pdfjs, content);
      return document.numPages;
    },
    async rasterize({ content, pageIndex = 0, dpi = 144 }) {
      ensureBrowserRuntime();
      const pdfjs = await getPdfJs();
      const document = await getCachedDocument(pdfjs, content);
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
      }
      // 注意：不在这里 destroy document，让它保持缓存供后续页面使用
    },
    // 显式清理接口，供外部在完成多页扫描后调用
    dispose() {
      if (cachedDocument && typeof cachedDocument.destroy === "function") {
        try {
          cachedDocument.destroy();
        } catch (error) {
          // ignore cleanup errors
        }
      }
      cachedDocument = null;
      cachedContentRef = null;
    },
  });
}
