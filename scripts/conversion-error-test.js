// Conversion Error 测试
// 目标：达到 100% 覆盖率

import { strict as assert } from "assert";
import { ConversionError, normalizeConversionError } from "../public/core/conversion-error.js";

console.log("Testing conversion-error module...");

// 测试 1: 基本构造
function testBasicConstruction() {
  const error = new ConversionError("Test error");

  assert.strictEqual(error.name, "ConversionError");
  assert.strictEqual(error.message, "Test error");
  assert.strictEqual(error.category, "convert");
  assert.strictEqual(error.code, "CONVERSION_ERROR");
  assert.strictEqual(error.format, "");
  assert.deepStrictEqual(error.details, {});
  assert.ok(error instanceof Error);
  assert.ok(error instanceof ConversionError);

  console.log("  ✅ basic construction");
}

// 测试 2: 完整参数
function testFullParameters() {
  const error = new ConversionError("Custom error", {
    category: "parse",
    code: "PARSE_ERROR",
    format: "markdown",
    details: { line: 10, column: 5 },
    cause: new Error("Original error"),
  });

  assert.strictEqual(error.message, "Custom error");
  assert.strictEqual(error.category, "parse");
  assert.strictEqual(error.code, "PARSE_ERROR");
  assert.strictEqual(error.format, "markdown");
  assert.deepStrictEqual(error.details, { line: 10, column: 5 });
  assert.ok(error.cause instanceof Error);
  assert.strictEqual(error.cause.message, "Original error");

  console.log("  ✅ full parameters");
}

// 测试 3: 分类规范化
function testCategoryNormalization() {
  const validCategories = ["parse", "validate", "convert", "render", "download"];

  for (const category of validCategories) {
    const error = new ConversionError("Test", { category });
    assert.strictEqual(error.category, category, `${category} 应保持不变`);
  }

  // 无效分类应规范化为 "convert"
  const error = new ConversionError("Test", { category: "invalid" });
  assert.strictEqual(error.category, "convert");

  console.log("  ✅ category normalization");
}

// 测试 4: 空消息
function testEmptyMessage() {
  const error1 = new ConversionError("");
  assert.strictEqual(error1.message, "转换失败");

  const error2 = new ConversionError(null);
  assert.strictEqual(error2.message, "转换失败");

  const error3 = new ConversionError(undefined);
  assert.strictEqual(error3.message, "转换失败");

  console.log("  ✅ empty message");
}

// 测试 5: 空代码
function testEmptyCode() {
  const error1 = new ConversionError("Test", { code: "" });
  assert.strictEqual(error1.code, "CONVERSION_ERROR");

  const error2 = new ConversionError("Test", { code: null });
  assert.strictEqual(error2.code, "CONVERSION_ERROR");

  console.log("  ✅ empty code");
}

// 测试 6: 空格式
function testEmptyFormat() {
  const error1 = new ConversionError("Test", { format: "" });
  assert.strictEqual(error1.format, "");

  const error2 = new ConversionError("Test", { format: null });
  assert.strictEqual(error2.format, "");

  console.log("  ✅ empty format");
}

// 测试 7: 无效 details
function testInvalidDetails() {
  const error1 = new ConversionError("Test", { details: null });
  assert.deepStrictEqual(error1.details, {});

  const error2 = new ConversionError("Test", { details: "not an object" });
  assert.deepStrictEqual(error2.details, {});

  console.log("  ✅ invalid details");
}

// 测试 8: toJSON 方法
function testToJSON() {
  const error = new ConversionError("Test error", {
    category: "validate",
    code: "VALIDATION_ERROR",
    format: "pdf",
    details: { field: "title" },
  });

  const json = error.toJSON();

  assert.deepStrictEqual(json, {
    name: "ConversionError",
    message: "Test error",
    category: "validate",
    code: "VALIDATION_ERROR",
    format: "pdf",
    details: { field: "title" },
  });

  // 验证 toJSON 不包含 cause
  assert.strictEqual(json.cause, undefined);

  console.log("  ✅ toJSON");
}

// 测试 9: normalizeConversionError - 已经是 ConversionError
function testNormalizeAlreadyConversionError() {
  const original = new ConversionError("Original", {
    category: "parse",
    code: "PARSE_ERROR",
  });

  const normalized = normalizeConversionError(original);

  assert.strictEqual(normalized, original, "应返回原对象");
  console.log("  ✅ normalizeConversionError - already ConversionError");
}

// 测试 10: normalizeConversionError - 普通 Error
function testNormalizeRegularError() {
  const error = new Error("Regular error");
  const normalized = normalizeConversionError(error);

  assert.ok(normalized instanceof ConversionError);
  assert.strictEqual(normalized.message, "Regular error");
  assert.strictEqual(normalized.category, "convert");
  assert.strictEqual(normalized.code, "CONVERSION_ERROR");
  assert.strictEqual(normalized.cause, error);

  console.log("  ✅ normalizeConversionError - regular Error");
}

// 测试 11: normalizeConversionError - 带属性的 Error
function testNormalizeErrorWithProperties() {
  const error = new Error("Custom error");
  error.category = "validate";
  error.code = "CUSTOM_CODE";
  error.format = "docx";
  error.details = { info: "test" };

  const normalized = normalizeConversionError(error);

  assert.strictEqual(normalized.message, "Custom error");
  assert.strictEqual(normalized.category, "validate");
  assert.strictEqual(normalized.code, "CUSTOM_CODE");
  assert.strictEqual(normalized.format, "docx");
  assert.deepStrictEqual(normalized.details, { info: "test" });

  console.log("  ✅ normalizeConversionError - Error with properties");
}

// 测试 12: normalizeConversionError - 非 Error 对象
function testNormalizeNonError() {
  const normalized1 = normalizeConversionError("String error");
  assert.ok(normalized1 instanceof ConversionError);
  assert.strictEqual(normalized1.message, "String error");
  assert.strictEqual(normalized1.cause, undefined);

  const normalized2 = normalizeConversionError(null);
  assert.strictEqual(normalized2.message, "转换失败");

  const normalized3 = normalizeConversionError(undefined);
  assert.strictEqual(normalized3.message, "转换失败");

  console.log("  ✅ normalizeConversionError - non-Error");
}

// 测试 13: normalizeConversionError - 带 fallback
function testNormalizeWithFallback() {
  const error = new Error("Test");
  const normalized = normalizeConversionError(error, {
    category: "render",
    code: "FALLBACK_CODE",
    format: "html",
    details: { fallback: true },
  });

  assert.strictEqual(normalized.category, "render");
  assert.strictEqual(normalized.code, "FALLBACK_CODE");
  assert.strictEqual(normalized.format, "html");
  assert.deepStrictEqual(normalized.details, { fallback: true });

  console.log("  ✅ normalizeConversionError - with fallback");
}

// 测试 14: normalizeConversionError - error 属性优先于 fallback
function testNormalizeErrorPrecedence() {
  const error = new Error("Test");
  error.category = "parse";
  error.code = "ERROR_CODE";

  const normalized = normalizeConversionError(error, {
    category: "convert",
    code: "FALLBACK_CODE",
    format: "fallback-format",
  });

  assert.strictEqual(normalized.category, "parse", "error 属性应优先");
  assert.strictEqual(normalized.code, "ERROR_CODE", "error 属性应优先");
  assert.strictEqual(normalized.format, "fallback-format", "error 无此属性，使用 fallback");

  console.log("  ✅ normalizeConversionError - error precedence");
}

// 测试 15: Error stack trace
function testStackTrace() {
  const error = new ConversionError("Test error");
  assert.ok(error.stack, "应有堆栈跟踪");
  assert.ok(error.stack.includes("ConversionError"), "堆栈应包含错误名");

  console.log("  ✅ stack trace");
}

// 运行所有测试
try {
  testBasicConstruction();
  testFullParameters();
  testCategoryNormalization();
  testEmptyMessage();
  testEmptyCode();
  testEmptyFormat();
  testInvalidDetails();
  testToJSON();
  testNormalizeAlreadyConversionError();
  testNormalizeRegularError();
  testNormalizeErrorWithProperties();
  testNormalizeNonError();
  testNormalizeWithFallback();
  testNormalizeErrorPrecedence();
  testStackTrace();

  console.log("\n✅ Conversion error test passed");
  console.log("   - 测试了 ConversionError 构造函数");
  console.log("   - 测试了所有参数和默认值");
  console.log("   - 测试了分类规范化");
  console.log("   - 测试了 toJSON 序列化");
  console.log("   - 测试了 normalizeConversionError 的所有路径");
  console.log("   - 测试了 fallback 优先级");
  console.log("   - 预期覆盖率：100%");

  process.exit(0);
} catch (error) {
  console.error("\n❌ Conversion error test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
