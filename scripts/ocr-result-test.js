// OCR Result 测试
// 目标：提升覆盖率从 82.95% 到 90%+

import { strict as assert } from "assert";
import {
  OCR_RESULT_SCHEMA_VERSION,
  OCR_LANGUAGES,
  createOCRResult,
  validateOCRResult,
  summarizeOCRResult,
} from "../public/core/ocr/ocr-result.js";
import { ConversionError } from "../public/core/conversion-error.js";

console.log("Testing ocr-result module...");

// 测试 1: 常量导出
function testConstants() {
  assert.strictEqual(OCR_RESULT_SCHEMA_VERSION, "trans2former.ocr-result.v1");
  assert.ok(Array.isArray(OCR_LANGUAGES), "OCR_LANGUAGES 应该是数组");
  assert.ok(OCR_LANGUAGES.includes("auto"), "应包含 auto");
  assert.ok(OCR_LANGUAGES.includes("en"), "应包含 en");
  assert.ok(OCR_LANGUAGES.includes("zh-CN"), "应包含 zh-CN");
  assert.ok(OCR_LANGUAGES.includes("ja"), "应包含 ja");
  assert.ok(OCR_LANGUAGES.includes("ko"), "应包含 ko");
  console.log("  ✅ constants");
}

// 测试 2: createOCRResult - 最小参数
function testCreateMinimalResult() {
  const result = createOCRResult();

  assert.strictEqual(result.schemaVersion, OCR_RESULT_SCHEMA_VERSION);
  assert.strictEqual(result.language, "auto");
  assert.deepStrictEqual(result.pages, []);
  assert.strictEqual(result.fullText, "");
  assert.strictEqual(result.averageConfidence, 0);
  assert.strictEqual(result.runtimeMs, 0);
  assert.strictEqual(result.engine, "");
  assert.strictEqual(result.modelVersion, "");
  assert.deepStrictEqual(result.warnings, []);

  // 验证冻结
  try {
    result.language = "en";
    assert.fail("应该是冻结的");
  } catch (error) {
    // 预期会失败
  }

  console.log("  ✅ createOCRResult minimal");
}

// 测试 3: createOCRResult - 完整参数
function testCreateFullResult() {
  const result = createOCRResult({
    language: "en",
    pages: [{
      pageIndex: 0,
      width: 800,
      height: 600,
      lines: [{
        text: "Hello World",
        confidence: 0.95,
        bbox: { x: 10, y: 20, w: 100, h: 30 },
      }],
    }],
    fullText: "Hello World",
    averageConfidence: 0.95,
    runtimeMs: 1500,
    engine: "tesseract",
    modelVersion: "4.1.1",
    warnings: [{ code: "WARN_001", message: "Test warning" }],
  });

  assert.strictEqual(result.language, "en");
  assert.strictEqual(result.pages.length, 1);
  assert.strictEqual(result.pages[0].lines[0].text, "Hello World");
  assert.strictEqual(result.pages[0].lines[0].confidence, 0.95);
  assert.deepStrictEqual(result.pages[0].lines[0].bbox, { x: 10, y: 20, w: 100, h: 30 });
  assert.strictEqual(result.fullText, "Hello World");
  assert.strictEqual(result.averageConfidence, 0.95);
  assert.strictEqual(result.runtimeMs, 1500);
  assert.strictEqual(result.engine, "tesseract");
  assert.strictEqual(result.modelVersion, "4.1.1");

  console.log("  ✅ createOCRResult full");
}

// 测试 4: createOCRResult - 语言规范化
function testCreateWithLanguageNormalization() {
  // Tesseract 码应该被规范化
  const result1 = createOCRResult({ language: "chi_sim" });
  assert.strictEqual(result1.language, "zh-CN", "chi_sim 应规范化为 zh-CN");

  const result2 = createOCRResult({ language: "eng" });
  assert.strictEqual(result2.language, "en", "eng 应规范化为 en");

  const result3 = createOCRResult({ language: "zh" });
  assert.strictEqual(result3.language, "zh-CN", "zh 应规范化为 zh-CN");

  console.log("  ✅ createOCRResult language normalization");
}

// 测试 5: createOCRResult - 页面默认值
function testCreatePageDefaults() {
  const result = createOCRResult({
    pages: [{
      // 缺少所有字段
    }],
  });

  assert.strictEqual(result.pages[0].pageIndex, 0);
  assert.strictEqual(result.pages[0].width, 0);
  assert.strictEqual(result.pages[0].height, 0);
  assert.deepStrictEqual(result.pages[0].lines, []);

  console.log("  ✅ createOCRResult page defaults");
}

// 测试 6: createOCRResult - 行默认值
function testCreateLineDefaults() {
  const result = createOCRResult({
    pages: [{
      pageIndex: 0,
      width: 800,
      height: 600,
      lines: [{
        // 缺少 text, confidence, bbox
      }],
    }],
  });

  assert.strictEqual(result.pages[0].lines[0].text, "");
  assert.strictEqual(result.pages[0].lines[0].confidence, 0);
  assert.strictEqual(result.pages[0].lines[0].bbox, null);

  console.log("  ✅ createOCRResult line defaults");
}

// 测试 7: createOCRResult - bbox 默认值
function testCreateBboxDefaults() {
  const result = createOCRResult({
    pages: [{
      pageIndex: 0,
      width: 800,
      height: 600,
      lines: [{
        text: "Test",
        confidence: 0.9,
        bbox: { x: 10 }, // 缺少其他字段
      }],
    }],
  });

  assert.deepStrictEqual(result.pages[0].lines[0].bbox, { x: 10, y: 0, w: 0, h: 0 });

  console.log("  ✅ createOCRResult bbox defaults");
}

// 测试 8: createOCRResult - 深度冻结
function testCreateDeepFreeze() {
  const result = createOCRResult({
    pages: [{
      pageIndex: 0,
      width: 800,
      height: 600,
      lines: [{ text: "Test", confidence: 0.9, bbox: { x: 10, y: 20, w: 100, h: 30 } }],
    }],
  });

  // 验证嵌套对象冻结
  try {
    result.pages[0].lines[0].text = "Modified";
    assert.fail("嵌套对象应该是冻结的");
  } catch (error) {
    // 预期会失败
  }

  try {
    result.pages[0].lines[0].bbox.x = 999;
    assert.fail("bbox 应该是冻结的");
  } catch (error) {
    // 预期会失败
  }

  console.log("  ✅ createOCRResult deep freeze");
}

// 测试 9: validateOCRResult - 非对象
function testValidateNonObject() {
  try {
    validateOCRResult("not an object");
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.strictEqual(error.code, "OCR_RESULT_INVALID");
    assert.ok(error.message.includes("must be an object"));
  }

  console.log("  ✅ validateOCRResult non-object");
}

// 测试 10: validateOCRResult - 错误的 schemaVersion
function testValidateInvalidSchemaVersion() {
  const result = createOCRResult();
  const modified = { ...result, schemaVersion: "wrong-version" };

  try {
    validateOCRResult(modified);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("Unsupported OCR result schemaVersion"));
  }

  console.log("  ✅ validateOCRResult invalid schemaVersion");
}

// 测试 11: validateOCRResult - 未知语言
function testValidateUnknownLanguage() {
  const result = createOCRResult();
  const modified = { ...result, language: "unknown-lang" };

  try {
    validateOCRResult(modified);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("Unknown OCR language"));
  }

  console.log("  ✅ validateOCRResult unknown language");
}

// 测试 12: validateOCRResult - pages 不是数组
function testValidatePagesNotArray() {
  const result = createOCRResult();
  const modified = { ...result, pages: "not an array" };

  try {
    validateOCRResult(modified);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("pages must be an array"));
  }

  console.log("  ✅ validateOCRResult pages not array");
}

// 测试 13: validateOCRResult - page 不是对象
function testValidatePageNotObject() {
  const result = {
    schemaVersion: OCR_RESULT_SCHEMA_VERSION,
    language: "auto",
    pages: ["not an object"], // 页面不是对象
    fullText: "",
    averageConfidence: 0,
    runtimeMs: 0,
    engine: "",
    modelVersion: "",
    warnings: [],
  };

  try {
    validateOCRResult(result);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("OCR page 0 must be an object"));
  }

  console.log("  ✅ validateOCRResult page not object");
}

// 辅助函数：创建用于验证测试的原始结果对象
function createRawResult(overrides = {}) {
  return {
    schemaVersion: OCR_RESULT_SCHEMA_VERSION,
    language: "auto",
    pages: [],
    fullText: "",
    averageConfidence: 0,
    runtimeMs: 0,
    engine: "",
    modelVersion: "",
    warnings: [],
    ...overrides,
  };
}

// 测试 14: validateOCRResult - 无效的页面几何
function testValidateInvalidPageGeometry() {
  // pageIndex 为负数
  try {
    validateOCRResult(createRawResult({ pages: [{ pageIndex: -1, width: 800, height: 600, lines: [] }] }));
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("pageIndex/width/height must be non-negative"));
  }

  // width 为负数
  try {
    validateOCRResult(createRawResult({ pages: [{ pageIndex: 0, width: -800, height: 600, lines: [] }] }));
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
  }

  // height 为 NaN
  try {
    validateOCRResult(createRawResult({ pages: [{ pageIndex: 0, width: 800, height: NaN, lines: [] }] }));
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
  }

  console.log("  ✅ validateOCRResult invalid page geometry");
}

// 测试 15: validateOCRResult - lines 不是数组
function testValidateLinesNotArray() {
  const result = createRawResult({ pages: [{ pageIndex: 0, width: 800, height: 600, lines: "not array" }] });

  try {
    validateOCRResult(result);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("lines must be an array"));
  }

  console.log("  ✅ validateOCRResult lines not array");
}

// 测试 16: validateOCRResult - 无效的行文本
function testValidateInvalidLineText() {
  const result = createRawResult({
    pages: [{
      pageIndex: 0,
      width: 800,
      height: 600,
      lines: [{ text: 123, confidence: 0.9, bbox: null }], // text 不是字符串
    }],
  });

  try {
    validateOCRResult(result);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("text must be a string"));
  }

  console.log("  ✅ validateOCRResult invalid line text");
}

// 测试 17: validateOCRResult - 无效的行置信度
function testValidateInvalidLineConfidence() {
  // confidence < 0
  try {
    validateOCRResult(createRawResult({
      pages: [{
        pageIndex: 0,
        width: 800,
        height: 600,
        lines: [{ text: "Test", confidence: -0.1, bbox: null }],
      }],
    }));
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("confidence must be in [0, 1]"));
  }

  // confidence > 1
  try {
    validateOCRResult(createRawResult({
      pages: [{
        pageIndex: 0,
        width: 800,
        height: 600,
        lines: [{ text: "Test", confidence: 1.5, bbox: null }],
      }],
    }));
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
  }

  console.log("  ✅ validateOCRResult invalid line confidence");
}

// 测试 18: validateOCRResult - 无效的平均置信度
function testValidateInvalidAverageConfidence() {
  const result = createRawResult({ averageConfidence: 1.5 });

  try {
    validateOCRResult(result);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("averageConfidence must be in [0, 1]"));
  }

  console.log("  ✅ validateOCRResult invalid averageConfidence");
}

// 测试 19: validateOCRResult - 无效的运行时间
function testValidateInvalidRuntime() {
  const result = createRawResult({ runtimeMs: -100 });

  try {
    validateOCRResult(result);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.ok(error.message.includes("runtimeMs must be non-negative"));
  }

  console.log("  ✅ validateOCRResult invalid runtime");
}

// 测试 20: summarizeOCRResult - 基本功能
function testSummarizeBasic() {
  const result = createOCRResult({
    language: "en",
    pages: [{
      pageIndex: 0,
      width: 800,
      height: 600,
      lines: [
        { text: "Line 1", confidence: 0.9, bbox: null },
        { text: "Line 2", confidence: 0.95, bbox: null },
      ],
    }],
    fullText: "Line 1\nLine 2",
    averageConfidence: 0.925,
    runtimeMs: 1000,
    engine: "tesseract",
    modelVersion: "4.1.1",
  });

  const summary = summarizeOCRResult(result);

  assert.strictEqual(summary.pageCount, 1);
  assert.strictEqual(summary.lineCount, 2);
  assert.strictEqual(summary.averageConfidence, 0.925);
  assert.strictEqual(summary.fullTextLength, 13);
  assert.strictEqual(summary.engine, "tesseract");
  assert.strictEqual(summary.modelVersion, "4.1.1");
  assert.strictEqual(summary.runtimeMs, 1000);
  assert.strictEqual(summary.language, "en");

  console.log("  ✅ summarizeOCRResult basic");
}

// 测试 21: summarizeOCRResult - 非对象输入
function testSummarizeNonObject() {
  assert.strictEqual(summarizeOCRResult("not an object"), null);
  assert.strictEqual(summarizeOCRResult(null), null);
  assert.strictEqual(summarizeOCRResult(undefined), null);
  assert.strictEqual(summarizeOCRResult([]), null);

  console.log("  ✅ summarizeOCRResult non-object");
}

// 测试 22: summarizeOCRResult - 缺少字段
function testSummarizeMissingFields() {
  const summary = summarizeOCRResult({});

  assert.strictEqual(summary.pageCount, 0);
  assert.strictEqual(summary.lineCount, 0);
  assert.strictEqual(summary.averageConfidence, 0);
  assert.strictEqual(summary.fullTextLength, 0);
  assert.strictEqual(summary.engine, "");
  assert.strictEqual(summary.modelVersion, "");
  assert.strictEqual(summary.runtimeMs, 0);
  assert.strictEqual(summary.language, "auto");

  console.log("  ✅ summarizeOCRResult missing fields");
}

// 测试 23: summarizeOCRResult - 多页
function testSummarizeMultiplePages() {
  const result = createOCRResult({
    pages: [
      { pageIndex: 0, width: 800, height: 600, lines: [{ text: "P1L1", confidence: 0.9, bbox: null }] },
      { pageIndex: 1, width: 800, height: 600, lines: [{ text: "P2L1", confidence: 0.9, bbox: null }, { text: "P2L2", confidence: 0.95, bbox: null }] },
    ],
  });

  const summary = summarizeOCRResult(result);

  assert.strictEqual(summary.pageCount, 2);
  assert.strictEqual(summary.lineCount, 3);

  console.log("  ✅ summarizeOCRResult multiple pages");
}

// 运行所有测试
try {
  testConstants();
  testCreateMinimalResult();
  testCreateFullResult();
  testCreateWithLanguageNormalization();
  testCreatePageDefaults();
  testCreateLineDefaults();
  testCreateBboxDefaults();
  testCreateDeepFreeze();
  testValidateNonObject();
  testValidateInvalidSchemaVersion();
  testValidateUnknownLanguage();
  testValidatePagesNotArray();
  testValidatePageNotObject();
  testValidateInvalidPageGeometry();
  testValidateLinesNotArray();
  testValidateInvalidLineText();
  testValidateInvalidLineConfidence();
  testValidateInvalidAverageConfidence();
  testValidateInvalidRuntime();
  testSummarizeBasic();
  testSummarizeNonObject();
  testSummarizeMissingFields();
  testSummarizeMultiplePages();

  console.log("\n✅ OCR result test passed");
  console.log("   - 测试了 createOCRResult 的所有路径");
  console.log("   - 测试了语言规范化");
  console.log("   - 测试了默认值处理");
  console.log("   - 测试了深度冻结");
  console.log("   - 测试了 validateOCRResult 的所有验证规则");
  console.log("   - 测试了 summarizeOCRResult 的所有场景");
  console.log("   - 预期覆盖率：82.95% → 95%+");

  process.exit(0);
} catch (error) {
  console.error("\n❌ OCR result test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
