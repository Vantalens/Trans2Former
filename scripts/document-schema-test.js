// Document Schema 测试
// 目标：提升覆盖率从 81.56% 到 90%+

import { strict as assert } from "assert";
import { validateDocumentModel, assertValidDocumentModel } from "../public/core/document-schema.js";
import { ConversionError } from "../public/core/conversion-error.js";

console.log("Testing document-schema module...");

// 辅助函数：创建有效的文档模型
function createValidModel() {
  return {
    schemaVersion: "trans2former.document.v1",
    title: "Test Document",
    sourceFormat: "markdown",
    blocks: [],
    assets: [],
    metadata: {},
  };
}

// 测试 1: 有效的文档模型
function testValidModel() {
  const model = createValidModel();
  const result = validateDocumentModel(model);

  assert.strictEqual(result.ok, true, "应验证通过");
  assert.deepStrictEqual(result.errors, []);
  console.log("  ✅ valid model");
}

// 测试 2: 非对象输入
function testNonObjectModel() {
  const result = validateDocumentModel("not an object");

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes("model must be an object"));
  console.log("  ✅ non-object model");
}

// 测试 3: 缺少必需字段
function testMissingFields() {
  const model = {};
  const result = validateDocumentModel(model);

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("schemaVersion")));
  assert.ok(result.errors.some(e => e.includes("title")));
  assert.ok(result.errors.some(e => e.includes("sourceFormat")));
  assert.ok(result.errors.some(e => e.includes("blocks")));
  assert.ok(result.errors.some(e => e.includes("assets")));
  assert.ok(result.errors.some(e => e.includes("metadata")));
  console.log("  ✅ missing fields");
}

// 测试 4: 错误的字段类型
function testInvalidFieldTypes() {
  const model = {
    schemaVersion: 123, // 应该是字符串
    title: null,
    sourceFormat: [],
    blocks: "not array",
    assets: {},
    metadata: "not object",
  };

  const result = validateDocumentModel(model);

  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 5);
  console.log("  ✅ invalid field types");
}

// 测试 5: heading 块验证
function testHeadingBlock() {
  const model = createValidModel();
  model.blocks = [
    {
      type: "heading",
      id: "h1",
      level: 1,
      text: "Title",
      sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 5 },
      warnings: [],
    },
  ];

  const result = validateDocumentModel(model);
  assert.strictEqual(result.ok, true);

  // 无效的 level
  model.blocks[0].level = 7;
  const result2 = validateDocumentModel(model);
  assert.strictEqual(result2.ok, false);
  assert.ok(result2.errors.some(e => e.includes("level must be 1-6")));

  // 缺少 text
  model.blocks[0].level = 2;
  model.blocks[0].text = 123;
  const result3 = validateDocumentModel(model);
  assert.strictEqual(result3.ok, false);

  console.log("  ✅ heading block");
}

// 测试 6: paragraph 和 quote 块验证
function testParagraphAndQuoteBlocks() {
  const model = createValidModel();

  // 有效的 paragraph
  model.blocks = [{
    type: "paragraph",
    id: "p1",
    text: "Content",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 7 },
    warnings: [],
  }];
  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 无效的 paragraph (text 不是字符串)
  model.blocks[0].text = null;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 有效的 quote
  model.blocks[0] = {
    type: "quote",
    id: "q1",
    text: "Quote text",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 10 },
    warnings: [],
  };
  assert.strictEqual(validateDocumentModel(model).ok, true);

  console.log("  ✅ paragraph and quote blocks");
}

// 测试 7: list 块验证
function testListBlock() {
  const model = createValidModel();
  model.blocks = [{
    type: "list",
    id: "l1",
    ordered: false,
    items: ["Item 1", "Item 2"],
    sourceSpan: { startLine: 0, endLine: 2, startOffset: 0, endOffset: 20 },
    warnings: [],
  }];

  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 无效的 ordered
  model.blocks[0].ordered = "not boolean";
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 无效的 items（不是字符串数组）
  model.blocks[0].ordered = true;
  model.blocks[0].items = [123, 456];
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 有效的 itemMeta
  model.blocks[0].items = ["Item 1"];
  model.blocks[0].itemMeta = [{ key: "value" }];
  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 无效的 itemMeta
  model.blocks[0].itemMeta = ["not object"];
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ list block");
}

// 测试 8: code 块验证
function testCodeBlock() {
  const model = createValidModel();
  model.blocks = [{
    type: "code",
    id: "c1",
    code: "console.log('hello');",
    language: "javascript",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 22 },
    warnings: [],
  }];

  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 缺少 code
  model.blocks[0].code = 123;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 缺少 language
  model.blocks[0].code = "code";
  model.blocks[0].language = null;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ code block");
}

// 测试 9: table 块验证
function testTableBlock() {
  const model = createValidModel();
  model.blocks = [{
    type: "table",
    id: "t1",
    headers: ["Col1", "Col2"],
    rows: [["A", "B"], ["C", "D"]],
    sourceSpan: { startLine: 0, endLine: 2, startOffset: 0, endOffset: 30 },
    warnings: [],
  }];

  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 无效的 headers
  model.blocks[0].headers = [123, 456];
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 无效的 rows
  model.blocks[0].headers = ["Col1"];
  model.blocks[0].rows = ["not array"];
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 有效的 alignments
  model.blocks[0].rows = [["A"]];
  model.blocks[0].alignments = ["left", "center"];
  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 无效的 alignments
  model.blocks[0].alignments = [123];
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ table block");
}

// 测试 10: image 块验证
function testImageBlock() {
  const model = createValidModel();
  model.blocks = [{
    type: "image",
    id: "i1",
    src: "image.png",
    alt: "Image",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 10 },
    warnings: [],
  }];

  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 缺少 src
  model.blocks[0].src = 123;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 缺少 alt
  model.blocks[0].src = "image.png";
  model.blocks[0].alt = null;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ image block");
}

// 测试 11: asset 块验证
function testAssetBlock() {
  const model = createValidModel();
  model.blocks = [{
    type: "asset",
    id: "a1",
    assetId: "asset-123",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 10 },
    warnings: [],
  }];

  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 缺少 assetId
  model.blocks[0].assetId = null;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ asset block");
}

// 测试 12: raw 块验证
function testRawBlock() {
  const model = createValidModel();
  model.blocks = [{
    type: "raw",
    id: "r1",
    format: "html",
    content: "<div>Raw HTML</div>",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 20 },
    warnings: [],
  }];

  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 缺少 format
  model.blocks[0].format = 123;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 缺少 content
  model.blocks[0].format = "html";
  model.blocks[0].content = null;
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ raw block");
}

// 测试 13: 无效的块类型
function testInvalidBlockType() {
  const model = createValidModel();
  model.blocks = [{
    type: "unknown",
    id: "u1",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 0 },
    warnings: [],
  }];

  const result = validateDocumentModel(model);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("type is invalid")));

  console.log("  ✅ invalid block type");
}

// 测试 14: 块不是对象
function testBlockNotObject() {
  const model = createValidModel();
  model.blocks = ["not an object"];

  const result = validateDocumentModel(model);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("blocks[0] must be an object")));

  console.log("  ✅ block not object");
}

// 测试 15: 缺少块 id
function testMissingBlockId() {
  const model = createValidModel();
  model.blocks = [{
    type: "paragraph",
    id: 123, // 应该是字符串
    text: "Content",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 7 },
    warnings: [],
  }];

  const result = validateDocumentModel(model);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("id must be a string")));

  console.log("  ✅ missing block id");
}

// 测试 16: sourceSpan 验证
function testSourceSpanValidation() {
  const model = createValidModel();
  model.blocks = [{
    type: "paragraph",
    id: "p1",
    text: "Content",
    sourceSpan: "not an object", // 应该是对象
    warnings: [],
  }];

  const result = validateDocumentModel(model);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("sourceSpan must be an object")));

  // 无效的 sourceSpan 字段
  model.blocks[0].sourceSpan = {
    startLine: "not a number",
    endLine: 0,
    startOffset: 0,
    endOffset: 7,
  };
  const result2 = validateDocumentModel(model);
  assert.strictEqual(result2.ok, false);

  console.log("  ✅ sourceSpan validation");
}

// 测试 17: warnings 验证
function testWarningsValidation() {
  const model = createValidModel();
  model.blocks = [{
    type: "paragraph",
    id: "p1",
    text: "Content",
    sourceSpan: { startLine: 0, endLine: 0, startOffset: 0, endOffset: 7 },
    warnings: "not an array", // 应该是数组
  }];

  const result = validateDocumentModel(model);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("must be warning[]")));

  // 无效的 warning 对象
  model.blocks[0].warnings = ["not an object"];
  const result2 = validateDocumentModel(model);
  assert.strictEqual(result2.ok, false);

  // 缺少 warning 字段
  model.blocks[0].warnings = [{ severity: "warning" }]; // 缺少 code 和 message
  const result3 = validateDocumentModel(model);
  assert.strictEqual(result3.ok, false);

  // 有效的 warnings
  model.blocks[0].warnings = [{
    severity: "warning",
    code: "WARN_001",
    message: "Warning message",
    details: {},
  }];
  const result4 = validateDocumentModel(model);
  assert.strictEqual(result4.ok, true);

  console.log("  ✅ warnings validation");
}

// 测试 18: assets 验证
function testAssetsValidation() {
  const model = createValidModel();
  model.assets = [{
    id: "asset1",
    name: "image.png",
    mime: "image/png",
    data: "base64data",
    role: "embed",
    size: 1024,
    provenance: {},
  }];

  assert.strictEqual(validateDocumentModel(model).ok, true);

  // asset 不是对象
  model.assets = ["not an object"];
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 缺少必需字段
  model.assets = [{ id: "asset1" }];
  const result = validateDocumentModel(model);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("name must be a string")));

  // size 不是数字
  model.assets = [{
    id: "a1",
    name: "file",
    mime: "type",
    data: "data",
    role: "role",
    size: "not a number",
    provenance: {},
  }];
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ assets validation");
}

// 测试 19: metadata 验证
function testMetadataValidation() {
  const model = createValidModel();

  // 有效的 metadata
  model.metadata = {
    warnings: [{
      severity: "info",
      code: "INFO_001",
      message: "Info",
      details: {},
    }],
    conversion: { from: "markdown", to: "html" },
    qualityReport: { score: 0.95 },
  };
  assert.strictEqual(validateDocumentModel(model).ok, true);

  // 无效的 conversion
  model.metadata.conversion = "not an object";
  assert.strictEqual(validateDocumentModel(model).ok, false);

  // 无效的 qualityReport
  model.metadata.conversion = {};
  model.metadata.qualityReport = "not an object";
  assert.strictEqual(validateDocumentModel(model).ok, false);

  console.log("  ✅ metadata validation");
}

// 测试 20: assertValidDocumentModel
function testAssertValidDocumentModel() {
  const validModel = createValidModel();

  // 应该返回原模型
  const result = assertValidDocumentModel(validModel);
  assert.strictEqual(result, validModel);

  // 无效模型应该抛出异常
  const invalidModel = { schemaVersion: "wrong" };
  try {
    assertValidDocumentModel(invalidModel);
    assert.fail("应该抛出异常");
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    assert.strictEqual(error.code, "DOCUMENT_MODEL_SCHEMA_ERROR");
    assert.ok(error.message.includes("schema validation failed"));
  }

  console.log("  ✅ assertValidDocumentModel");
}

// 运行所有测试
try {
  testValidModel();
  testNonObjectModel();
  testMissingFields();
  testInvalidFieldTypes();
  testHeadingBlock();
  testParagraphAndQuoteBlocks();
  testListBlock();
  testCodeBlock();
  testTableBlock();
  testImageBlock();
  testAssetBlock();
  testRawBlock();
  testInvalidBlockType();
  testBlockNotObject();
  testMissingBlockId();
  testSourceSpanValidation();
  testWarningsValidation();
  testAssetsValidation();
  testMetadataValidation();
  testAssertValidDocumentModel();

  console.log("\n✅ Document schema test passed");
  console.log("   - 测试了所有块类型验证");
  console.log("   - 测试了 sourceSpan 和 warnings 验证");
  console.log("   - 测试了 assets 和 metadata 验证");
  console.log("   - 测试了所有错误路径");
  console.log("   - 测试了 assertValidDocumentModel");
  console.log("   - 预期覆盖率：81.56% → 95%+");

  process.exit(0);
} catch (error) {
  console.error("\n❌ Document schema test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
