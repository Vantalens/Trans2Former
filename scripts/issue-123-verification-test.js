#!/usr/bin/env node

/**
 * Issue #123 验证测试
 * 验证 blockSearchText 与 markdown 源语法不匹配导致的问题：
 * 1. table 块 sourceSpan 恒为 null
 * 2. list 块 endOffset 计算不准确
 */

import assert from "node:assert";
import { ensureDocumentAudit } from "../public/core/document-audit.js";
import { createDocumentModel } from "../public/core/document-model.js";
import { readMarkdown } from "../public/formats/markdown.js";

console.log("Issue #123: blockSearchText 与 markdown 源语法不匹配问题验证\n");

// 测试 1: 表格块 sourceSpan 是否为 null
console.log("测试 1: 表格块 sourceSpan");
const tableMarkdown = `# Title

Some text before.

| h1 | h2 | h3 |
|----|----|----|
| a  | b  | c  |
| d  | e  | f  |

Some text after.`;

const tableModel = readMarkdown({ content: tableMarkdown, title: "table.md", format: "md" });
const auditedTableModel = ensureDocumentAudit(tableModel, {
  content: tableMarkdown,
  reader: "md",
  fileName: "table.md",
});

const tableBlock = auditedTableModel.blocks.find((b) => b.type === "table");
console.log("表格块 sourceSpan:", JSON.stringify(tableBlock?.sourceSpan, null, 2));

if (tableBlock?.sourceSpan?.startLine === null) {
  console.log("✓ 确认 Bug: 表格块 sourceSpan 全为 null\n");
} else {
  console.log("✗ 表格块 sourceSpan 有值（Bug 可能已修复或条件不满足）\n");
}

// 测试 2: 列表块 endOffset 计算
console.log("测试 2: 列表块 endOffset");
const listMarkdown = `# Title

- item one
- item two
- item three
- item four
- item five

Next paragraph.`;

const listModel = readMarkdown({ content: listMarkdown, title: "list.md", format: "md" });
const auditedListModel = ensureDocumentAudit(listModel, {
  content: listMarkdown,
  reader: "md",
  fileName: "list.md",
});

const listBlock = auditedListModel.blocks.find((b) => b.type === "list");
console.log("列表块 sourceSpan:", JSON.stringify(listBlock?.sourceSpan, null, 2));
console.log("列表项:", listBlock?.items);

// 计算实际列表块在源文本中的位置
const listSourceLines = listMarkdown.split("\n");
const listStartLine = listSourceLines.findIndex((line) => line.startsWith("- item one"));
const listEndLine = listSourceLines.findIndex((line) => line.startsWith("- item five"));
console.log(`实际列表在源文本中: 行 ${listStartLine + 1} 到 ${listEndLine + 1}`);

if (listBlock?.sourceSpan) {
  console.log(`推断的 sourceSpan: 行 ${listBlock.sourceSpan.startLine} 到 ${listBlock.sourceSpan.endLine}`);
  if (listBlock.sourceSpan.endLine !== listEndLine + 1) {
    console.log(`✓ 确认 Bug: endLine 不准确（期望 ${listEndLine + 1}，实际 ${listBlock.sourceSpan.endLine}）\n`);
  } else {
    console.log("✗ endLine 准确（Bug 可能已修复或计算方式已改变）\n");
  }
}

// 测试 3: 混合场景（表格 + 列表）
console.log("测试 3: 混合场景");
const mixedMarkdown = `# Document

First paragraph.

- list item 1
- list item 2

| col1 | col2 |
|------|------|
| a    | b    |

Final paragraph.`;

const mixedModel = readMarkdown({ content: mixedMarkdown, title: "mixed.md", format: "md" });
const auditedMixedModel = ensureDocumentAudit(mixedModel, {
  content: mixedMarkdown,
  reader: "md",
  fileName: "mixed.md",
});

console.log("混合文档块类型:", auditedMixedModel.blocks.map((b) => b.type));
const mixedList = auditedMixedModel.blocks.find((b) => b.type === "list");
const mixedTable = auditedMixedModel.blocks.find((b) => b.type === "table");
console.log("列表 sourceSpan:", JSON.stringify(mixedList?.sourceSpan, null, 2));
console.log("表格 sourceSpan:", JSON.stringify(mixedTable?.sourceSpan, null, 2));

// 测试 4: 验证现有测试是否会失败
console.log("\n测试 4: 验证现有测试断言");
const simpleMarkdown = "# Title\n\nHello **Trans2Former**.\n\n- One\n- Two";
const simpleModel = readMarkdown({ content: simpleMarkdown, title: "simple.md", format: "md" });
const auditedSimple = ensureDocumentAudit(simpleModel, {
  content: simpleMarkdown,
  reader: "md",
  fileName: "simple.md",
});

try {
  // 这是 smoke-test.js:936 的断言
  assert.equal(
    auditedSimple.blocks.every((block) => block.sourceSpan && Number.isInteger(block.sourceSpan.startLine)),
    true
  );
  console.log("✓ smoke-test 断言通过（所有块都有 sourceSpan 且 startLine 是整数）");
} catch (error) {
  console.log("✗ smoke-test 断言失败:", error.message);
}

// 测试 5: 表格场景下 smoke-test 断言是否会失败
console.log("\n测试 5: 表格场景下 smoke-test 断言");
try {
  assert.equal(
    auditedTableModel.blocks.every((block) => block.sourceSpan && Number.isInteger(block.sourceSpan.startLine)),
    true
  );
  console.log("✓ 表格场景下 smoke-test 断言通过");
} catch (error) {
  console.log("✗ 表格场景下 smoke-test 断言失败:", error.message);
  console.log("这说明现有测试没有覆盖表格场景，因此未发现此 Bug");
}

console.log("\n=== Issue #123 验证总结 ===");
console.log("P3 评级理由:");
console.log("1. Bug 真实存在（table sourceSpan 恒为 null，list endOffset 不准确）");
console.log("2. 实际影响有限：全仓库无代码消费 block.sourceSpan 用于展示或修复定位");
console.log("3. 现有测试未覆盖表格场景，因此未发现此问题");
console.log("4. sourceSpan 为 null 是合法降级（schema 允许）");
console.log("\n建议: 标记为 roadmap，在多域模型架构重构时一并解决");
