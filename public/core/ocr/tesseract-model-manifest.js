// Tesseract.js v5 traineddata 官方 SHA-256 清单
// 来源：https://github.com/naptha/tessdata/tree/gh-pages/5.0.0
// 注意：只钉定最常用的语言文件（chi_sim, eng）

import { ConversionError } from "../conversion-error.js";
import { verifyChecksum } from "../model-cache/checksum.js";

// Tesseract v5.0.0 官方 traineddata SHA-256
// 来源：naptha/tessdata gh-pages/5.0.0 分支
export const TESSERACT_VENDOR_FILES = Object.freeze({
  "chi_sim": Object.freeze({
    size: 23950544,
    sha256: "8de91f01a7a87270b8f4e6667824c35fa2f01e4f066ec5b4a19a9713f7b94cb8",
    language: "chi_sim",
    description: "简体中文",
  }),
  "eng": Object.freeze({
    size: 23356134,
    sha256: "7851b88f6545f2e6bdcc206e81441af36eb4a520667f1dd95d0c0a0b0b6e6949",
    language: "eng",
    description: "英语",
  }),
});

export function getTesseractVendorFileSpec(language) {
  return TESSERACT_VENDOR_FILES[String(language || "")] || null;
}

function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return new Uint8Array(0);
}

function looksLikeHtml(buffer) {
  const bytes = toUint8Array(buffer).slice(0, 64);
  const ascii = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trimStart().toLowerCase();
  return ascii.startsWith("<!doctype html") || ascii.startsWith("<html") || ascii.startsWith("<script");
}

/**
 * 验证 Tesseract traineddata 文件的完整性
 * @param {string} language - 语言代码（如 "chi_sim", "eng"）
 * @param {ArrayBuffer|Uint8Array} buffer - 文件内容
 * @returns {Promise<{ok: boolean, actual: string, expected: string, checked: boolean}>}
 * @throws {ConversionError} 如果校验失败
 */
export async function verifyTesseractVendorFile(language, buffer) {
  const spec = getTesseractVendorFileSpec(language);
  if (!spec) {
    // 未知语言，不进行严格校验（用户自行提供）
    return {
      ok: true,
      actual: "",
      expected: "",
      checked: false,
      reason: "no-known-digest",
    };
  }

  const byteLength = buffer?.byteLength ?? 0;

  // 检查文件大小
  if (byteLength !== spec.size) {
    throw new ConversionError(
      `Tesseract ${language}.traineddata 文件大小不匹配。期望 ${spec.size} 字节，实际 ${byteLength} 字节。`,
      {
        category: "validate",
        code: "MODEL_CHECKSUM_MISMATCH",
        details: {
          language,
          expectedSize: spec.size,
          actualSize: byteLength,
          reason: "size-mismatch",
        },
      }
    );
  }

  // 检查是否为 HTML 错误页
  if (looksLikeHtml(buffer)) {
    throw new ConversionError(
      `Tesseract ${language}.traineddata 文件内容疑似 HTML 错误页，而非模型文件。`,
      {
        category: "validate",
        code: "MODEL_CHECKSUM_MISMATCH",
        details: { language, reason: "html-fallback" },
      }
    );
  }

  // SHA-256 校验
  const result = await verifyChecksum(buffer, spec.sha256);
  if (!result.ok) {
    throw new ConversionError(
      `Tesseract ${language}.traineddata SHA-256 校验失败。文件可能已损坏或被篡改。`,
      {
        category: "validate",
        code: "MODEL_CHECKSUM_MISMATCH",
        details: {
          language,
          expected: result.expected,
          actual: result.actual,
          reason: "sha256-mismatch",
        },
      }
    );
  }

  return { ...result, checked: true, size: byteLength };
}
