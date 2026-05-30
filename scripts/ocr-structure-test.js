import assert from "node:assert/strict";

import { deriveOcrStructure, blocksFromOcrResult } from "../public/browser-transformer.js";

const line = (text, x, y, w, h) => ({ text, bbox: { x, y, w, h } });

// 1. Larger-font line becomes a heading; body lines group into a paragraph
{
  const lines = [
    line("产品标题", 10, 10, 200, 40),   // tall => heading
    line("第一行正文", 10, 60, 200, 18),
    line("第二行正文", 10, 82, 200, 18),
  ];
  const blocks = deriveOcrStructure(lines);
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].text, "产品标题");
  assert.ok(blocks[0].level >= 1 && blocks[0].level <= 6);
  // the two close body lines merge into one paragraph
  const paras = blocks.filter((b) => b.type === "paragraph");
  assert.equal(paras.length, 1);
  assert.ok(paras[0].text.includes("第一行正文") && paras[0].text.includes("第二行正文"));
}

// 2. A large vertical gap splits paragraphs
{
  const lines = [
    line("段落一行一", 10, 10, 200, 18),
    line("段落一行二", 10, 30, 200, 18),
    line("段落二行一", 10, 200, 200, 18), // big gap => new paragraph
  ];
  const blocks = deriveOcrStructure(lines);
  assert.equal(blocks.filter((b) => b.type === "paragraph").length, 2, "large gap should split into two paragraphs");
}

// 3. CJK lines join without spaces; latin lines join with a space
{
  const cjk = deriveOcrStructure([line("你好", 0, 0, 50, 18), line("世界", 0, 20, 50, 18)]);
  assert.equal(cjk[0].text, "你好世界", "adjacent CJK lines should join without a space");
  const latin = deriveOcrStructure([line("hello", 0, 0, 50, 18), line("world", 0, 20, 50, 18)]);
  assert.equal(latin[0].text, "hello world", "latin lines should join with a space");
}

// 4. Reading order: out-of-order (but close) lines are sorted top->bottom before joining
{
  const blocks = deriveOcrStructure([
    line("下面", 0, 28, 50, 18),
    line("上面", 0, 6, 50, 18),
  ]);
  assert.equal(blocks[0].text, "上面下面");
}

// 5. No-geometry fallback: lines without bbox collapse to a single paragraph (legacy behavior)
{
  const blocks = deriveOcrStructure([{ text: "a" }, { text: "b" }]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[0].text, "a\nb");
}

// 6. blocksFromOcrResult walks pages; empty falls back to fullText
{
  const result = { pages: [{ lines: [line("标题大字", 0, 0, 100, 40), line("正文", 0, 50, 100, 16)] }] };
  const blocks = blocksFromOcrResult(result);
  assert.ok(blocks.some((b) => b.type === "heading"));
  assert.equal(blocksFromOcrResult({ pages: [], fullText: "only text" })[0].text, "only text");
  assert.equal(blocksFromOcrResult({ pages: [] }).length, 0);
}

// 7. Empty / whitespace lines are ignored
{
  assert.equal(deriveOcrStructure([{ text: "   ", bbox: { x: 0, y: 0, w: 1, h: 1 } }]).length, 0);
}

console.log("OCR structure test passed: heading detection by font size, paragraph grouping by vertical gap, CJK/latin line joining, reading-order sort, no-geometry fallback, and blocksFromOcrResult page walk verified.");
