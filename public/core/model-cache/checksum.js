import { ConversionError } from "../conversion-error.js";

function ensureSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new ConversionError("crypto.subtle.digest is not available in the current runtime.", {
      category: "validate",
      code: "MODEL_CHECKSUM_UNSUPPORTED",
      details: { reason: "subtle-crypto-missing" },
    });
  }
  return subtle;
}

function coerceToArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  if (typeof input === "string") {
    const encoder = new TextEncoder();
    return encoder.encode(input).buffer;
  }
  throw new ConversionError("sha256Hex requires ArrayBuffer, TypedArray, or string input.", {
    category: "validate",
    code: "MODEL_CHECKSUM_INVALID_INPUT",
    details: { reason: "unsupported-input-type" },
  });
}

function bytesToHex(bytes) {
  const out = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[i] = bytes[i].toString(16).padStart(2, "0");
  }
  return out.join("");
}

export async function sha256Hex(input) {
  const subtle = ensureSubtleCrypto();
  const buffer = coerceToArrayBuffer(input);
  const digest = await subtle.digest("SHA-256", buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyChecksum(input, expectedDigest) {
  if (typeof expectedDigest !== "string" || expectedDigest.length === 0) {
    throw new ConversionError("verifyChecksum requires a non-empty expected digest.", {
      category: "validate",
      code: "MODEL_CHECKSUM_INVALID_INPUT",
      details: { reason: "missing-expected-digest" },
    });
  }
  const actual = await sha256Hex(input);
  const normalizedExpected = expectedDigest.trim().toLowerCase();
  return {
    ok: actual === normalizedExpected,
    actual,
    expected: normalizedExpected,
  };
}
