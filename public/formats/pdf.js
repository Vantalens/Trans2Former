import { createDocumentModel, createHeading, createList, createParagraph, createRawBlock } from "../core/document-model.js";
import { createFixedLayoutModel } from "../core/models/fixed-layout.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { escapeHtml } from "./text-utils.js";

const PDF_FALLBACK_TEXT = "这是有效 PDF，但当前核心文本抽取器暂时无法读取其中的正文编码或压缩内容流。下方保留原 PDF 预览；如需转换为可编辑文本，请等待核心 OCR/Layout 增强或导入可复制文本的 PDF。";
const PDFJS_PAYLOAD_START = "% Trans2Former PDFJS_TEXT_START";
const PDFJS_PAYLOAD_END = "% Trans2Former PDFJS_TEXT_END";
const MAX_INFLATED_STREAM_BYTES = 64 * 1024 * 1024;
const MAX_INFLATED_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_EMBEDDED_PDF_BYTES = 4 * 1024 * 1024;

function decodePdfString(value) {
  return String(value ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function hexToBytes(hex) {
  // PDF 规范：奇数长度 hex 串末尾补 0（低 nibble），不是 padStart。
  // 例如 <F> → 0xF0，不是 0x0F。
  const clean = String(hex || "").replace(/\s+/g, "");
  const padded = clean.length % 2 ? `${clean}0` : clean;
  const bytes = [];
  for (let index = 0; index < padded.length; index += 2) {
    bytes.push(Number.parseInt(padded.slice(index, index + 2), 16));
  }
  return bytes;
}

function bytesToUtf16Be(bytes) {
  let output = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    output += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return output;
}

function bytesToLatin1(bytes) {
  let output = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.slice ? bytes.slice(offset, offset + chunkSize) : Array.prototype.slice.call(bytes, offset, offset + chunkSize);
    output += String.fromCharCode.apply(null, slice);
  }
  return output;
}

function decodePdfHexFallback(hex) {
  const bytes = hexToBytes(hex);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytesToUtf16Be(bytes.slice(2));
  }
  const zeroHighBytes = bytes.filter((byte, index) => index % 2 === 0 && byte === 0).length;
  if (bytes.length >= 4 && zeroHighBytes / Math.max(1, Math.floor(bytes.length / 2)) > 0.45) {
    return bytesToUtf16Be(bytes);
  }
  return bytesToLatin1(bytes);
}

function coercePdfText(content) {
  if (content instanceof Uint8Array) return new TextDecoder("latin1").decode(content);
  if (content instanceof ArrayBuffer) return new TextDecoder("latin1").decode(new Uint8Array(content));
  if (ArrayBuffer.isView(content)) return new TextDecoder("latin1").decode(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
  const text = String(content ?? "");
  const dataUrlMatch = text.match(/^data:[^;]+;base64,([A-Za-z0-9+/=]+)([\s\S]*)$/);
  if (dataUrlMatch) {
    const suffix = dataUrlMatch[2] || "";
    if (typeof atob === "function") {
      return atob(dataUrlMatch[1]) + suffix;
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(dataUrlMatch[1], "base64").toString("latin1") + suffix;
    }
  }
  return text;
}

function coercePdfBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  const text = String(content ?? "");
  const dataUrlMatch = text.match(/^data:[^;]+;base64,([A-Za-z0-9+/=]+)/);
  if (dataUrlMatch) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(dataUrlMatch[1], "base64"));
    if (typeof atob === "function") return binaryStringToBytes(atob(dataUrlMatch[1]));
  }
  return binaryStringToBytes(text);
}

function binaryStringToBase64(value) {
  const binary = String(value || "");
  if (typeof Buffer !== "undefined") {
    return Buffer.from(binary, "latin1").toString("base64");
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return "";
}

function toPdfDataUrl(content, source) {
  const text = String(content ?? "");
  const dataUrlMatch = text.match(/^(data:application\/pdf;base64,[A-Za-z0-9+/=]+)/);
  if (dataUrlMatch) {
    return dataUrlMatch[1];
  }
  return `data:application/pdf;base64,${binaryStringToBase64(source)}`;
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}

function printableRatio(text) {
  const value = String(text || "");
  if (!value.length) return 0;
  const printable = [...value].filter((char) => /[\t\n\r\u0020-\u007e\u00a0-\u024f\u3400-\u9fff]/u.test(char)).length;
  return printable / [...value].length;
}

function hasReadableContent(text) {
  return /[\p{L}\p{N}]/u.test(String(text || ""));
}

function isCrediblePdfText(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 2000) return false;
  const controls = (value.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length;
  const replacements = (value.match(/\uFFFD/g) || []).length;
  const suspicious = (value.match(/[�□]/g) || []).length;
  const length = [...value].length || 1;
  if (controls / length > 0.02 || replacements || suspicious / length > 0.05) return false;
  return printableRatio(value) >= 0.85 && hasReadableContent(value);
}

// 当 PDF 没有 ToUnicode CMap 时，从 BT...ET 抽出来的"文本"很可能是字体 Glyph ID 直接
// 以 latin1 解码，看起来像 "yX RX kX jX 9X" 这种短碎片。单条 isCrediblePdfText 拦不住
// （每个都是合法 ASCII），必须在整组层面判断。
function looksLikeFontGlyphIdNoise(strings) {
  if (!Array.isArray(strings) || strings.length < 8) return false;
  const trimmed = strings.map((value) => String(value || "").trim()).filter(Boolean);
  if (trimmed.length < 8) return false;

  let shortFragments = 0;
  let asciiNoSpace = 0;
  let asciiOnly = 0;
  const charFrequency = new Map();
  let totalChars = 0;
  for (const value of trimmed) {
    const length = [...value].length;
    if (length <= 4) shortFragments += 1;
    if (/^[\x21-\x7e]+$/.test(value) && !value.includes(" ")) asciiNoSpace += 1;
    if (/^[\x21-\x7e]+$/.test(value)) asciiOnly += 1;
    for (const char of value) {
      charFrequency.set(char, (charFrequency.get(char) || 0) + 1);
      totalChars += 1;
    }
  }
  const dominantChar = totalChars ? Math.max(0, ...charFrequency.values()) / totalChars : 0;
  const shortRatio = shortFragments / trimmed.length;
  const asciiNoSpaceRatio = asciiNoSpace / trimmed.length;
  const asciiOnlyRatio = asciiOnly / trimmed.length;

  // 三种典型字体 GID 乱码模式：
  // 1) 大半都是 ≤4 字符的短碎片
  // 2) 全 ASCII 不含空格，且没有任何超过 6 字符的"词"
  // 3) 单一字符（往往是 X / R）占比异常高
  if (shortRatio >= 0.6) return true;
  if (asciiNoSpaceRatio >= 0.85 && trimmed.every((value) => [...value].length <= 6)) return true;
  if (asciiOnlyRatio >= 0.9 && dominantChar >= 0.25) return true;
  return false;
}

function extractTextObjects(source) {
  return [...String(source || "").matchAll(/\bBT\b([\s\S]*?)\bET\b/g)].map((match) => match[1]);
}

function extractPdfJsPayload(source) {
  const text = String(source || "");
  const start = text.indexOf(PDFJS_PAYLOAD_START);
  if (start < 0) return null;
  const end = text.indexOf(PDFJS_PAYLOAD_END, start + PDFJS_PAYLOAD_START.length);
  if (end <= start) return null;
  const body = text.slice(start + PDFJS_PAYLOAD_START.length, end).trim();
  // 哨兵之间放 base64(JSON)，避免 PDF 抽出文本恰好包含哨兵字面量时被截断。
  // 兼容旧版未编码的明文 JSON。
  const tryParse = (json) => {
    try {
      const payload = JSON.parse(json);
      return Array.isArray(payload?.pages) ? payload : null;
    } catch {
      return null;
    }
  };
  if (body.startsWith("base64:")) {
    const raw = body.slice("base64:".length);
    if (typeof Buffer !== "undefined") return tryParse(Buffer.from(raw, "base64").toString("utf8"));
    if (typeof atob === "function") {
      try { return tryParse(decodeURIComponent(escape(atob(raw)))); } catch { return null; }
    }
    return null;
  }
  return tryParse(body);
}

function extractLiteralTextOperators(textObject) {
  return [...String(textObject || "").matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|"|TJ)/g)]
    .map((match) => decodePdfString(match[1]).trim())
    .filter(isCrediblePdfText);
}

function normalizeHexCode(value) {
  return String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function parseUnicodeHex(value) {
  return bytesToUtf16Be(hexToBytes(value));
}

function parseToUnicodeCMap(source) {
  const cmap = new Map();
  const text = String(source || "");
  for (const section of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const row of section[1].matchAll(/<([0-9A-Fa-f\s]+)>\s+<([0-9A-Fa-f\s]+)>/g)) {
      cmap.set(normalizeHexCode(row[1]), parseUnicodeHex(row[2]));
    }
  }
  for (const section of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const row of section[1].matchAll(/<([0-9A-Fa-f\s]+)>\s+<([0-9A-Fa-f\s]+)>\s+(?:<([0-9A-Fa-f\s]+)>|\[([\s\S]*?)\])/g)) {
      const start = Number.parseInt(normalizeHexCode(row[1]), 16);
      const end = Number.parseInt(normalizeHexCode(row[2]), 16);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 512) {
        continue;
      }
      if (row[3]) {
        const dstStart = Number.parseInt(normalizeHexCode(row[3]), 16);
        for (let code = start; code <= end; code += 1) {
          const srcHex = code.toString(16).toUpperCase().padStart(normalizeHexCode(row[1]).length, "0");
          const dstHex = (dstStart + code - start).toString(16).toUpperCase().padStart(normalizeHexCode(row[3]).length, "0");
          cmap.set(srcHex, parseUnicodeHex(dstHex));
        }
      } else {
        const values = [...String(row[4] || "").matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((match) => parseUnicodeHex(match[1]));
        values.forEach((value, offset) => {
          const srcHex = (start + offset).toString(16).toUpperCase().padStart(normalizeHexCode(row[1]).length, "0");
          cmap.set(srcHex, value);
        });
      }
    }
  }
  return cmap;
}

function extractPdfObjects(source) {
  return [...String(source || "").matchAll(/(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g)].map((match) => ({
    id: `${match[1]} ${match[2]}`,
    number: match[1],
    generation: match[2],
    body: match[3],
  }));
}

function buildCMapsByObject(objects) {
  const maps = new Map();
  for (const object of objects) {
    if (/beginbf(?:char|range)/.test(object.body)) {
      const cmap = parseToUnicodeCMap(object.body);
      if (cmap.size) maps.set(object.id, cmap);
    }
  }
  return maps;
}

function buildFontCMapLookup(objects, cmapsByObject) {
  const lookup = new Map();
  const objectIndex = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    const fontName = object.body.match(/\/BaseFont\s*\/([^\s/>]+)/)?.[1]
      || object.body.match(/\/Name\s*\/([^\s/>]+)/)?.[1]
      || object.body.match(/\/([A-Za-z][\w.-]*)\s+\d+\s+\d+\s+R/)?.[1];
    const toUnicode = object.body.match(/\/ToUnicode\s+(\d+)\s+(\d+)\s+R/);
    if (fontName && toUnicode) {
      const cmap = cmapsByObject.get(`${toUnicode[1]} ${toUnicode[2]}`);
      if (cmap) lookup.set(fontName, cmap);
    }
  }

  for (const object of objects) {
    const fontSection = object.body.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (!fontSection) continue;
    for (const ref of fontSection[1].matchAll(/\/([A-Za-z][\w.-]*)\s+(\d+)\s+(\d+)\s+R/g)) {
      const fontObject = objectIndex.get(`${ref[2]} ${ref[3]}`);
      const toUnicode = fontObject?.body.match(/\/ToUnicode\s+(\d+)\s+(\d+)\s+R/);
      const cmap = toUnicode ? cmapsByObject.get(`${toUnicode[1]} ${toUnicode[2]}`) : null;
      if (cmap) lookup.set(ref[1], cmap);
    }
  }
  return lookup;
}

function getActiveFontName(textObject) {
  const match = String(textObject || "").match(/\/([A-Za-z][\w.-]*)\s+[-+]?\d*\.?\d+\s+Tf/);
  return match?.[1] || "";
}

function chooseCMap(textObject, fontCMaps, fallbackCMap) {
  const activeFont = getActiveFontName(textObject);
  if (activeFont && fontCMaps.has(activeFont)) {
    return fontCMaps.get(activeFont);
  }
  return fontCMaps.size <= 1 ? fallbackCMap : null;
}

function decodePdfHexString(hex, cmap) {
  const clean = normalizeHexCode(hex);
  if (!clean) return "";
  if (!cmap?.size) return decodePdfHexFallback(clean);
  let output = "";
  for (let index = 0; index < clean.length;) {
    let matched = "";
    for (const width of [8, 6, 4, 2]) {
      const code = clean.slice(index, index + width);
      if (code.length === width && cmap.has(code)) {
        matched = cmap.get(code);
        index += width;
        break;
      }
    }
    if (!matched) {
      matched = decodePdfHexFallback(clean.slice(index, index + 2));
      index += 2;
    }
    output += matched;
  }
  return output;
}

function extractHexTextOperators(textObject, cmap) {
  const direct = [...String(textObject || "").matchAll(/<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|"|TJ)/g)]
    .map((match) => decodePdfHexString(match[1], cmap));
  const arrayItems = [...String(textObject || "").matchAll(/\[([\s\S]*?)\]\s*TJ/g)]
    .flatMap((match) => [...match[1].matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((item) => decodePdfHexString(item[1], cmap)));
  return [...direct, ...arrayItems].map((text) => text.trim()).filter(isCrediblePdfText);
}

function binaryStringToBytes(value) {
  const binary = String(value || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function appendTextFragment(buffer, fragment) {
  const text = String(fragment || "");
  if (!text) return buffer;
  if (!buffer) return text;
  const last = buffer.at(-1);
  const first = text[0];
  const needsSpace = /[A-Za-z0-9]/.test(last) && /[A-Za-z0-9]/.test(first);
  return `${buffer}${needsSpace ? " " : ""}${text}`;
}

async function loadPdfJs() {
  if (typeof window !== "undefined") {
    const pdfjs = await import("/vendor/pdfjs/pdf.min.mjs");
    // PDF.js 5.x 即使开启 worker，也必须先把 GlobalWorkerOptions.workerSrc 指到
    // 真实可加载的 worker 脚本，否则 getDocument 第一行就抛 "No GlobalWorkerOptions
    // .workerSrc specified" 或 "Setting up fake worker failed"，导致整个 PDF.js
    // 路径完全失效、回落到核心解析器输出字体 GID 乱码。
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    }
    return pdfjs;
  }
  return await import("pdfjs-dist/legacy/build/pdf.mjs");
}

function getPdfJsAssetOptions() {
  if (typeof window !== "undefined") {
    return {
      cMapUrl: "/vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
    };
  }
  return {
    cMapUrl: new URL("../../node_modules/pdfjs-dist/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href,
  };
}

async function extractTextWithPdfJs(content) {
  let loadingTask = null;
  let document = null;
  try {
    const pdfjs = await loadPdfJs();
    loadingTask = pdfjs.getDocument({
      data: coercePdfBytes(content),
      isEvalSupported: false,
      useSystemFonts: false,
      useWorkerFetch: false,
      verbosity: 0,
      ...getPdfJsAssetOptions(),
    });
    document = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport ? page.getViewport({ scale: 1 }) : null;
      const textContent = await page.getTextContent({
        disableNormalization: false,
        includeMarkedContent: false,
      });
      const items = (textContent.items || [])
        .filter((item) => typeof item.str === "string" && item.str.length > 0)
        .map((item) => ({
          str: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
          width: Number(item.width) || 0,
          height: item.height || Math.abs(item.transform?.[3] ?? 0) || 12,
          fontName: String(item.fontName || ""),
        }));
      const pageBlocks = analyzePageLayout(items);
      const fallbackText = pageBlocks.length === 0
        ? (textContent.items || []).map((item) => (typeof item.str === "string" ? item.str : "")).join(" ").replace(/\s+/g, " ").trim()
        : "";
      // P8-M4：同时收集 FixedLayoutModel 的 textRuns + page size，供 model.fixedLayout 使用。
      const textRuns = items.map((item) => ({
        text: item.str,
        bbox: { x: item.x, y: item.y, w: item.width, h: item.height },
        fontName: item.fontName,
        fontSize: item.height,
      }));
      const annotations = await collectPdfJsAnnotations(page);
      const layoutPage = {
        pageNumber,
        size: viewport ? { width: viewport.width, height: viewport.height, unit: "pt" } : { width: 0, height: 0, unit: "pt" },
        textRuns,
        annotations,
      };
      if (pageBlocks.length > 0) {
        pages.push({ pageNumber, blocks: pageBlocks, layout: layoutPage });
      } else if (fallbackText) {
        pages.push({ pageNumber, text: fallbackText, layout: layoutPage });
      }
      page.cleanup();
    }
    await document.destroy();
    return pages;
  } catch (error) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[trans2former] PDF.js extraction failed, falling back to core parser:", error?.message || error);
    }
    if (document) {
      try { await document.destroy(); } catch { /* ignore */ }
    }
    return [];
  }
}

async function collectPdfJsAnnotations(page) {
  if (!page.getAnnotations) return [];
  try {
    const raw = await page.getAnnotations();
    return (raw || [])
      .filter((annotation) => annotation && annotation.subtype)
      .map((annotation) => ({
        type: String(annotation.subtype || ""),
        bbox: Array.isArray(annotation.rect) ? {
          x: annotation.rect[0],
          y: annotation.rect[1],
          w: annotation.rect[2] - annotation.rect[0],
          h: annotation.rect[3] - annotation.rect[1],
        } : null,
        target: String(annotation.url || annotation.dest || ""),
        text: String(annotation.contents || annotation.title || ""),
      }));
  } catch {
    return [];
  }
}

// 把 PDF 文本 item 按 y 坐标聚成行，再按字号 / 间距 / 行首符号区分
// 标题 / 列表 / 段落。坐标系 y 越大越靠上（PDF 原点在左下）。
function analyzePageLayout(items) {
  if (!items || items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    const tolerance = (item.height || 12) * 0.5;
    if (last && Math.abs(last.y - item.y) < tolerance) {
      last.items.push(item);
      last.height = Math.max(last.height, item.height || 0);
      last.minX = Math.min(last.minX, item.x);
    } else {
      lines.push({
        y: item.y,
        height: item.height || 12,
        minX: item.x,
        items: [item],
      });
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.str).join("").replace(/\s+/g, " ").trim();
    line.inlines = itemsToInlines(line.items);
  }
  const validLines = lines.filter((line) => line.text);
  if (validLines.length === 0) return [];

  const bodyFontSize = computeBodyFontSize(validLines);
  const headingThreshold = bodyFontSize * 1.15;

  const blocks = [];
  let paragraphTextBuffer = [];
  let paragraphInlineBuffer = [];
  let paragraphMinX = null;
  let lastY = null;
  let lastHeight = bodyFontSize;

  function flushParagraph() {
    if (paragraphTextBuffer.length > 0) {
      const text = paragraphTextBuffer.join(" ").replace(/\s+/g, " ").trim();
      if (text) {
        const block = { type: "paragraph", text };
        const inlines = mergeInlineSegments(paragraphInlineBuffer);
        if (inlines.length > 0) block.inlines = inlines;
        blocks.push(block);
      }
      paragraphTextBuffer = [];
      paragraphInlineBuffer = [];
      paragraphMinX = null;
    }
  }

  for (const line of validLines) {
    const text = line.text;
    if (!text) continue;

    const yGap = lastY !== null ? Math.abs(lastY - line.y) : 0;
    const isNewBlock = lastY !== null && yGap > lastHeight * 1.6;
    const isHeading = line.height > headingThreshold && text.length <= 200;
    const listMatch = text.match(/^([•·▪◦•·▪◦*\-]|\d{1,3}[.)])\s+(.+)$/);

    if (isHeading) {
      flushParagraph();
      const level = computeHeadingLevel(line.height, bodyFontSize);
      const block = { type: "heading", level, text };
      if (line.inlines.length > 0) block.inlines = line.inlines;
      blocks.push(block);
    } else if (listMatch) {
      const itemText = listMatch[2].trim();
      const lastBlock = blocks[blocks.length - 1];
      const ordered = /^\d{1,3}[.)]/.test(listMatch[1]);
      // list 项的行内格式：去掉行首符号，沿用剩余 inline 序列
      const itemInlines = stripListPrefixInlines(line.inlines, listMatch[1]);
      if (!isNewBlock && lastBlock && lastBlock.type === "list" && lastBlock.ordered === ordered) {
        lastBlock.items.push(itemText);
        if (lastBlock.itemInlines) lastBlock.itemInlines.push(itemInlines);
      } else {
        flushParagraph();
        const list = { type: "list", ordered, items: [itemText] };
        if (itemInlines.length > 0) list.itemInlines = [itemInlines];
        blocks.push(list);
      }
    } else {
      if (isNewBlock) flushParagraph();
      paragraphTextBuffer.push(text);
      paragraphInlineBuffer.push(line.inlines);
      if (paragraphMinX === null) paragraphMinX = line.minX;
    }
    lastY = line.y;
    lastHeight = line.height;
  }
  flushParagraph();
  return blocks;
}

// 把 PDF.js textContent.items 转成 inline 节点序列。fontName 决定 bold / italic：
// 常见 PDF 字体名约定如 "Times-Bold" / "Helvetica-Oblique" / "Arial,BoldItalic"。
function itemsToInlines(items) {
  const segments = [];
  for (const item of items) {
    const text = String(item.str || "");
    if (!text) continue;
    const fontName = String(item.fontName || "");
    const bold = /bold|bd\b|black|heavy/i.test(fontName);
    const italic = /italic|oblique/i.test(fontName);
    const key = `${bold ? "b" : ""}${italic ? "i" : ""}`;
    const last = segments[segments.length - 1];
    if (last && last.key === key) {
      last.text += text;
    } else {
      segments.push({ key, text });
    }
  }
  return segments.map(({ key, text }) => {
    if (key === "bi") {
      return { type: "strong", inlines: [{ type: "em", inlines: [{ type: "text", value: text }] }] };
    }
    if (key === "b") return { type: "strong", inlines: [{ type: "text", value: text }] };
    if (key === "i") return { type: "em", inlines: [{ type: "text", value: text }] };
    return { type: "text", value: text };
  });
}

// 合并多行 inline 片段，行间塞空格。同时合并相邻 text 节点。
function mergeInlineSegments(lineInlinesArray) {
  const merged = [];
  for (let i = 0; i < lineInlinesArray.length; i += 1) {
    if (i > 0) merged.push({ type: "text", value: " " });
    for (const node of lineInlinesArray[i] || []) merged.push(node);
  }
  // 合并相邻 text 节点
  const collapsed = [];
  for (const node of merged) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.type === "text" && node.type === "text") {
      last.value = `${last.value}${node.value}`;
    } else {
      collapsed.push(node);
    }
  }
  // 规范化空白
  for (const node of collapsed) {
    if (node.type === "text") node.value = node.value.replace(/\s+/g, " ");
  }
  // 去掉首尾纯空白
  while (collapsed.length > 0 && collapsed[0].type === "text" && !collapsed[0].value.trim()) {
    collapsed.shift();
  }
  while (collapsed.length > 0) {
    const tail = collapsed[collapsed.length - 1];
    if (tail.type === "text" && !tail.value.trim()) collapsed.pop();
    else break;
  }
  return collapsed;
}

function stripListPrefixInlines(inlines, prefix) {
  if (!Array.isArray(inlines) || inlines.length === 0) return [];
  const stripPattern = new RegExp(`^\\s*${prefix.replace(/[.*+?^${}()|[\\\]\\\\]/g, "\\$&")}\\s+`);
  const result = [];
  let stripped = false;
  for (const node of inlines) {
    if (!stripped && node.type === "text") {
      const replaced = node.value.replace(stripPattern, "");
      if (replaced !== node.value) {
        if (replaced) result.push({ ...node, value: replaced });
        stripped = true;
        continue;
      }
    }
    result.push(node);
  }
  return result;
}

function computeBodyFontSize(lines) {
  if (lines.length === 0) return 12;
  const counts = new Map();
  for (const line of lines) {
    const bucket = Math.round(line.height * 2) / 2;
    const weight = line.text.length || 1;
    counts.set(bucket, (counts.get(bucket) || 0) + weight);
  }
  let bestSize = 12;
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount) {
      bestSize = size;
      bestCount = count;
    }
  }
  return bestSize > 0 ? bestSize : 12;
}

function computeHeadingLevel(lineHeight, bodyFontSize) {
  const ratio = bodyFontSize > 0 ? lineHeight / bodyFontSize : 1;
  if (ratio >= 1.8) return 1;
  if (ratio >= 1.4) return 2;
  if (ratio >= 1.2) return 3;
  return 4;
}

function bytesToBinaryString(bytes) {
  let output = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }
  return output;
}

async function inflateWithCompressionStream(bytes, format, sizeLimit) {
  if (typeof DecompressionStream !== "function") {
    return "";
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > sizeLimit) {
        try { await reader.cancel(); } catch { /* ignore */ }
        return "";
      }
      chunks.push(value);
    }
    const inflated = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      inflated.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytesToBinaryString(inflated);
  } catch {
    return "";
  }
}

async function inflatePdfStream(bytes, sizeLimit = MAX_INFLATED_STREAM_BYTES) {
  return await inflateWithCompressionStream(bytes, "deflate", sizeLimit)
    || await inflateWithCompressionStream(bytes, "deflate-raw", sizeLimit);
}

function extractFlateStreamPayloads(source) {
  const streams = [];
  const pattern = /<<(?:[\s\S]*?)\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])(?:[\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of String(source || "").matchAll(pattern)) {
    streams.push(match[1]);
  }
  return streams;
}

function encodePdfJsPayload(payload) {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return `base64:${Buffer.from(json, "utf8").toString("base64")}`;
  }
  if (typeof btoa === "function") {
    try {
      return `base64:${btoa(unescape(encodeURIComponent(json)))}`;
    } catch {
      return json;
    }
  }
  return json;
}

export async function expandPdfContentForTextExtraction(content) {
  const source = coercePdfText(content);
  const sourceText = String(content ?? "");
  const pdfJsPages = await extractTextWithPdfJs(content);
  if (pdfJsPages.length > 0) {
    return `${sourceText}\n${PDFJS_PAYLOAD_START}\n${encodePdfJsPayload({ engine: "pdfjs", pages: pdfJsPages })}\n${PDFJS_PAYLOAD_END}\n`;
  }
  const inflatedStreams = [];
  let totalInflated = 0;
  const objectPattern = /(\d+)\s+(\d+)\s+obj([\s\S]*?<<(?:[\s\S]*?)\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])(?:[\s\S]*?)>>\s*stream\r?\n)([\s\S]*?)\r?\nendstream([\s\S]*?)endobj/g;
  for (const match of String(source || "").matchAll(objectPattern)) {
    if (totalInflated >= MAX_INFLATED_TOTAL_BYTES) break;
    const remaining = MAX_INFLATED_TOTAL_BYTES - totalInflated;
    const inflated = await inflatePdfStream(binaryStringToBytes(match[4]), Math.min(MAX_INFLATED_STREAM_BYTES, remaining));
    if (inflated && (/\bBT\b[\s\S]*?\bET\b/.test(inflated) || /beginbf(?:char|range)/.test(inflated))) {
      inflatedStreams.push(`${match[1]} ${match[2]} obj\n${match[3]}${inflated}\nendstream${match[5]}endobj`);
      totalInflated += inflated.length;
    }
  }
  if (inflatedStreams.length === 0) for (const payload of extractFlateStreamPayloads(source)) {
    if (totalInflated >= MAX_INFLATED_TOTAL_BYTES) break;
    const remaining = MAX_INFLATED_TOTAL_BYTES - totalInflated;
    const inflated = await inflatePdfStream(binaryStringToBytes(payload), Math.min(MAX_INFLATED_STREAM_BYTES, remaining));
    if (inflated && (/\bBT\b[\s\S]*?\bET\b/.test(inflated) || /beginbf(?:char|range)/.test(inflated))) {
      inflatedStreams.push(inflated);
      totalInflated += inflated.length;
    }
  }
  if (inflatedStreams.length === 0) {
    return sourceText;
  }
  return `${sourceText}\n% Trans2Former expanded FlateDecode text streams\n${inflatedStreams.join("\n")}`;
}

export function readPdf({ content, title = "pdf", fileName = "", format = "pdf" }) {
  const source = coercePdfText(content);
  const pdfJsPayload = extractPdfJsPayload(source);

  // PDF.js + 版面分析路径：page.blocks 已经是结构化的 heading/list/paragraph
  if (pdfJsPayload && pdfJsPayload.pages?.some((page) => Array.isArray(page.blocks) && page.blocks.length > 0)) {
    const layoutBlocks = [];
    let totalItems = 0;
    for (const page of pdfJsPayload.pages) {
      if (!Array.isArray(page.blocks)) continue;
      for (const block of page.blocks) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "heading" && typeof block.text === "string") {
          const text = block.text.trim();
          if (text) {
            const heading = createHeading(Number(block.level) || 2, text);
            if (Array.isArray(block.inlines) && block.inlines.length > 0) heading.inlines = block.inlines;
            layoutBlocks.push(heading);
            totalItems += 1;
          }
        } else if (block.type === "paragraph" && typeof block.text === "string") {
          const text = block.text.trim();
          if (text) {
            const paragraph = createParagraph(text);
            if (Array.isArray(block.inlines) && block.inlines.length > 0) paragraph.inlines = block.inlines;
            layoutBlocks.push(paragraph);
            totalItems += 1;
          }
        } else if (block.type === "list" && Array.isArray(block.items)) {
          const items = block.items.map((item) => String(item || "").trim()).filter(Boolean);
          if (items.length > 0) {
            const list = createList(items, Boolean(block.ordered));
            if (Array.isArray(block.itemInlines) && block.itemInlines.some((entry) => Array.isArray(entry) && entry.length > 0)) {
              list.itemInlines = block.itemInlines;
            }
            layoutBlocks.push(list);
            totalItems += items.length;
          }
        }
      }
    }
    if (layoutBlocks.length > 0) {
      const warnings = [createWarning(
        "lossy",
        "PDF_LAYOUT_HEURISTIC",
        "PDF text was reconstructed from PDF.js coordinates with heuristic layout analysis (font-size for headings, y-gap for paragraphs, line-prefix for lists). Visual fidelity is not preserved."
      )];
      const model = createDocumentModel({
        title,
        sourceFormat: format,
        blocks: layoutBlocks,
        metadata: withWarnings({
          pdf: {
            extraction: "pdfjs-layout",
            engine: pdfJsPayload.engine || "pdfjs-layout",
            blockCount: layoutBlocks.length,
            textItemCount: totalItems,
            pageCount: pdfJsPayload.pages.length,
            fileName,
          },
        }, warnings),
      });
      // P8-M4：在顶层挂 FixedLayoutModel，让需要保留视觉布局的 mapper / writer
      // 直接消费 textRuns + bbox + annotations，而不是从 SemanticDoc 反推。
      const layoutPages = pdfJsPayload.pages
        .filter((page) => page && page.layout)
        .map((page) => page.layout);
      if (layoutPages.length > 0) {
        model.fixedLayout = createFixedLayoutModel({ pages: layoutPages });
      }
      return model;
    }
  }

  const textObjects = extractTextObjects(source);
  const pdfObjects = extractPdfObjects(source);
  const cmapsByObject = buildCMapsByObject(pdfObjects);
  const fontCMaps = buildFontCMapLookup(pdfObjects, cmapsByObject);
  const fallbackCmap = cmapsByObject.size <= 1 ? parseToUnicodeCMap(source) : null;
  const rawStrings = pdfJsPayload
    ? pdfJsPayload.pages.flatMap((page) => String(page.text || "").split(/\n+/).map((line) => line.trim()).filter(isCrediblePdfText))
    : textObjects.flatMap((textObject) => [
    ...extractLiteralTextOperators(textObject),
    ...extractHexTextOperators(textObject, chooseCMap(textObject, fontCMaps, fallbackCmap)),
  ]);
  // 仅当走核心解析器（无 PDF.js payload）时启用 GID 乱码兜底；PDF.js 的输出已经过
  // ToUnicode 解码，短句不应被误伤。
  const fontGlyphIdNoise = !pdfJsPayload && looksLikeFontGlyphIdNoise(rawStrings);
  const strings = fontGlyphIdNoise ? [] : rawStrings;
  const blocks = [];
  if (strings.length > 0) {
    blocks.push(createHeading(1, strings[0]));
    strings.slice(1).forEach((text) => blocks.push(createParagraph(text)));
  } else {
    blocks.push(createParagraph(PDF_FALLBACK_TEXT));
    const pdfDataUrl = toPdfDataUrl(content, source);
    const embeddedBase64 = pdfDataUrl.slice("data:application/pdf;base64,".length);
    const approxBytes = Math.floor(embeddedBase64.length * 3 / 4);
    if (embeddedBase64.length > 0 && approxBytes <= MAX_EMBEDDED_PDF_BYTES) {
      blocks.push(createRawBlock("html", `<object class="t2f-embedded-pdf" data="${escapeHtmlAttribute(pdfDataUrl)}" type="application/pdf" width="100%" height="760"><p>当前浏览器未能内嵌显示 PDF。请使用下载输出查看原 PDF。</p></object>`));
    }
  }
  const warnings = [createWarning(
    "lossy",
    "PDF_TEXT_EXTRACTION_MVP",
    "PDF MVP extracts simple literal text operators only; layout, fonts, images, and scanned pages are not preserved."
  )];
  if (strings.length === 0) {
    warnings.push(createWarning(
      "unsupported",
      fontGlyphIdNoise ? "PDF_FONT_GLYPH_ID_NOISE" : "PDF_NO_CREDIBLE_TEXT",
      fontGlyphIdNoise
        ? "PDF text operators decode to font Glyph IDs without ToUnicode mapping; readable text was not produced. Use a copyable-text PDF or a later core OCR/PDF enhancement."
        : "No credible PDF text operators were extracted; binary/compressed data was not exposed as document text."
    ));
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({
      pdf: {
        extraction: pdfJsPayload
          ? "pdfjs-text-content"
          : strings.length > 0
            ? "literal-text-operators"
            : fontGlyphIdNoise
              ? "embedded-original-pdf-glyph-noise"
              : "embedded-original-pdf",
        engine: pdfJsPayload?.engine || "core-mvp",
        textItemCount: strings.length,
        pageCount: pdfJsPayload?.pages?.length || undefined,
        fileName,
      },
    }, warnings),
  });
}
