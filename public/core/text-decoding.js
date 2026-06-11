const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

const EXTENSION_ENCODING_HINTS = new Map([
  ["csv", ["utf-8", "gb18030", "big5"]],
  ["txt", ["utf-8", "gb18030", "big5"]],
  ["md", ["utf-8", "gb18030", "big5"]],
  ["html", ["utf-8", "gb18030", "big5"]],
  ["htm", ["utf-8", "gb18030", "big5"]],
  ["xml", ["utf-8", "gb18030", "big5"]],
  ["ofd", ["utf-8", "gb18030"]],
]);

function startsWith(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function getExtension(fileName = "") {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

function normalizeEncoding(value = "") {
  const normalized = String(value).trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "";
  if (["gbk", "gb2312", "gb-2312", "gb18030"].includes(normalized)) return "gb18030";
  if (["utf8", "utf-8"].includes(normalized)) return "utf-8";
  if (["utf16le", "utf-16le"].includes(normalized)) return "utf-16le";
  if (["utf16be", "utf-16be"].includes(normalized)) return "utf-16be";
  return normalized;
}

function safeDecode(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function strictDecode(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return "";
  }
}

function sniffDeclaredEncoding(bytes) {
  const ascii = Array.from(bytes.slice(0, Math.min(bytes.length, 4096)))
    .map((byte) => byte < 128 ? String.fromCharCode(byte) : " ")
    .join("");
  const charset = ascii.match(/charset\s*=\s*["']?([a-z0-9._-]+)/i)?.[1];
  if (charset) return normalizeEncoding(charset);
  const xmlEncoding = ascii.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i)?.[1];
  return normalizeEncoding(xmlEncoding || "");
}

function countReplacement(text) {
  return (String(text).match(/\uFFFD/g) || []).length;
}

function countCjk(text) {
  return (String(text).match(/[\u3400-\u9fff]/g) || []).length;
}

function countMojibakeHints(text) {
  return (String(text).match(/[ÃÂ¤åæçèéï¿½]/g) || []).length;
}

function countPrivateUse(text) {
  return (String(text).match(/[\ue000-\uf8ff]/g) || []).length;
}

function countControl(text) {
  return (String(text).match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length;
}

function asciiPrintableRatio(text) {
  const value = String(text || "");
  if (!value.length) return 0;
  const printable = (value.match(/[\u0009\u000a\u000d\u0020-\u007e]/g) || []).length;
  return printable / value.length;
}

function scoreDecodedText(text, encoding) {
  const value = String(text || "");
  let score = countReplacement(value) * 100
    + countMojibakeHints(value) * 8
    + countPrivateUse(value) * 40
    + countControl(value) * 20;
  if (asciiPrintableRatio(value) > 0.75) {
    score -= 20;
  }
  if (encoding === "utf-8" && countReplacement(value) === 0) {
    score -= 5;
  }
  if (encoding.startsWith("utf-16") && value.length > 0 && countCjk(value) / value.length > 0.6) {
    score -= 10;
  }
  return score;
}

function candidateEncodings({ declaredEncoding = "", fileName = "", mime = "" } = {}) {
  const extension = getExtension(fileName);
  const textLikeMime = String(mime || "").toLowerCase();
  const candidates = [
    declaredEncoding,
    ...(EXTENSION_ENCODING_HINTS.get(extension) || ["utf-8"]),
    ...(textLikeMime.startsWith("text/") || textLikeMime.includes("xml") || textLikeMime.includes("json") ? ["utf-16le", "utf-16be"] : []),
    "utf-8",
  ].map(normalizeEncoding).filter(Boolean);
  return [...new Set(candidates)];
}

export function decodeTextBytes(bytesLike, { fileName = "", mime = "", encoding = "", trustEncoding = false } = {}) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike || []);
  if (startsWith(bytes, UTF8_BOM)) {
    return { text: safeDecode(bytes.slice(3), "utf-8"), encoding: "utf-8", bom: true };
  }
  if (startsWith(bytes, UTF16LE_BOM)) {
    return { text: safeDecode(bytes.slice(2), "utf-16le"), encoding: "utf-16le", bom: true };
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return { text: safeDecode(bytes.slice(2), "utf-16be"), encoding: "utf-16be", bom: true };
  }

  const explicitEncoding = normalizeEncoding(encoding);
  if (trustEncoding && explicitEncoding) {
    const text = safeDecode(bytes, explicitEncoding);
    return {
      text,
      encoding: explicitEncoding,
      bom: false,
      hadReplacement: countReplacement(text) > 0,
    };
  }

  const declaredEncoding = explicitEncoding || sniffDeclaredEncoding(bytes);
  if (!declaredEncoding || declaredEncoding === "utf-8") {
    const utf8Text = strictDecode(bytes, "utf-8");
    if (utf8Text && countControl(utf8Text) === 0) {
      return {
        text: utf8Text,
        encoding: "utf-8",
        bom: false,
        hadReplacement: false,
      };
    }
  }

  const candidates = candidateEncodings({ declaredEncoding, fileName, mime });
  const decoded = candidates
    .map((candidate) => ({ encoding: candidate, text: safeDecode(bytes, candidate) }))
    .filter((item) => item.text)
    .sort((a, b) => scoreDecodedText(a.text, a.encoding) - scoreDecodedText(b.text, b.encoding));
  const best = decoded[0] || { encoding: "utf-8", text: safeDecode(bytes, "utf-8") };
  return {
    ...best,
    bom: false,
    hadReplacement: countReplacement(best.text) > 0,
  };
}

export async function readBlobAsDecodedText(blob, { fileName = blob?.name || "", mime = blob?.type || "" } = {}) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return decodeTextBytes(bytes, { fileName, mime });
}
