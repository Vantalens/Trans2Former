import assert from "node:assert/strict";

import {
  TEXT_BUILDERS,
  SIZE_TIERS,
  buildComplexMarkdown,
  buildComplexCsv,
  buildToTargetBytes,
} from "./lib/sample-content.js";
import { buildPatternPng } from "./lib/png-encode.js";
import { convertContent, getAllowedOutputFormats } from "../public/browser-transformer.js";

// 快速门禁：只在 small scale 验证生成器逻辑与跨格式可读性，不写 3MB 文件、不落盘。
// 真正的大样例语料由 `npm run samples:generate` 产出到 samples/generated/（gitignore）。

// 1. 文本 builder 在 small scale 产出非空且确定（同输入同输出）。
{
  for (const [key, builder] of Object.entries(TEXT_BUILDERS)) {
    const a = builder(1);
    const b = builder(1);
    assert.equal(typeof a, "string");
    assert.ok(a.length > 0, `${key} builder should produce non-empty content`);
    assert.equal(a, b, `${key} builder must be deterministic`);
  }
}

// 2. scale 增大 → 内容增大（医用于 size tier）。
{
  const small = buildComplexMarkdown(SIZE_TIERS.small);
  const medium = buildComplexMarkdown(SIZE_TIERS.medium);
  assert.ok(medium.length > small.length * 10, "medium markdown should be much larger than small");
}

// 3. 复杂 markdown 覆盖关键结构（表格/代码/任务/脚注/CJK/RTL）。
{
  const md = buildComplexMarkdown(1);
  assert.ok(md.includes("|"), "should contain table");
  assert.ok(md.includes("```"), "should contain code fence");
  assert.ok(md.includes("- [x]"), "should contain task list");
  assert.ok(md.includes("[^note1]"), "should contain footnote");
  assert.ok(/[一-鿿]/.test(md), "should contain CJK");
  assert.ok(/[؀-ۿ]/.test(md), "should contain Arabic/RTL");
}

// 4. CSV builder 含带引号/逗号/换行的字段（边界 CSV）。
{
  const csv = buildComplexCsv(1);
  assert.ok(csv.includes("\"\""), "CSV should contain escaped quotes");
  assert.ok(csv.split("\n").length > 1, "CSV should have multiple rows");
}

// 5. small-scale 文本源能转换到全部产品矩阵目标格式且非空（回归可读性）。
{
  const md = buildComplexMarkdown(1);
  const targets = getAllowedOutputFormats("md");
  assert.ok(targets.length > 0);
  for (const to of targets) {
    const result = convertContent({ content: md, from: "md", to, title: "corpus", options: { repair: false } });
    const data = result?.data ?? result;
    assert.ok(data && (typeof data === "string" ? data.length > 0 : data.length > 0), `md -> ${to} should be non-empty`);
  }
}

// 6. csv -> xlsx/json/md 走得通（结构化数据链）。
{
  const csv = buildComplexCsv(2);
  for (const to of ["xlsx", "json", "md", "html"]) {
    const result = convertContent({ content: csv, from: "csv", to, title: "corpus-csv", options: { repair: false } });
    const data = result?.data ?? result;
    assert.ok(data, `csv -> ${to} should produce output`);
  }
}

// 7. PNG encoder 产出有效 PNG 签名头 + 随尺寸增大。
{
  const small = buildPatternPng(16, 16);
  const big = buildPatternPng(64, 64);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    assert.equal(small[i], signature[i], "PNG signature byte mismatch");
  }
  assert.ok(big.length > small.length, "larger PNG should have more bytes");
}

// 8. buildToTargetBytes 能逼近目标字节（用于 large ≥ 3MB 层）。
{
  const target = 200 * 1024;
  const { content, scale } = buildToTargetBytes(buildComplexMarkdown, target);
  assert.ok(Buffer.byteLength(content, "utf8") >= target, "should reach target bytes");
  assert.ok(scale > 1, "scale should grow to reach target");
}

console.log("Sample corpus test passed: deterministic complex builders, size scaling, CJK/RTL/table/code coverage, cross-format readability, PNG encoder, target-byte scaling verified.");
