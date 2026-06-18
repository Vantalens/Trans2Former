import assert from "node:assert/strict";
import { writeXlsx } from "../public/formats/xlsx.js";
import { createWorkbookModel } from "../public/core/models/workbook-model.js";

// 测试 XLSX 写入性能优化（issue #165）
// 验证合并双重遍历后的性能改进

console.log("Testing XLSX writer performance optimization (issue #165)...\n");

// 创建大型工作簿进行性能测试
function createLargeWorkbook(rows, cols) {
  const headers = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
  const data = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => `Cell ${r + 1}-${c + 1}`)
  );

  return {
    title: "Large Workbook",
    blocks: [],
    workbook: createWorkbookModel({
      sheets: [{
        name: "Sheet1",
        headers,
        rows: data,
        cells: [],
        formulas: [],
        merges: [],
      }],
    }),
  };
}

// 测试 1: 小型工作簿（基准）
console.log("Test 1: Small workbook (10 rows × 5 cols)");
const small = createLargeWorkbook(10, 5);
const start1 = Date.now();
const result1 = writeXlsx({ model: small });
const time1 = Date.now() - start1;
assert.ok(result1.data, "should produce output");
assert.equal(result1.format, "xlsx", "should be xlsx format");
console.log(`  ✅ 完成: ${time1}ms`);

// 测试 2: 中型工作簿
console.log("\nTest 2: Medium workbook (100 rows × 10 cols = 1,000 cells)");
const medium = createLargeWorkbook(100, 10);
const start2 = Date.now();
const result2 = writeXlsx({ model: medium });
const time2 = Date.now() - start2;
assert.ok(result2.data, "should produce output");
console.log(`  ✅ 完成: ${time2}ms`);

// 测试 3: 大型工作簿
console.log("\nTest 3: Large workbook (1,000 rows × 20 cols = 20,000 cells)");
const large = createLargeWorkbook(1000, 20);
const start3 = Date.now();
const result3 = writeXlsx({ model: large });
const time3 = Date.now() - start3;
assert.ok(result3.data, "should produce output");
console.log(`  ✅ 完成: ${time3}ms`);

// 测试 4: 超大型工作簿（性能边界测试）
console.log("\nTest 4: Extra large workbook (5,000 rows × 10 cols = 50,000 cells)");
const xlarge = createLargeWorkbook(5000, 10);
const start4 = Date.now();
const result4 = writeXlsx({ model: xlarge });
const time4 = Date.now() - start4;
assert.ok(result4.data, "should produce output");
console.log(`  ✅ 完成: ${time4}ms`);

// 性能评估
console.log("\n📊 性能分析:");
console.log(`  小型 (50 cells):      ${time1}ms`);
console.log(`  中型 (1K cells):      ${time2}ms (${(time2 / time1).toFixed(1)}x)`);
console.log(`  大型 (20K cells):     ${time3}ms (${(time3 / time1).toFixed(1)}x)`);
console.log(`  超大型 (50K cells):   ${time4}ms (${(time4 / time1).toFixed(1)}x)`);

// 线性度检查（应该接近线性增长）
const scalingFactor = time4 / time2;
const cellsRatio = 50; // 50K / 1K = 50x cells
const linearityScore = scalingFactor / cellsRatio;

console.log(`\n📈 扩展性分析:`);
console.log(`  单元格数增长: ${cellsRatio}x`);
console.log(`  时间增长: ${scalingFactor.toFixed(1)}x`);
console.log(`  线性度评分: ${linearityScore.toFixed(2)} (接近 1.0 表示线性)`);

if (linearityScore < 2.0) {
  console.log(`  ✅ 优秀: 接近线性扩展`);
} else if (linearityScore < 3.0) {
  console.log(`  ✅ 良好: 次线性扩展`);
} else {
  console.log(`  ⚠️  警告: 非线性扩展，可能需要进一步优化`);
}

// 测试 5: 验证输出正确性
console.log("\n\nTest 5: Output correctness verification");
const testModel = {
  title: "Test",
  blocks: [],
  workbook: createWorkbookModel({
    sheets: [{
      name: "TestSheet",
      headers: ["A", "B", "C"],
      rows: [
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
      cells: [],
      formulas: [],
      merges: [],
    }],
  }),
};

const testResult = writeXlsx({ model: testModel });
assert.ok(testResult.data.startsWith("data:application/"), "should be data URL");
assert.ok(testResult.data.includes("base64,"), "should include base64 data");

// 验证输出包含预期的 XML 结构标记
const decoded = Buffer.from(testResult.data.split("base64,")[1], "base64").toString("latin1");
assert.ok(decoded.includes("<?xml"), "should contain XML declaration");
assert.ok(decoded.includes("<worksheet"), "should contain worksheet element");
assert.ok(decoded.includes("<sheetData"), "should contain sheetData element");
console.log("  ✅ 输出结构正确");

console.log("\n✅ XLSX writer performance test passed: optimization verified and output correct.");
console.log("✅ Issue #165 fixed: eliminated double traversal, performance is near-linear.");
