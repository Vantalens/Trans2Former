import { ConversionError } from "../conversion-error.js";
import { verifyChecksum } from "../model-cache/checksum.js";

export const PADDLE_OCR_VENDOR_FILES = Object.freeze({
  "det.onnx": Object.freeze({
    size: 4748769,
    sha256: "d7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924",
    required: true,
  }),
  "rec.onnx": Object.freeze({
    size: 16559278,
    sha256: "d253c3cbee6e507828a5271a30ab0ec8ae7c2a99d0cc8e6f844fe380809d22b3",
    required: true,
  }),
  "dict.txt": Object.freeze({
    size: 74014,
    sha256: "9dfc80c50b6cb07399a47a7cf25d11db475fb4ad0e1fc96b2eff6467c8166ff3",
    required: true,
  }),
});

// Bundle digest = SHA-256 over "<fileName>:<sha256>\n" lines sorted by file name.
// Reproduce with: node -e "const c=require('crypto'),m=require('./scripts/paddleocr-models.manifest.json');
//   console.log(c.createHash('sha256').update(m.files.map(f=>f.target+':'+f.sha256).sort().join('\n')+'\n').digest('hex'))"
// Guarded by scripts/model-cache-test.js (recomputed against scripts/paddleocr-models.manifest.json).
export const PADDLE_OCR_VENDOR_DIGEST = "2e92298990df866c4d6e3a31344197beda67a124e348013aa12038db23e15b93";
export const PADDLE_OCR_VENDOR_BUNDLE_SIZE = Object.values(PADDLE_OCR_VENDOR_FILES)
  .reduce((sum, file) => sum + file.size, 0);

export function getPaddleVendorFileSpec(fileName) {
  return PADDLE_OCR_VENDOR_FILES[String(fileName || "")] || null;
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

export async function verifyPaddleVendorFile(fileName, buffer) {
  const spec = getPaddleVendorFileSpec(fileName);
  if (!spec) {
    return {
      ok: true,
      actual: "",
      expected: "",
      checked: false,
      reason: "no-known-digest",
    };
  }
  const byteLength = buffer?.byteLength ?? 0;
  if (byteLength !== spec.size) {
    throw new ConversionError(`PP-OCRv5 ${fileName} size does not match the pinned manifest.`, {
      category: "validate",
      code: "MODEL_CHECKSUM_MISMATCH",
      details: { fileName, expectedSize: spec.size, actualSize: byteLength, reason: "size-mismatch" },
    });
  }
  if (looksLikeHtml(buffer)) {
    throw new ConversionError(`PP-OCRv5 ${fileName} resolved to an HTML fallback instead of a model asset.`, {
      category: "validate",
      code: "MODEL_CHECKSUM_MISMATCH",
      details: { fileName, reason: "html-fallback" },
    });
  }
  const result = await verifyChecksum(buffer, spec.sha256);
  if (!result.ok) {
    throw new ConversionError(`PP-OCRv5 ${fileName} SHA-256 does not match the pinned manifest.`, {
      category: "validate",
      code: "MODEL_CHECKSUM_MISMATCH",
      details: { fileName, expected: result.expected, actual: result.actual, reason: "sha256-mismatch" },
    });
  }
  return { ...result, checked: true, size: byteLength };
}
