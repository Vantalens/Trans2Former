import { ConversionError } from "../core/conversion-error.js";
import { createDocumentModel, createParagraph } from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";

// RTF 读取（只读）：尽力提取纯文本与段落结构。
// 覆盖：\par / \line 段落、\tab、\'xx 十六进制转义、\uN Unicode、控制符号、
// 字体表/颜色表/样式表/图片等目标组整体跳过。样式（\b \i 等）只影响显示，
// 不进入纯文本输出。RTF 写出不在核心包内（见 FORMAT_ROADMAP）。

const SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "nonshppict",
  "themedata", "colorschememapping", "latentstyles", "datastore", "generator",
  "filetbl", "listtable", "listoverridetable", "revtbl", "rsidtbl", "mmath",
  "xmlnstbl", "footnote", "annotation", "header", "footer", "headerl", "headerr",
  "headerf", "footerl", "footerr", "footerf", "fldinst", "xe", "tc",
]);

// 控制符号（反斜杠 + 非字母单字符）
const CONTROL_SYMBOLS = {
  "~": " ", // 不断行空格
  "-": "", // 可选连字符
  "_": "‑", // 不断行连字符
  "{": "{",
  "}": "}",
  "\\": "\\",
  "*": "", // \* 目标标记（另行处理）
  "'": "", // \'xx（另行处理）
  bullet: "•",
  endash: "–",
  emdash: "—",
  lquote: "‘",
  rquote: "’",
  ldblquote: "“",
  rdblquote: "”",
};

// Windows-1252 0x80–0x9F 映射（RTF 默认 ANSI 代码页的高位区）
const CP1252_HIGH = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž",
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

function decodeHexBytes(bytes, codepage, warnings) {
  if (bytes.length === 0) return "";
  if (codepage === 65001) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    } catch {
      warnings.push(createWarning(
        "lossy",
        "RTF_HEX_DECODE_FALLBACK",
        "RTF \\'xx 十六进制转义按 UTF-8 解码失败，已按 Latin-1 回退。",
      ));
    }
  }
  return bytes.map((byte) => {
    if (byte < 0x80) return String.fromCharCode(byte);
    return CP1252_HIGH[byte] || String.fromCharCode(byte);
  }).join("");
}

export function readRtf({ content, title = "document", format = "rtf" }) {
  const source = String(content ?? "").replace(/^\uFEFF/, "");
  if (!/^\s*\{\\rtf/.test(source)) {
    throw new ConversionError("RTF 解析失败：缺少 {\\rtf 头，不是合法的 RTF 文档", {
      category: "parse",
      code: "RTF_NOT_RTF",
      format,
    });
  }

  const warnings = [];
  let codepage = 1252;
  let ucSkip = 1;
  let pendingBytes = [];
  const textParts = [];
  let sawStyledText = false;

  const flushHex = () => {
    if (pendingBytes.length > 0) {
      textParts.push(decodeHexBytes(pendingBytes, codepage, warnings));
      pendingBytes = [];
    }
  };

  const stack = []; // 元素为 { skip: boolean }
  let i = 0;
  const n = source.length;

  const isSkipping = () => stack.some((frame) => frame.skip);

  while (i < n) {
    const ch = source[i];
    if (ch === "{") {
      stack.push({ skip: false });
      i += 1;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      i += 1;
      continue; // RTF 源里的裸换行只是排版，不是正文
    }
    if (ch !== "\\") {
      if (!isSkipping()) {
        flushHex();
        textParts.push(ch);
      }
      i += 1;
      continue;
    }

    // 反斜杠控制字 / 控制符号
    i += 1;
    if (i >= n) break;
    const next = source[i];
    if (!/[a-zA-Z]/.test(next)) {
      // 控制符号：\'xx、\{、\}、\\、\*、\~ 等
      if (next === "'") {
        const hex = source.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          if (!isSkipping()) pendingBytes.push(parseInt(hex, 16));
          i += 3;
          continue;
        }
      }
      if (next === "*") {
        // \* destination：整个组可跳过
        const frame = stack[stack.length - 1];
        if (frame) frame.skip = true;
        i += 1;
        continue;
      }
      if (!isSkipping()) {
        flushHex();
        const symbol = CONTROL_SYMBOLS[next];
        if (symbol !== undefined) textParts.push(symbol);
      }
      i += 1;
      continue;
    }

    // 控制字：\word 或 \wordN（N 为带符号数字），后跟一个可选空格分隔符
    let end = i;
    while (end < n && /[a-zA-Z]/.test(source[end])) end += 1;
    const word = source.slice(i, end);
    let numText = "";
    if (source[end] === "-" || /[0-9]/.test(source[end] || "")) {
      const numStart = end;
      end += 1;
      while (end < n && /[0-9]/.test(source[end])) end += 1;
      numText = source.slice(numStart, end);
    }
    const param = numText === "" ? null : parseInt(numText, 10);
    if (source[end] === " ") end += 1; // 分隔空格被吞掉
    i = end;

    if (isSkipping()) continue;

    if (SKIP_DESTINATIONS.has(word)) {
      const frame = stack[stack.length - 1];
      if (frame) frame.skip = true;
      continue;
    }
    switch (word) {
      case "par":
      case "line":
      case "row":
        flushHex();
        textParts.push("\n");
        break;
      case "tab":
        flushHex();
        textParts.push("\t");
        break;
      case "ansicpg":
        if (param !== null) codepage = param;
        break;
      case "uc":
        if (param !== null && param >= 0) ucSkip = param;
        break;
      case "u": {
        flushHex();
        if (param !== null) {
          const codePoint = param < 0 ? param + 65536 : param;
          if (codePoint >= 0 && codePoint <= 0x10ffff) {
            textParts.push(String.fromCodePoint(codePoint > 0xffff ? 0xfffd : codePoint));
          }
          // 跳过 \uN 的 uc 个回退字符（\'xx 算一个字符）
          let skipped = 0;
          while (skipped < ucSkip && i < n) {
            if (source[i] === "\\" && source[i + 1] === "'") {
              i += 4;
              skipped += 1;
            } else {
              i += 1;
              skipped += 1;
            }
          }
        }
        break;
      }
      case "b":
      case "i":
      case "ul":
      case "strike":
      case "fs":
      case "f":
      case "highlight":
        sawStyledText = true;
        break;
      case "pard":
      case "plain":
        break; // 样式复位，不影响文本
      default:
        break; // 其他控制字忽略
    }
  }
  flushHex();

  const rawText = textParts.join("");
  const paragraphs = rawText
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line !== "");
  const blocks = paragraphs.length > 0
    ? paragraphs.map((line) => createParagraph(line))
    : [createParagraph("(empty RTF document)")];

  warnings.push(createWarning(
    "info",
    "RTF_BEST_EFFORT_TEXT",
    "RTF 导入为尽力纯文本提取：段落结构保留，字体/颜色/样式表与图片等目标组已跳过。RTF 输出未实现（只读格式）。",
  ));
  if (sawStyledText) {
    warnings.push(createWarning(
      "lossy",
      "RTF_STYLES_DROPPED",
      "RTF 加粗/斜体/下划线等字符样式未保留。",
    ));
  }

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({ rtf: { codepage } }, warnings),
  });
}
