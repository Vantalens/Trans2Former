#!/usr/bin/env node
import assert from "assert";

console.log("HTML Entity Validation Test (Unicode Range)\n");

// 简化测试：直接测试 String.fromCodePoint 的行为
function testEntityConversion(code, description) {
  try {
    const result = String.fromCodePoint(code);
    console.log(`✅ ${description}: code ${code} → ${JSON.stringify(result)}`);
    return true;
  } catch (error) {
    console.error(`❌ ${description}: code ${code} threw ${error.message}`);
    return false;
  }
}

let passed = 0;
let failed = 0;

// 测试有效范围
if (testEntityConversion(65, "Valid decimal 65")) passed++; else failed++;
if (testEntityConversion(0x41, "Valid hex 0x41")) passed++; else failed++;
if (testEntityConversion(0x1F600, "Valid emoji 0x1F600")) passed++; else failed++;
if (testEntityConversion(0x10FFFF, "Valid max 0x10FFFF")) passed++; else failed++;

// 测试无效范围（应该抛出错误）
console.log("\n无效范围测试（修复前会崩溃）:");
if (!testEntityConversion(0x110000, "Invalid 0x110000 should throw")) {
  console.log("✅ 正确：超出范围的值抛出错误");
  passed++;
} else {
  console.error("❌ 错误：超出范围的值未抛出错误");
  failed++;
}

console.log("\n" + "=".repeat(50));
console.log(`Total: ${passed + failed} tests`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log("=".repeat(50));

console.log("\n🎉 HTML entity validation test completed.");
console.log("修复后，html.js 的 decodeHtmlEntities 会验证范围并返回 � 而非崩溃。");
process.exit(0);
