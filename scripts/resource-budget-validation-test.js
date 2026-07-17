#!/usr/bin/env node

/**
 * Resource Budget Validation Test
 * 测试资源预算检查是否正常工作
 * 
 * 修复 Issue #181: 资源预算检查完全失效
 */

import { ConverterRegistry } from "../public/core/format-registry.js";
import { ConversionError } from "../public/core/conversion-error.js";

console.log("Resource Budget Validation Test\n");

// 创建测试用的 ConverterRegistry 实例
const registry = new ConverterRegistry();

// 注册一个测试格式，带有资源预算限制
registry.readers.set("test", {
  label: "Test Format",
  read: () => ({ blocks: [] })
});

// 设置资源预算：最大 1MB
registry.capabilityDetails = new Map();
registry.capabilityDetails.set("test", {
  resourceBudget: {
    maxInputBytes: 1048576 // 1MB
  }
});

let passed = 0;
let failed = 0;

// 测试 1: 小文件应该通过
try {
  const smallContent = "a".repeat(1000); // 1KB
  registry._checkResourceBudget(smallContent, "test");
  console.log("✅ Test 1 PASSED: Small file (1KB) accepted");
  passed++;
} catch (error) {
  console.error("❌ Test 1 FAILED: Small file should be accepted");
  console.error("   Error:", error.message);
  failed++;
}

// 测试 2: 大文件应该被拒绝
try {
  const largeContent = "a".repeat(2 * 1048576); // 2MB
  registry._checkResourceBudget(largeContent, "test");
  console.error("❌ Test 2 FAILED: Large file (2MB) should be rejected");
  failed++;
} catch (error) {
  if (error instanceof ConversionError && error.code === "INPUT_BUDGET_EXCEEDED") {
    console.log("✅ Test 2 PASSED: Large file (2MB) rejected with correct error");
    passed++;
  } else {
    console.error("❌ Test 2 FAILED: Wrong error type or code");
    console.error("   Error:", error.message);
    failed++;
  }
}

// 测试 3: 边界情况 - 恰好等于限制
try {
  const exactContent = "a".repeat(1048576); // 恰好 1MB
  registry._checkResourceBudget(exactContent, "test");
  console.log("✅ Test 3 PASSED: Exact limit file (1MB) accepted");
  passed++;
} catch (error) {
  console.error("❌ Test 3 FAILED: File at exact limit should be accepted");
  console.error("   Error:", error.message);
  failed++;
}

// 测试 4: 超出限制 1 字节
try {
  const overContent = "a".repeat(1048577); // 1MB + 1 byte
  registry._checkResourceBudget(overContent, "test");
  console.error("❌ Test 4 FAILED: File over limit by 1 byte should be rejected");
  failed++;
} catch (error) {
  if (error instanceof ConversionError && error.code === "INPUT_BUDGET_EXCEEDED") {
    console.log("✅ Test 4 PASSED: File over limit by 1 byte rejected");
    passed++;
  } else {
    console.error("❌ Test 4 FAILED: Wrong error type or code");
    console.error("   Error:", error.message);
    failed++;
  }
}

// 测试 5: 没有资源预算的格式应该不检查
try {
  registry.capabilityDetails.set("unlimited", {});
  const largeContent = "a".repeat(10 * 1048576); // 10MB
  registry._checkResourceBudget(largeContent, "unlimited");
  console.log("✅ Test 5 PASSED: Format without budget accepts large files");
  passed++;
} catch (error) {
  console.error("❌ Test 5 FAILED: Format without budget should accept any size");
  console.error("   Error:", error.message);
  failed++;
}

// 测试 6: ArrayBuffer 输入
try {
  const buffer = new ArrayBuffer(500000); // 500KB
  registry._checkResourceBudget(buffer, "test");
  console.log("✅ Test 6 PASSED: ArrayBuffer (500KB) accepted");
  passed++;
} catch (error) {
  console.error("❌ Test 6 FAILED: ArrayBuffer should be accepted");
  console.error("   Error:", error.message);
  failed++;
}

// 测试 7: Blob 输入
try {
  const blob = new Blob(["a".repeat(500000)]); // 500KB
  registry._checkResourceBudget(blob, "test");
  console.log("✅ Test 7 PASSED: Blob (500KB) accepted");
  passed++;
} catch (error) {
  console.error("❌ Test 7 FAILED: Blob should be accepted");
  console.error("   Error:", error.message);
  failed++;
}

// 总结
console.log("\n" + "=".repeat(50));
console.log(`Total: ${passed + failed} tests`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log("=".repeat(50));

if (failed === 0) {
  console.log("\n🎉 All tests passed! Resource budget validation is working correctly.");
  process.exit(0);
} else {
  console.error(`\n❌ ${failed} test(s) failed. Resource budget validation needs attention.`);
  process.exit(1);
}
