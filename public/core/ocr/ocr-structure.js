// OCR 版面结构推断（格式识别增强）：把识别到的文本行（带 bbox）按阅读顺序归并成
// 标题 + 段落，而不是平铺成一个大段。用相对字号（行高）判定标题，用行间垂直间距分段。
// 纯函数，可测；无 bbox 几何信息时优雅回退（每行一段 / 单段）。

import { createParagraph, createHeading } from "../document-model.js";

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/;

function isCjk(ch) {
  return typeof ch === "string" && CJK.test(ch);
}

// 同段相邻行拼接：两侧都是 CJK 则直连（无空格），否则空格分隔。
function joinLines(prevText, lineText) {
  if (!prevText) return lineText;
  const a = prevText[prevText.length - 1];
  const b = lineText[0];
  return isCjk(a) && isCjk(b) ? prevText + lineText : `${prevText} ${lineText}`;
}

function headingLevel(ratio) {
  if (ratio >= 2) return 1;
  if (ratio >= 1.6) return 2;
  return 3;
}

// lines: [{ text, bbox:{x,y,w,h} }]（confidence 可选）。返回 block 数组（heading/paragraph）。
export function deriveOcrStructure(lines, {
  headingRatio = 1.35,
  paraGapRatio = 0.7,
} = {}) {
  const usable = (lines || []).filter((l) => l && typeof l.text === "string" && l.text.trim().length > 0);
  if (usable.length === 0) return [];

  const withBox = usable.filter((l) => l.bbox && Number.isFinite(l.bbox.h) && l.bbox.h > 0);
  // 几何信息不足（如桩引擎无 bbox）：无法结构化，回退为单一段落（保持旧行为）。
  if (withBox.length < 2) {
    return [createParagraph(usable.map((l) => l.text.trim()).join("\n"))];
  }

  const sorted = [...withBox].sort((a, b) => (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x));
  const medianHeight = median(sorted.map((l) => l.bbox.h)) || 1;
  const gapThreshold = medianHeight * paraGapRatio;

  const blocks = [];
  let para = "";
  let prevBottom = null;

  const flushPara = () => {
    if (para.trim().length > 0) blocks.push(createParagraph(para.trim()));
    para = "";
  };

  for (const line of sorted) {
    const text = line.text.trim();
    const ratio = line.bbox.h / medianHeight;
    const top = line.bbox.y;

    if (ratio >= headingRatio) {
      // 标题：独立成块
      flushPara();
      blocks.push(createHeading(headingLevel(ratio), text));
      prevBottom = line.bbox.y + line.bbox.h;
      continue;
    }

    const bigGap = prevBottom !== null && (top - prevBottom) > gapThreshold;
    if (bigGap) flushPara();
    para = joinLines(para, text);
    prevBottom = line.bbox.y + line.bbox.h;
  }
  flushPara();

  return blocks;
}

// 从 OCRResult 各页推断结构块（按页顺序拼接）。
export function blocksFromOcrResult(result, options = {}) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const blocks = [];
  for (const page of pages) {
    blocks.push(...deriveOcrStructure(page?.lines || [], options));
  }
  if (blocks.length === 0 && typeof result?.fullText === "string" && result.fullText.trim().length > 0) {
    blocks.push(createParagraph(result.fullText.trim()));
  }
  return blocks;
}
