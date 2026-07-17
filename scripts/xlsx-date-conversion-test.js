#!/usr/bin/env node

/**
 * XLSX Date Conversion Test
 * 测试 Excel 日期转换是否正确处理 1900 闰年 bug
 * 
 * 修复 Issue #182: XLSX 日期转换错误
 */

import { readFileSync } from "fs";

// 读取 xlsx.js 并提取 excelSerialDateToIso 函数
const xlsxSource = readFileSync("public/formats/xlsx.js", "utf-8");

// 手动提取并执行函数（简化测试）
const funcMatch = xlsxSource.match(/function excelSerialDateToIso\([^)]*\)\s*{[\s\S]*?^}/m);
if (!funcMatch) throw new Error("无法找到 excelSerialDateToIso 函数");

// 使用 eval 创建函数（仅用于测试）
const excelSerialDateToIso = eval(`(${funcMatch[0]})`);

console.log("XLSX Date Conversion Test (Excel 1900 Leap Year Bug)\n");

let passed = 0;
let failed = 0;

// 测试用例
const testCases = [
  { serial: 1, expected: "1900-01-01", description: "序列号 1 = 1900-01-01" },
  { serial: 59, expected: "1900-02-28", description: "序列号 59 = 1900-02-28 (1900-02-29 前一天)" },
  { serial: 60, expected: "1900-03-01", description: "序列号 60 = 1900-03-01 (跳过 Excel bug 日期 1900-02-29)" },
  { serial: 62, expected: "1900-03-02", description: "序列号 62 = 1900-03-02 (修正后序列)" },
  { serial: 100, expected: "1900-04-09", description: "序列号 100 = 1900-04-09" },
  { serial: 366, expected: "1900-12-31", description: "序列号 366 = 1900-12-31" },
  { serial: 367, expected: "1901-01-01", description: "序列号 367 = 1901-01-01" },
  { serial: 44197, expected: "2021-01-01", description: "序列号 44197 = 2021-01-01 (现代日期)" },
  { serial: 0, expected: "1899-12-31", description: "序列号 0 = 1899-12-31 (epoch 前一天)" },
];

// 运行测试
for (const testCase of testCases) {
  const result = excelSerialDateToIso(testCase.serial);
  if (result === testCase.expected) {
    console.log(`✅ Test PASSED: ${testCase.description}`);
    console.log(`   序列号 ${testCase.serial} → ${result}`);
    passed++;
  } else {
    console.error(`❌ Test FAILED: ${testCase.description}`);
    console.error(`   序列号 ${testCase.serial}`);
    console.error(`   期望: ${testCase.expected}`);
    console.error(`   实际: ${result}`);
    failed++;
  }
}

// 边界测试
console.log("\n边界测试:");

// 测试非有限数值
const nanResult = excelSerialDateToIso(NaN);
if (nanResult === "NaN") {
  console.log("✅ NaN 输入返回 'NaN'");
  passed++;
} else {
  console.error(`❌ NaN 输入应返回 'NaN'，实际: ${nanResult}`);
  failed++;
}

// 测试 Infinity
const infResult = excelSerialDateToIso(Infinity);
if (infResult === "Infinity") {
  console.log("✅ Infinity 输入返回 'Infinity'");
  passed++;
} else {
  console.error(`❌ Infinity 输入应返回 'Infinity'，实际: ${infResult}`);
  failed++;
}

// 测试 null/undefined
const nullResult = excelSerialDateToIso(0);
if (nullResult === "1899-12-31") {
  console.log("✅ 0 输入返回 epoch 日期");
  passed++;
} else {
  console.error(`❌ 0 输入应返回 epoch，实际: ${nullResult}`);
  failed++;
}

// 总结
console.log("\n" + "=".repeat(50));
console.log(`Total: ${passed + failed} tests`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log("=".repeat(50));

if (failed === 0) {
  console.log("\n🎉 All tests passed! Excel date conversion correctly handles 1900 leap year bug.");
  process.exit(0);
} else {
  console.error(`\n❌ ${failed} test(s) failed. Excel date conversion needs attention.`);
  process.exit(1);
}
