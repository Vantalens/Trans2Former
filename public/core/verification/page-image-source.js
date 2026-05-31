// 像素源抽象：SSIM 视觉回环层需要把某个格式的某一页栅格化为 RGBA 像素缓冲。
// 与 OCR 的 pdf-rasterizer 分离关注点（OCR 要 PNG dataUrl，SSIM 要原始像素）。
// Node 默认不可用（抛错）；浏览器/Tauri 首次调用 dynamic import canvas 实现；
// 测试通过 setPageImageSource 注入 stub。

import { ConversionError } from "../conversion-error.js";

export const VERIFICATION_IMAGE_SOURCE_UNAVAILABLE = "VERIFICATION_IMAGE_SOURCE_UNAVAILABLE";
export const VERIFICATION_IMAGE_SOURCE_FAILED = "VERIFICATION_IMAGE_SOURCE_FAILED";

// 当前视觉回环支持的可栅格化格式（有源图 / 输出可渲染）。
export const RASTERIZABLE_FORMATS = new Set(["pdf", "png"]);

function isBrowserRuntime() {
  return typeof globalThis !== "undefined"
    && typeof globalThis.document?.createElement === "function";
}

let _injectedSource = null;
let _autoBrowserImpl = null;
let _autoBrowserLoadFailed = false;

async function tryLoadBrowserSource() {
  if (_autoBrowserImpl) return _autoBrowserImpl;
  if (_autoBrowserLoadFailed) return null;
  if (!isBrowserRuntime()) {
    _autoBrowserLoadFailed = true;
    return null;
  }
  try {
    const mod = await import("./page-image-source-browser.js");
    _autoBrowserImpl = mod.createBrowserPageImageSource();
    return _autoBrowserImpl;
  } catch (error) {
    _autoBrowserLoadFailed = true;
    return null;
  }
}

function throwUnavailable(operation) {
  throw new ConversionError(
    `验证阶段像素源在当前运行时不可用（${operation}）。请用 setPageImageSource 注入实现，或在浏览器/Tauri 端启用 vendor pdfjs + canvas。`,
    {
      category: "convert",
      code: VERIFICATION_IMAGE_SOURCE_UNAVAILABLE,
      details: { reason: "no-runtime-image-source", operation },
    },
  );
}

export const defaultPageImageSource = Object.freeze({
  async getPageImage(args) {
    if (_injectedSource) return _injectedSource.getPageImage(args);
    const browserImpl = await tryLoadBrowserSource();
    if (browserImpl) return browserImpl.getPageImage(args);
    throwUnavailable("getPageImage");
  },
});

export function setPageImageSource(impl) {
  if (!impl || typeof impl.getPageImage !== "function") {
    throw new ConversionError("setPageImageSource requires a { getPageImage } function.", {
      category: "validate",
      code: "VERIFICATION_IMAGE_SOURCE_INVALID",
      details: { reason: "missing-methods" },
    });
  }
  _injectedSource = impl;
}

export function resetPageImageSource() {
  _injectedSource = null;
  _autoBrowserImpl = null;
  _autoBrowserLoadFailed = false;
}
