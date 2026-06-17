import { ConversionError } from "../conversion-error.js";
import { expandPdfContentForTextExtraction, readPdf } from "../../formats/pdf.js";

export const OCR_RASTERIZER_UNAVAILABLE = "OCR_RASTERIZER_UNAVAILABLE";
export const OCR_RASTERIZER_FAILED = "OCR_RASTERIZER_FAILED";

const DEFAULT_SCAN_PDF_THRESHOLD = 300;
const DEFAULT_DPI = 144;

function textOfBlock(block) {
  if (!block || typeof block !== "object") return "";
  // 修复 issue #99: 跳过 raw 块（如嵌入的 base64 PDF）不计入文本统计
  if (block.type === "raw") return "";
  if (typeof block.text === "string") return block.text;
  if (Array.isArray(block.items)) return block.items.join(" ");
  if (Array.isArray(block.rows)) return block.rows.flat().join(" ");
  if (typeof block.code === "string") return block.code;
  if (typeof block.content === "string") return block.content;
  return "";
}

function countModelText(model) {
  const blocks = Array.isArray(model?.blocks) ? model.blocks : [];
  let total = 0;
  for (const block of blocks) {
    total += textOfBlock(block).replace(/\s+/g, "").length;
  }
  return total;
}

const PDFJS_PAYLOAD_MARKER = "% Trans2Former PDFJS_TEXT_START";

export async function isScannedPdf(content, options = {}) {
  const threshold = typeof options?.scanPdfThreshold === "number"
    ? options.scanPdfThreshold
    : DEFAULT_SCAN_PDF_THRESHOLD;
  try {
    const expanded = await expandPdfContentForTextExtraction(content);
    const hasPdfJsPayload = typeof expanded === "string" && expanded.includes(PDFJS_PAYLOAD_MARKER);
    if (!hasPdfJsPayload) {
      return {
        scanned: true,
        extractedChars: 0,
        pageCount: 0,
        threshold,
        reason: "no-pdfjs-payload",
      };
    }
    const model = readPdf({ content: expanded, title: "isScannedPdf-probe", fileName: "" });
    // 加密 PDF 不是扫描件：走 OCR 链路只会逐页 open 失败产出误导 warning（issue #104）
    if (model?.metadata?.pdf?.encrypted) {
      return {
        scanned: false,
        extractedChars: 0,
        pageCount: 0,
        threshold,
        reason: "encrypted",
      };
    }
    const extractedChars = countModelText(model);
    // 修复：从 metadata.pdf.pageCount 读取页数（而非不存在的 metadata.pages）
    const pageCount = model?.metadata?.pdf?.pageCount || 0;

    // 修复：按页归一化阈值，避免多页扫描件因累计水印文字超过固定300阈值而被误判为文本PDF
    // 使用每页阈值：如果平均每页提取字符数 < 每页阈值，则判定为扫描件
    const perPageThreshold = threshold;
    const avgCharsPerPage = pageCount > 0 ? extractedChars / pageCount : extractedChars;
    const isScanned = avgCharsPerPage < perPageThreshold;

    return {
      scanned: isScanned,
      extractedChars,
      pageCount,
      threshold,
      reason: isScanned ? "low-extracted-text" : "text-pdf",
    };
  } catch (error) {
    return {
      scanned: true,
      extractedChars: 0,
      pageCount: 0,
      threshold,
      reason: `extraction-failed:${error?.code || error?.message || "unknown"}`,
    };
  }
}

function isBrowserRuntime() {
  return typeof globalThis !== "undefined"
    && typeof globalThis.document?.createElement === "function";
}

let _injectedRasterizer = null;
let _autoBrowserImpl = null;
let _autoBrowserLoadFailed = false;

async function tryLoadBrowserRasterizer() {
  if (_autoBrowserImpl) return _autoBrowserImpl;
  if (_autoBrowserLoadFailed) return null;
  if (!isBrowserRuntime()) {
    _autoBrowserLoadFailed = true;
    return null;
  }
  try {
    const mod = await import("./pdf-rasterizer-browser.js");
    _autoBrowserImpl = mod.createBrowserPdfPageRasterizer();
    return _autoBrowserImpl;
  } catch (error) {
    _autoBrowserLoadFailed = true;
    return null;
  }
}

function throwUnavailable(operation) {
  throw new ConversionError(
    `默认 PDF rasterizer 在当前运行时不可用（${operation}）。请用 setPdfPageRasterizer 注入实现，或在浏览器/Tauri 端启用 vendor pdfjs。`,
    {
      category: "convert",
      code: OCR_RASTERIZER_UNAVAILABLE,
      details: { reason: "no-runtime-rasterizer", operation },
    },
  );
}

export const defaultPdfPageRasterizer = Object.freeze({
  async rasterize(args) {
    if (_injectedRasterizer) return _injectedRasterizer.rasterize(args);
    const browserImpl = await tryLoadBrowserRasterizer();
    if (browserImpl) return browserImpl.rasterize(args);
    throwUnavailable("rasterize");
  },
  async countPages(args) {
    if (_injectedRasterizer) return _injectedRasterizer.countPages(args);
    const browserImpl = await tryLoadBrowserRasterizer();
    if (browserImpl) return browserImpl.countPages(args);
    throwUnavailable("countPages");
  },
  get DPI_DEFAULT() {
    return DEFAULT_DPI;
  },
});

export function setPdfPageRasterizer(impl) {
  if (!impl || typeof impl.rasterize !== "function" || typeof impl.countPages !== "function") {
    throw new ConversionError("setPdfPageRasterizer requires { rasterize, countPages } functions.", {
      category: "validate",
      code: "OCR_RASTERIZER_INVALID",
      details: { reason: "missing-methods" },
    });
  }
  _injectedRasterizer = impl;
}

export function resetPdfPageRasterizer() {
  _injectedRasterizer = null;
  _autoBrowserImpl = null;
  _autoBrowserLoadFailed = false;
}
