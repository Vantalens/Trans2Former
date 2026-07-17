// Tesseract SHA-256 校验测试
// 验证 Issue #129 的修复：tessdata 导入时进行 SHA-256 完整性校验

import { strict as assert } from "assert";
import {
  getTesseractVendorFileSpec,
  verifyTesseractVendorFile,
  TESSERACT_VENDOR_FILES,
} from "../public/core/ocr/tesseract-model-manifest.js";

console.log("Testing Tesseract SHA-256 verification...");

// 测试 1: getTesseractVendorFileSpec 返回正确的规格
function testGetSpec() {
  const chiSimSpec = getTesseractVendorFileSpec("chi_sim");
  assert.ok(chiSimSpec, "chi_sim spec should exist");
  assert.strictEqual(chiSimSpec.size, 23950544, "chi_sim size should match");
  assert.strictEqual(
    chiSimSpec.sha256,
    "8de91f01a7a87270b8f4e6667824c35fa2f01e4f066ec5b4a19a9713f7b94cb8",
    "chi_sim SHA-256 should match"
  );

  const engSpec = getTesseractVendorFileSpec("eng");
  assert.ok(engSpec, "eng spec should exist");
  assert.strictEqual(engSpec.size, 23356134, "eng size should match");
  assert.strictEqual(
    engSpec.sha256,
    "7851b88f6545f2e6bdcc206e81441af36eb4a520667f1dd95d0c0a0b0b6e6949",
    "eng SHA-256 should match"
  );

  const unknownSpec = getTesseractVendorFileSpec("unknown_lang");
  assert.strictEqual(unknownSpec, null, "unknown language should return null");

  console.log("  ✅ getTesseractVendorFileSpec");
}

// 测试 2: TESSERACT_VENDOR_FILES 包含必需语言
function testVendorFiles() {
  assert.ok(TESSERACT_VENDOR_FILES.chi_sim, "chi_sim should be defined");
  assert.ok(TESSERACT_VENDOR_FILES.eng, "eng should be defined");
  assert.strictEqual(TESSERACT_VENDOR_FILES.chi_sim.language, "chi_sim");
  assert.strictEqual(TESSERACT_VENDOR_FILES.eng.language, "eng");
  assert.ok(TESSERACT_VENDOR_FILES.chi_sim.description, "chi_sim should have description");
  assert.ok(TESSERACT_VENDOR_FILES.eng.description, "eng should have description");

  console.log("  ✅ TESSERACT_VENDOR_FILES structure");
}

// 测试 3: verifyTesseractVendorFile 对未知语言不报错
async function testVerifyUnknownLanguage() {
  const buffer = new ArrayBuffer(1024);
  const result = await verifyTesseractVendorFile("unknown_lang", buffer);

  assert.strictEqual(result.ok, true, "unknown language should pass");
  assert.strictEqual(result.checked, false, "unknown language should not be checked");
  assert.strictEqual(result.reason, "no-known-digest", "should have no-known-digest reason");

  console.log("  ✅ verifyTesseractVendorFile for unknown language");
}

// 测试 4: verifyTesseractVendorFile 检测大小不匹配
async function testVerifySizeMismatch() {
  const wrongSizeBuffer = new ArrayBuffer(1000); // 错误的大小
  try {
    await verifyTesseractVendorFile("chi_sim", wrongSizeBuffer);
    assert.fail("Should throw for size mismatch");
  } catch (error) {
    assert.strictEqual(error.code, "MODEL_CHECKSUM_MISMATCH", "Should throw MODEL_CHECKSUM_MISMATCH");
    assert.ok(error.message.includes("大小不匹配"), "Error message should mention size mismatch");
    assert.strictEqual(error.details.reason, "size-mismatch");
    assert.strictEqual(error.details.expectedSize, 23950544);
    assert.strictEqual(error.details.actualSize, 1000);
  }

  console.log("  ✅ verifyTesseractVendorFile detects size mismatch");
}

// 测试 5: verifyTesseractVendorFile 检测 HTML 错误页
async function testVerifyHtmlFallback() {
  const htmlBuffer = new TextEncoder().encode("<!DOCTYPE html><html><head><title>404</title></head></html>");
  // 填充到正确大小
  const correctSizeBuffer = new ArrayBuffer(23950544);
  const view = new Uint8Array(correctSizeBuffer);
  view.set(htmlBuffer, 0);

  try {
    await verifyTesseractVendorFile("chi_sim", correctSizeBuffer);
    assert.fail("Should throw for HTML fallback");
  } catch (error) {
    assert.strictEqual(error.code, "MODEL_CHECKSUM_MISMATCH", "Should throw MODEL_CHECKSUM_MISMATCH");
    assert.ok(error.message.includes("HTML"), "Error message should mention HTML");
    assert.strictEqual(error.details.reason, "html-fallback");
  }

  console.log("  ✅ verifyTesseractVendorFile detects HTML fallback");
}

// 测试 6: verifyTesseractVendorFile 检测 SHA-256 不匹配
async function testVerifyChecksumMismatch() {
  // 创建正确大小但内容错误的 buffer
  const wrongContentBuffer = new ArrayBuffer(23950544);
  const view = new Uint8Array(wrongContentBuffer);
  view.fill(0xFF); // 填充错误内容

  try {
    await verifyTesseractVendorFile("chi_sim", wrongContentBuffer);
    assert.fail("Should throw for SHA-256 mismatch");
  } catch (error) {
    assert.strictEqual(error.code, "MODEL_CHECKSUM_MISMATCH", "Should throw MODEL_CHECKSUM_MISMATCH");
    assert.ok(error.message.includes("SHA-256"), "Error message should mention SHA-256");
    assert.strictEqual(error.details.reason, "sha256-mismatch");
    assert.ok(error.details.expected, "Should have expected hash");
    assert.ok(error.details.actual, "Should have actual hash");
    assert.notStrictEqual(error.details.expected, error.details.actual, "Hashes should differ");
  }

  console.log("  ✅ verifyTesseractVendorFile detects SHA-256 mismatch");
}

// 测试 7: 验证冻结对象不可变
function testImmutability() {
  assert.throws(() => {
    TESSERACT_VENDOR_FILES.chi_sim.size = 999;
  }, "TESSERACT_VENDOR_FILES.chi_sim should be frozen");

  assert.throws(() => {
    TESSERACT_VENDOR_FILES.new_lang = {};
  }, "TESSERACT_VENDOR_FILES should be frozen");

  console.log("  ✅ TESSERACT_VENDOR_FILES immutability");
}

// 测试 8: 边界情况 - null/undefined buffer
async function testNullBuffer() {
  try {
    await verifyTesseractVendorFile("chi_sim", null);
    assert.fail("Should throw for null buffer");
  } catch (error) {
    assert.strictEqual(error.code, "MODEL_CHECKSUM_MISMATCH");
    assert.strictEqual(error.details.actualSize, 0);
  }

  try {
    await verifyTesseractVendorFile("chi_sim", undefined);
    assert.fail("Should throw for undefined buffer");
  } catch (error) {
    assert.strictEqual(error.code, "MODEL_CHECKSUM_MISMATCH");
    assert.strictEqual(error.details.actualSize, 0);
  }

  console.log("  ✅ null/undefined buffer handling");
}

// 测试 9: 边界情况 - 空语言
async function testEmptyLanguage() {
  const buffer = new ArrayBuffer(1024);
  const result1 = await verifyTesseractVendorFile("", buffer);
  assert.strictEqual(result1.checked, false, "empty string should not be checked");

  const result2 = await verifyTesseractVendorFile(null, buffer);
  assert.strictEqual(result2.checked, false, "null language should not be checked");

  const result3 = await verifyTesseractVendorFile(undefined, buffer);
  assert.strictEqual(result3.checked, false, "undefined language should not be checked");

  console.log("  ✅ empty/null/undefined language handling");
}

// 运行所有测试
(async () => {
  try {
    testGetSpec();
    testVendorFiles();
    await testVerifyUnknownLanguage();
    await testVerifySizeMismatch();
    await testVerifyHtmlFallback();
    await testVerifyChecksumMismatch();
    testImmutability();
    await testNullBuffer();
    await testEmptyLanguage();

    console.log("\n✅ Tesseract SHA-256 verification test passed: all 9 test cases verified.");
    console.log("   Issue #129 fix verified:");
    console.log("   - chi_sim and eng traineddata SHA-256 are pinned and verified");
    console.log("   - Unknown languages skip verification (user-provided)");
    console.log("   - Size mismatch, HTML fallback, and checksum mismatch are detected");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
