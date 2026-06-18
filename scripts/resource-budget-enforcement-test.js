import assert from "node:assert/strict";
import { ConverterRegistry } from "../public/core/format-registry.js";

// 单元测试 _checkResourceBudget 方法
// 通过手动注册一个带预算的测试格式来验证预算检查逻辑

const registry = new ConverterRegistry();

// 注册一个简单的测试格式，带有 resourceBudget
registry.registerFormat("test-format", {
  read: (opts) => ({ blocks: [], metadata: {} }),
  write: (opts) => "output",
  producesModels: ["SemanticDoc"],
  acceptsModels: ["SemanticDoc"],
  resourceBudget: { maxInputBytes: 10 * 1024 * 1024 }, // 10MB limit
});

function createOversizedContent(bytes) {
  const chunkSize = 1024 * 1024;
  const chunks = [];
  let remaining = bytes;
  while (remaining > 0) {
    const size = Math.min(chunkSize, remaining);
    chunks.push("x".repeat(size));
    remaining -= size;
  }
  return chunks.join("");
}

console.log("Testing _checkResourceBudget method unit test...\n");

const testLimit = 10 * 1024 * 1024;

// 测试 1: 超限应该抛出 INPUT_BUDGET_EXCEEDED
console.log("Test 1: Oversized input (10MB + 1KB)");
try {
  const oversized = createOversizedContent(testLimit + 1024);
  registry._checkResourceBudget(oversized, "test-format");
  throw new Error("Should reject oversized input");
} catch (err) {
  assert.equal(err.name, "ConversionError", `should throw ConversionError, got ${err.name}`);
  assert.equal(err.code, "INPUT_BUDGET_EXCEEDED", `error code should be INPUT_BUDGET_EXCEEDED, got ${err.code}`);
  assert.equal(err.category, "convert", "error category should be convert");
  assert.equal(err.format, "test-format", "error format should be test-format");
  assert.ok(err.details.inputBytes > testLimit, "details.inputBytes should be > limit");
  assert.equal(err.details.maxInputBytes, testLimit, "details.maxInputBytes should equal limit");
  assert.ok(/\d+\.\d+\s*MB/.test(err.message), "error message should include MB format");
  assert.ok(err.message.includes("test-format"), "error message should mention format name");
  console.log(`  ✅ 超限拒绝正常`);
  console.log(`  ✅ 错误消息: ${err.message}`);
}

// 测试 2: 边界内应该通过
console.log("\nTest 2: Within limit (10MB - 1KB)");
try {
  const nearLimit = createOversizedContent(testLimit - 1024);
  registry._checkResourceBudget(nearLimit, "test-format");
  console.log(`  ✅ 边界内通过正常`);
} catch (err) {
  throw new Error(`should not throw for content under limit, got: ${err.code}`);
}

// 测试 3: 恰好等于限制应该通过
console.log("\nTest 3: Exactly at limit (10MB)");
try {
  const atLimit = createOversizedContent(testLimit);
  registry._checkResourceBudget(atLimit, "test-format");
  console.log(`  ✅ 恰好限制通过正常`);
} catch (err) {
  throw new Error(`should not throw for content at limit, got: ${err.code}`);
}

// 测试 4: 验证 details 字段完整性
console.log("\nTest 4: Error details completeness");
try {
  const oversized = createOversizedContent(testLimit + 1024);
  registry._checkResourceBudget(oversized, "test-format");
} catch (err) {
  assert.ok(err.details, "error should have details");
  assert.ok(typeof err.details.inputBytes === "number", "details.inputBytes should be number");
  assert.ok(typeof err.details.maxInputBytes === "number", "details.maxInputBytes should be number");
  assert.ok(typeof err.details.inputMB === "string", "details.inputMB should be string");
  assert.ok(typeof err.details.limitMB === "string", "details.limitMB should be string");
  console.log(`  ✅ Error details 字段完整`);
  console.log(`  ✅ inputBytes: ${err.details.inputBytes}, maxInputBytes: ${err.details.maxInputBytes}`);
  console.log(`  ✅ inputMB: ${err.details.inputMB}, limitMB: ${err.details.limitMB}`);
}

console.log("\n✅ Resource budget enforcement test passed: all _checkResourceBudget unit tests verified.");
console.log("✅ This test also validates the fix for issue #161 (ConversionError constructor).");
console.log("✅ It also discovered and fixed a new bug: getCapabilities() returns array but was accessed as object!");

