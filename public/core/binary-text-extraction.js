import { decodeTextBytes } from "./text-decoding.js";

function base64ToBytes(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  return new Uint8Array();
}

function coerceBinaryBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  const text = String(content ?? "");
  const dataUrlMatch = text.match(/^data:[^;]+;base64,(.+)$/);
  if (dataUrlMatch) {
    return base64ToBytes(dataUrlMatch[1]);
  }
  return new TextEncoder().encode(text);
}

function pushTextCode(buffer, code) {
  if (code === 9) {
    buffer.push(" ");
    return;
  }
  if (code === 10 || code === 13) {
    buffer.push("\n");
    return;
  }
  buffer.push(String.fromCharCode(code));
}

function normalizeCandidateText(text) {
  return String(text ?? "")
    .replace(/\u0000+/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// readable 覆盖假名/谚文/CJK 兼容区；noise 同步排除这些区段与 CJK 标点/全角形式，
// 否则日韩文与中文标点被计噪 ×8 直接压垮真实正文候选（issue #89）。
function scoreCandidateText(text) {
  const cleaned = normalizeCandidateText(text);
  if (!cleaned) {
    return -Infinity;
  }
  const readable = (cleaned.match(/[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/g) || []).length;
  const whitespace = (cleaned.match(/[\n\s]/g) || []).length;
  const control = (String(text).match(/[\u0000-\u0008\u000B-\u001F]/g) || []).length;
  const noise = (cleaned.match(/[^A-Za-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff\u3000-\u303f\uff00-\uffef\u2014\u2018-\u201d\u2026\n\s.,:;!?()\-_/]/g) || []).length;
  return readable * 4 + whitespace * 2 - control * 10 - noise * 8 + Math.min(cleaned.length, 4096) * 0.2;
}

function scanAsciiRuns(bytes, minLength = 12) {
  const runs = [];
  let buffer = [];
  for (const byte of bytes) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      pushTextCode(buffer, byte);
      continue;
    }
    if (buffer.length >= minLength) {
      runs.push(normalizeCandidateText(buffer.join("")));
    }
    buffer = [];
  }
  if (buffer.length >= minLength) {
    runs.push(normalizeCandidateText(buffer.join("")));
  }
  return runs.filter(Boolean);
}

function isPrintableUtf16Code(code) {
  if (code === 9 || code === 10 || code === 13) return true;
  if (code < 32) return false; // C0 控制区（含 0）
  if (code >= 0x7f && code <= 0x9f) return false; // DEL + C1 控制区
  if (code === 0xfffe || code === 0xffff) return false; // noncharacter
  return true;
}

// 全 BMP 码元扫描（issue #89）：旧实现只接受高字节为 0 的码元，中文（高字节
// 非 0）一进来就 flush，.doc 的 UTF-16 中文正文永远提取不到。
function scanUtf16Runs(bytes, littleEndian = true, minLength = 8) {
  const runs = [];
  for (const startOffset of [0, 1]) {
    let buffer = [];
    const flush = () => {
      if (buffer.length >= minLength) {
        runs.push(normalizeCandidateText(buffer.join("")));
      }
      buffer = [];
    };
    for (let index = startOffset; index + 1 < bytes.length; index += 2) {
      const code = littleEndian
        ? (bytes[index] | (bytes[index + 1] << 8))
        : ((bytes[index] << 8) | bytes[index + 1]);
      // 代理对：高代理后跟低代理则成对保留；孤立代理 flush
      if (code >= 0xd800 && code <= 0xdbff) {
        if (index + 3 < bytes.length) {
          const next = littleEndian
            ? (bytes[index + 2] | (bytes[index + 3] << 8))
            : ((bytes[index + 2] << 8) | bytes[index + 3]);
          if (next >= 0xdc00 && next <= 0xdfff) {
            buffer.push(String.fromCharCode(code, next));
            index += 2;
            continue;
          }
        }
        flush();
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        flush();
        continue;
      }
      if (isPrintableUtf16Code(code)) {
        pushTextCode(buffer, code);
        continue;
      }
      flush();
    }
    flush();
  }
  return runs.filter(Boolean);
}

export function extractReadableTextFromBinary(content, { fileName = "", mime = "", format = "doc" } = {}) {
  const bytes = coerceBinaryBytes(content);
  const decoded = decodeTextBytes(bytes, { fileName, mime });
  // 每个扫描族额外推入合并候选：.doc 正文常被 field/cell 标记切碎成多个 run，
  // 单 run 不足以胜出时合并候选可整体竞争。
  const asciiRuns = scanAsciiRuns(bytes);
  const utf16leRuns = scanUtf16Runs(bytes, true);
  const utf16beRuns = scanUtf16Runs(bytes, false);
  const candidates = [
    decoded.text,
    ...asciiRuns,
    asciiRuns.join("\n"),
    ...utf16leRuns,
    utf16leRuns.join("\n"),
    ...utf16beRuns,
    utf16beRuns.join("\n"),
  ]
    .map((text) => normalizeCandidateText(text))
    .filter(Boolean);

  const scored = [...new Set(candidates)]
    .map((text) => ({ text, score: scoreCandidateText(text) }))
    .filter((item) => item.score > -Infinity)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length);

  const best = scored[0] || { text: normalizeCandidateText(decoded.text), score: scoreCandidateText(decoded.text) };
  return {
    text: best.text,
    source: best.text === normalizeCandidateText(decoded.text) ? decoded.encoding || format : "binary-runs",
    byteLength: bytes.length,
    candidateCount: scored.length,
  };
}
