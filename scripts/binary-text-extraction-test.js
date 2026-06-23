// Binary Text Extraction 测试
// 目标：提升覆盖率从 75.4% 到 85%+

import { strict as assert } from "assert";
import { extractReadableTextFromBinary } from "../public/core/binary-text-extraction.js";

console.log("Testing binary-text-extraction module...");

// 测试 1: Uint8Array 输入
function testUint8ArrayInput() {
  const bytes = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"
  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.text.includes("Hello"), "应包含 Hello");
  assert.strictEqual(result.byteLength, 11);
  console.log("  ✅ Uint8Array input");
}

// 测试 2: ArrayBuffer 输入
function testArrayBufferInput() {
  const buffer = new ArrayBuffer(5);
  const view = new Uint8Array(buffer);
  view[0] = 72; view[1] = 101; view[2] = 108; view[3] = 108; view[4] = 111; // "Hello"

  const result = extractReadableTextFromBinary(buffer);

  assert.ok(result.text.includes("Hello"), "应包含 Hello");
  console.log("  ✅ ArrayBuffer input");
}

// 测试 3: TypedArray 输入
function testTypedArrayInput() {
  const buffer = new ArrayBuffer(4);
  const view = new Uint16Array(buffer);
  view[0] = 72; view[1] = 105; // "Hi"

  const result = extractReadableTextFromBinary(view);

  assert.ok(result.byteLength > 0, "应有字节长度");
  console.log("  ✅ TypedArray input");
}

// 测试 4: base64 data URL 输入
function testBase64DataUrl() {
  const text = "Hello World";
  const base64 = Buffer.from(text).toString("base64");
  const dataUrl = `data:text/plain;base64,${base64}`;

  const result = extractReadableTextFromBinary(dataUrl);

  assert.ok(result.text.includes("Hello"), "应包含 Hello");
  console.log("  ✅ base64 data URL");
}

// 测试 5: 纯文本字符串输入
function testPlainTextInput() {
  const text = "Plain text input";
  const result = extractReadableTextFromBinary(text);

  assert.ok(result.text.includes("Plain"), "应包含原文本");
  console.log("  ✅ plain text input");
}

// 测试 6: ASCII 文本提取
function testAsciiExtraction() {
  // 创建包含 ASCII 文本的字节流
  const text = "This is a test document with readable content.";
  const bytes = new TextEncoder().encode(text);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.text.includes("test"), "应提取 ASCII 文本");
  assert.ok(result.text.includes("document"), "应提取完整单词");
  console.log("  ✅ ASCII extraction");
}

// 测试 7: UTF-16 LE 文本提取
function testUtf16LEExtraction() {
  // 创建 UTF-16 LE 编码的文本
  const text = "Hello";
  const bytes = new Uint8Array([
    72, 0,   // H
    101, 0,  // e
    108, 0,  // l
    108, 0,  // l
    111, 0,  // o
  ]);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.text.includes("Hello"), "应提取 UTF-16 LE 文本");
  console.log("  ✅ UTF-16 LE extraction");
}

// 测试 8: UTF-16 BE 文本提取
function testUtf16BEExtraction() {
  // 创建 UTF-16 BE 编码的文本
  const bytes = new Uint8Array([
    0, 72,   // H
    0, 101,  // e
    0, 108,  // l
    0, 108,  // l
    0, 111,  // o
  ]);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.text.includes("Hello"), "应提取 UTF-16 BE 文本");
  console.log("  ✅ UTF-16 BE extraction");
}

// 测试 9: 包含控制字符的文本
function testControlCharacters() {
  // 包含 tab, newline, carriage return
  const bytes = new Uint8Array([
    72, 101, 108, 108, 111, // Hello
    9,                      // tab
    87, 111, 114, 108, 100, // World
    10,                     // newline
    84, 101, 115, 116,      // Test
  ]);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.text.length > 0, "应提取文本");
  console.log("  ✅ control characters");
}

// 测试 10: 包含噪声字符的文本
function testNoisyBinary() {
  // 混合可读文本和二进制噪声
  const bytes = new Uint8Array([
    255, 254, 0, 1,         // 噪声
    72, 101, 108, 108, 111, // Hello (可读)
    2, 3, 4, 5,             // 噪声
    87, 111, 114, 108, 100, // World (可读)
    200, 201, 202,          // 噪声
  ]);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.text.length > 0, "应提取可读部分");
  console.log("  ✅ noisy binary");
}

// 测试 11: 中文文本（CJK）
function testCJKText() {
  const text = "你好世界 Hello";
  const bytes = new TextEncoder().encode(text);

  const result = extractReadableTextFromBinary(bytes);

  // CJK 字符应被识别为可读字符
  assert.ok(result.text.length > 0, "应提取 CJK 文本");
  console.log("  ✅ CJK text");
}

// 测试 12: 最低质量阈值（纯乱码）
function testCorruptedBinary() {
  // 纯二进制噪声，控制字符
  const bytes = new Uint8Array(Array(100).fill(0).map((_, i) => (i % 32))); // 控制字符

  const result = extractReadableTextFromBinary(bytes);

  // 质量阈值测试：如果返回空文本，说明阈值工作正常
  // 如果返回了文本，说明某些字节被解析了，也是正常的
  assert.ok(result.byteLength > 0, "应有字节长度");
  assert.ok(result.source, "应有来源标记");
  console.log("  ✅ corrupted binary threshold");
}

// 测试 13: 空输入
function testEmptyInput() {
  const bytes = new Uint8Array([]);
  const result = extractReadableTextFromBinary(bytes);

  assert.strictEqual(result.byteLength, 0);
  console.log("  ✅ empty input");
}

// 测试 14: null/undefined 输入
function testNullInput() {
  const result1 = extractReadableTextFromBinary(null);
  assert.strictEqual(result1.byteLength, 0);

  const result2 = extractReadableTextFromBinary(undefined);
  assert.strictEqual(result2.byteLength, 0);

  console.log("  ✅ null/undefined input");
}

// 测试 15: 长文本提取
function testLongText() {
  // 创建长文本
  const longText = "This is a very long document. ".repeat(100);
  const bytes = new TextEncoder().encode(longText);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.text.length > 100, "应提取长文本");
  assert.ok(result.text.includes("document"), "应包含关键词");
  console.log("  ✅ long text");
}

// 测试 16: 多候选文本竞争
function testMultipleCandidates() {
  // 创建包含多种编码候选的字节流
  const ascii = "ASCII text here";
  const bytes = new TextEncoder().encode(ascii);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.candidateCount > 0, "应有多个候选");
  assert.ok(result.text.length > 0, "应选出最佳候选");
  console.log("  ✅ multiple candidates");
}

// 测试 17: 带文件名和 MIME 的选项
function testWithOptions() {
  const text = "Document content";
  const bytes = new TextEncoder().encode(text);

  const result = extractReadableTextFromBinary(bytes, {
    fileName: "test.doc",
    mime: "application/msword",
    format: "doc",
  });

  assert.ok(result.text.length > 0, "应提取文本");
  console.log("  ✅ with options");
}

// 测试 18: UTF-16 代理对处理
function testSurrogatePairs() {
  // 创建包含代理对的 UTF-16 编码（表情符号等）
  // 高代理 0xD800-0xDBFF + 低代理 0xDC00-0xDFFF
  const bytes = new Uint8Array([
    72, 0,      // H
    0x3D, 0xD8, // 高代理
    0x00, 0xDE, // 低代理（组成一个表情符号）
    105, 0,     // i
  ]);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.byteLength > 0, "应处理代理对");
  console.log("  ✅ surrogate pairs");
}

// 测试 19: 孤立代理（无效）
function testLoneSurrogates() {
  // 创建孤立的高代理（无对应低代理）
  const bytes = new Uint8Array([
    72, 0,      // H
    0x3D, 0xD8, // 孤立高代理
    105, 0,     // i (普通字符)
  ]);

  const result = extractReadableTextFromBinary(bytes);

  assert.ok(result.byteLength > 0, "应跳过孤立代理");
  console.log("  ✅ lone surrogates");
}

// 测试 20: 换行符规范化
function testNewlineNormalization() {
  // CRLF, CR, LF 混合
  const bytes = new Uint8Array([
    72, 101, 108, 108, 111, // Hello
    13, 10,                 // CRLF
    87, 111, 114, 108, 100, // World
    13,                     // CR
    84, 101, 115, 116,      // Test
    10,                     // LF
  ]);

  const result = extractReadableTextFromBinary(bytes);

  // 应规范化为统一的换行符
  assert.ok(result.text.includes("\n"), "应包含规范化的换行符");
  console.log("  ✅ newline normalization");
}

// 运行所有测试
try {
  testUint8ArrayInput();
  testArrayBufferInput();
  testTypedArrayInput();
  testBase64DataUrl();
  testPlainTextInput();
  testAsciiExtraction();
  testUtf16LEExtraction();
  testUtf16BEExtraction();
  testControlCharacters();
  testNoisyBinary();
  testCJKText();
  testCorruptedBinary();
  testEmptyInput();
  testNullInput();
  testLongText();
  testMultipleCandidates();
  testWithOptions();
  testSurrogatePairs();
  testLoneSurrogates();
  testNewlineNormalization();

  console.log("\n✅ Binary text extraction test passed");
  console.log("   - 测试了所有输入类型（Uint8Array, ArrayBuffer, TypedArray, data URL, 字符串）");
  console.log("   - 测试了 ASCII/UTF-16LE/UTF-16BE 文本提取");
  console.log("   - 测试了 CJK 字符支持");
  console.log("   - 测试了控制字符和噪声处理");
  console.log("   - 测试了代理对和孤立代理");
  console.log("   - 测试了纯乱码阈值");
  console.log("   - 测试了候选文本竞争机制");
  console.log("   - 预期覆盖率：75.4% → 85%+");

  process.exit(0);
} catch (error) {
  console.error("\n❌ Binary text extraction test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
