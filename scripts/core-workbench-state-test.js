/**
 * 工作台状态管理单元测试
 * 目标: 提升 workbench-state.js 覆盖率 (当前 40.42%)
 */

import assert from "node:assert/strict";
import { createQueueItem, buildExportFileName, summarizeQualityReport } from "../public/core/workbench-state.js";

console.log("Testing workbench state management...\n");

// Test 1: createQueueItem - 正常文件
console.log("Test 1: createQueueItem with valid file");
const mockFile = { name: "test.pdf", size: 1024 };
const item1 = createQueueItem(mockFile, "pdf");
assert.equal(item1.name, "test.pdf");
assert.equal(item1.size, 1024);
assert.equal(item1.format, "pdf");
assert.equal(item1.status, "queued");
assert.equal(item1.selected, true);
assert.equal(item1.attempts, 0);
assert.equal(item1.error, "");
assert.ok(item1.id);
console.log("  ✅ 正常文件队列项创建成功\n");

// Test 2: createQueueItem - 无文件对象
console.log("Test 2: createQueueItem with null file");
const item2 = createQueueItem(null);
assert.equal(item2.name, "untitled");
assert.equal(item2.size, 0);
assert.equal(item2.format, "");
assert.equal(item2.status, "queued");
console.log("  ✅ null 文件处理正确\n");

// Test 3: createQueueItem - 无大小属性
console.log("Test 3: createQueueItem with missing size");
const item3 = createQueueItem({ name: "doc.txt" });
assert.equal(item3.name, "doc.txt");
assert.equal(item3.size, 0);
console.log("  ✅ 缺失 size 属性处理正确\n");

// Test 4: buildExportFileName - 默认参数
console.log("Test 4: buildExportFileName with defaults");
const name1 = buildExportFileName();
assert.ok(name1.endsWith(".txt"));
assert.ok(name1.includes("document"));
console.log(`  ✅ 默认文件名: ${name1}\n`);

// Test 5: buildExportFileName - 自定义名称和扩展名
console.log("Test 5: buildExportFileName with custom name and extension");
const name2 = buildExportFileName({ baseName: "myfile", extension: "pdf" });
assert.ok(name2.includes("myfile"));
assert.ok(name2.endsWith(".pdf"));
console.log(`  ✅ 自定义文件名: ${name2}\n`);

// Test 6: buildExportFileName - 模板模式
console.log("Test 6: buildExportFileName with pattern");
const name3 = buildExportFileName({ pattern: "{name}-{date}.{ext}", baseName: "report", extension: "xlsx" });
assert.ok(name3.includes("report"));
assert.ok(name3.includes("-"));
assert.ok(name3.endsWith(".xlsx"));
console.log(`  ✅ 模板文件名: ${name3}\n`);

// Test 7: buildExportFileName - 非法字符过滤
console.log("Test 7: buildExportFileName with illegal characters");
const name4 = buildExportFileName({ baseName: "file<>:|?*test", extension: "txt" });
assert.equal(name4.includes("<"), false);
assert.equal(name4.includes(">"), false);
assert.equal(name4.includes(":"), false);
assert.equal(name4.includes("|"), false);
console.log(`  ✅ 非法字符过滤: ${name4}\n`);

// Test 8: buildExportFileName - Windows 保留名称
console.log("Test 8: buildExportFileName with reserved Windows names");
const name5 = buildExportFileName({ baseName: "CON", extension: "txt" });
assert.ok(name5.startsWith("file"));
console.log(`  ✅ Windows 保留名称处理: ${name5}\n`);

// Test 9: buildExportFileName - 空名称
console.log("Test 9: buildExportFileName with empty name");
const name6 = buildExportFileName({ baseName: "", extension: "md" });
assert.ok(name6.includes("document"));
assert.ok(name6.endsWith(".md"));
console.log(`  ✅ 空名称回退: ${name6}\n`);

// Test 10: buildExportFileName - 移除最后一个扩展名
console.log("Test 10: buildExportFileName removes last extension");
const name7 = buildExportFileName({ baseName: "test.old.pdf", extension: "docx" });
assert.ok(name7.endsWith(".docx"));
assert.equal(name7.endsWith(".pdf"), false);
console.log(`  ✅ 最后扩展名移除: ${name7}\n`);

// Test 11: summarizeQualityReport - 完整报告
console.log("Test 11: summarizeQualityReport with full report");
const model1 = {
  metadata: {
    qualityReport: {
      warningCount: 5,
      structureFidelity: "high",
      assetFidelity: "medium",
      textFidelity: "high",
    },
  },
};
const summary1 = summarizeQualityReport(model1);
assert.equal(summary1.warningCount, 5);
assert.equal(summary1.structureFidelity, "high");
assert.equal(summary1.assetFidelity, "medium");
assert.equal(summary1.textFidelity, "high");
console.log("  ✅ 完整质量报告总结正确\n");

// Test 12: summarizeQualityReport - 空模型
console.log("Test 12: summarizeQualityReport with empty model");
const summary2 = summarizeQualityReport(null);
assert.equal(summary2.warningCount, 0);
assert.equal(summary2.structureFidelity, "unknown");
assert.equal(summary2.assetFidelity, "unknown");
assert.equal(summary2.textFidelity, "unknown");
console.log("  ✅ 空模型处理正确\n");

// Test 13: summarizeQualityReport - 仅有 warnings 数组
console.log("Test 13: summarizeQualityReport with warnings array only");
const model2 = {
  metadata: {
    warnings: ["warn1", "warn2", "warn3"],
  },
};
const summary3 = summarizeQualityReport(model2);
assert.equal(summary3.warningCount, 3);
console.log("  ✅ warnings 数组回退处理正确\n");

console.log("✅ Workbench state test passed: all utility functions verified.");
console.log("📊 覆盖范围: 队列项创建、文件名生成、质量报告总结、边界条件");
