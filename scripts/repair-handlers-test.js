// Repair Handlers 测试
// 目标：提升覆盖率从 54.33% 到 75%+

import { strict as assert } from "assert";
import { DEFAULT_HANDLERS } from "../public/core/repair-handlers.js";
import { REPAIR_ACTION_TYPES } from "../public/core/repair-actions.js";

console.log("Testing repair-handlers module...");

// 辅助函数：创建测试模型
function createTestModel(blocks = []) {
  return {
    version: "0.2.0",
    blocks,
    meta: {},
  };
}

// 测试 1: replaceTextRun - 基本文本替换
function testReplaceTextRunBasic() {
  const model = createTestModel([
    { id: "b1", type: "paragraph", text: "Hello World" },
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "b1",
    before: "World",
    after: "Universe",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model, action });

  assert.strictEqual(result.ok, true, "应该成功");
  assert.strictEqual(result.model.blocks[0].text, "Hello Universe", "文本应被替换");
  assert.strictEqual(result.note, "replaced-text", "应该说明替换字段");
  console.log("  ✅ replaceTextRun basic");
}

// 测试 2: replaceTextRun - 目标块不存在
function testReplaceTextRunBlockNotFound() {
  const model = createTestModel([
    { id: "b1", type: "paragraph", text: "Hello" },
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "b999", // 不存在
    before: "Hello",
    after: "Hi",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model, action });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.strictEqual(result.note, "target-block-not-found", "应该说明块未找到");
  console.log("  ✅ replaceTextRun block not found");
}

// 测试 3: replaceTextRun - before 文本不存在
function testReplaceTextRunBeforeNotFound() {
  const model = createTestModel([
    { id: "b1", type: "paragraph", text: "Hello World" },
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "b1",
    before: "NotExist",
    after: "Something",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model, action });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.strictEqual(result.note, "before-not-found", "应该说明文本未找到");
  console.log("  ✅ replaceTextRun before not found");
}

// 测试 4: replaceTextRun - 不同块类型的默认字段
function testReplaceTextRunDefaultFields() {
  // heading
  const model1 = createTestModel([
    { id: "h1", type: "heading", text: "Title" },
  ]);
  const result1 = DEFAULT_HANDLERS.replaceTextRun({
    model: model1,
    action: { targetId: "h1", before: "Title", after: "Header" },
  });
  assert.strictEqual(result1.ok, true, "heading 应使用 text 字段");
  assert.strictEqual(result1.model.blocks[0].text, "Header");

  // code
  const model2 = createTestModel([
    { id: "c1", type: "code", code: "console.log('test')" },
  ]);
  const result2 = DEFAULT_HANDLERS.replaceTextRun({
    model: model2,
    action: { targetId: "c1", before: "test", after: "hello" },
  });
  assert.strictEqual(result2.ok, true, "code 应使用 code 字段");
  assert.strictEqual(result2.model.blocks[0].code, "console.log('hello')");

  // quote
  const model3 = createTestModel([
    { id: "q1", type: "quote", text: "Quote" },
  ]);
  const result3 = DEFAULT_HANDLERS.replaceTextRun({
    model: model3,
    action: { targetId: "q1", before: "Quote", after: "Citation" },
  });
  assert.strictEqual(result3.ok, true, "quote 应使用 text 字段");
  assert.strictEqual(result3.model.blocks[0].text, "Citation");

  console.log("  ✅ replaceTextRun default fields");
}

// 测试 5: replaceTextRun - 显式指定 targetField
function testReplaceTextRunExplicitField() {
  const model = createTestModel([
    { id: "b1", type: "custom", data: "Some data", other: "Other" },
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "b1",
    targetField: "data",
    before: "Some",
    after: "New",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model, action });

  assert.strictEqual(result.ok, true, "应该成功");
  assert.strictEqual(result.model.blocks[0].data, "New data", "应使用指定字段");
  assert.strictEqual(result.note, "replaced-data");
  console.log("  ✅ replaceTextRun explicit field");
}

// 测试 6: replaceTextRun - 列表项替换
function testReplaceTextRunListItems() {
  const model = createTestModel([
    { id: "l1", type: "list", items: ["Item 1", "Item 2", "Item 3"] },
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "l1",
    targetField: "items[1]",
    before: "Item 2",
    after: "Updated Item 2",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model, action });

  assert.strictEqual(result.ok, true, "应该成功");
  assert.deepStrictEqual(result.model.blocks[0].items, ["Item 1", "Updated Item 2", "Item 3"]);
  assert.strictEqual(result.note, "replaced-items[1]");
  console.log("  ✅ replaceTextRun list items");
}

// 测试 7: replaceTextRun - 列表项索引越界
function testReplaceTextRunListOutOfBounds() {
  const model = createTestModel([
    { id: "l1", type: "list", items: ["Item 1", "Item 2"] },
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "l1",
    targetField: "items[5]",
    before: "Item",
    after: "New",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model, action });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.strictEqual(result.note, "field-out-of-bounds");
  console.log("  ✅ replaceTextRun list out of bounds");
}

// 测试 8: replaceTextRun - 没有合适的字段
function testReplaceTextRunNoSuitableField() {
  const model = createTestModel([
    { id: "b1", type: "unknown" }, // 没有默认字段
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "b1",
    before: "test",
    after: "new",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model, action });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.strictEqual(result.note, "no-suitable-field");
  console.log("  ✅ replaceTextRun no suitable field");
}

// 测试 9: selectFallbackRoute - 推荐降级（不应用）
function testSelectFallbackRouteRecommend() {
  const model = createTestModel([{ id: "b1", type: "paragraph", text: "Test" }]);

  const action = {
    type: "selectFallbackRoute",
    fallback: { to: "plain-text" },
  };

  const context = {
    from: "docx",
    to: "markdown",
    content: {},
    title: "Test",
    fileName: "test.md",
    options: { repair: { applyFallback: false } }, // 不应用
    prepareConversionModel: () => ({}),
    write: () => ({}),
  };

  const result = DEFAULT_HANDLERS.selectFallbackRoute({ model, action, context });

  assert.strictEqual(result.ok, true, "应该成功");
  assert.strictEqual(result.fallbackTo, "plain-text");
  assert.strictEqual(result.fallbackRecommended, true);
  assert.strictEqual(result.note, "fallback-recommended:plain-text");
  console.log("  ✅ selectFallbackRoute recommend");
}

// 测试 10: selectFallbackRoute - 应用降级
function testSelectFallbackRouteApply() {
  const model = createTestModel([{ id: "b1", type: "paragraph", text: "Test" }]);

  const action = {
    type: "selectFallbackRoute",
    fallback: { to: "plain-text" },
  };

  const fallbackModel = createTestModel([{ id: "b2", type: "paragraph", text: "Fallback" }]);
  const fallbackOutput = { format: "plain-text", content: "Fallback text" };

  const context = {
    from: "docx",
    to: "markdown",
    content: {},
    title: "Test",
    fileName: "test.md",
    options: { repair: { applyFallback: true } }, // 应用
    prepareConversionModel: () => fallbackModel,
    write: () => fallbackOutput,
  };

  const result = DEFAULT_HANDLERS.selectFallbackRoute({ model, action, context });

  assert.strictEqual(result.ok, true, "应该成功");
  assert.strictEqual(result.fallbackTo, "plain-text");
  assert.strictEqual(result.fallbackApplied, true);
  assert.deepStrictEqual(result.model, fallbackModel);
  assert.deepStrictEqual(result.outputOverride, fallbackOutput);
  console.log("  ✅ selectFallbackRoute apply");
}

// 测试 11: selectFallbackRoute - 缺少 fallback 目标
function testSelectFallbackRouteMissingTarget() {
  const model = createTestModel([]);

  const action = {
    type: "selectFallbackRoute",
    fallback: {}, // 缺少 to
  };

  const result = DEFAULT_HANDLERS.selectFallbackRoute({ model, action, context: {} });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.strictEqual(result.note, "missing-fallback-target");
  console.log("  ✅ selectFallbackRoute missing target");
}

// 测试 12: selectFallbackRoute - 缺少 registry 方法
function testSelectFallbackRouteMissingRegistry() {
  const model = createTestModel([]);

  const action = {
    type: "selectFallbackRoute",
    fallback: { to: "plain-text" },
  };

  const context = { to: "markdown" }; // 缺少 prepareConversionModel 和 write

  const result = DEFAULT_HANDLERS.selectFallbackRoute({ model, action, context });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.strictEqual(result.note, "registry-handles-missing");
  console.log("  ✅ selectFallbackRoute missing registry");
}

// 测试 13: selectFallbackRoute - fallback 等于原目标
function testSelectFallbackRouteEqualsOriginal() {
  const model = createTestModel([]);

  const action = {
    type: "selectFallbackRoute",
    fallback: { to: "markdown" },
  };

  const context = {
    to: "markdown", // 相同
    prepareConversionModel: () => ({}),
    write: () => ({}),
  };

  const result = DEFAULT_HANDLERS.selectFallbackRoute({ model, action, context });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.strictEqual(result.note, "fallback-equals-original");
  console.log("  ✅ selectFallbackRoute equals original");
}

// 测试 14: selectFallbackRoute - fallback 路由失败
function testSelectFallbackRouteFailed() {
  const model = createTestModel([]);

  const action = {
    type: "selectFallbackRoute",
    fallback: { to: "plain-text" },
  };

  const context = {
    from: "docx",
    to: "markdown",
    content: {},
    options: { repair: { applyFallback: true } },
    prepareConversionModel: () => {
      throw new Error("Conversion failed");
    },
    write: () => ({}),
  };

  const result = DEFAULT_HANDLERS.selectFallbackRoute({ model, action, context });

  assert.strictEqual(result.ok, false, "应该失败");
  assert.ok(result.note.startsWith("fallback-route-failed:"), "应说明失败原因");
  console.log("  ✅ selectFallbackRoute failed");
}

// 测试 15: placeholder handlers
function testPlaceholderHandlers() {
  const model = createTestModel([]);

  const placeholders = [
    "insertTextRun",
    "reorderBlocks",
    "restoreTableGrid",
    "adjustBoundingBox",
    "regeneratePageLayout",
  ];

  for (const handlerName of placeholders) {
    const result = DEFAULT_HANDLERS[handlerName]({ model });
    assert.strictEqual(result.ok, false, `${handlerName} 应该失败（未实现）`);
    assert.strictEqual(result.note, `handler-not-implemented:${handlerName}`);
  }

  console.log("  ✅ placeholder handlers");
}

// 测试 16: 所有 REPAIR_ACTION_TYPES 都有对应 handler
function testAllActionTypesHaveHandlers() {
  for (const actionType of REPAIR_ACTION_TYPES) {
    assert.ok(DEFAULT_HANDLERS[actionType], `${actionType} 应该有对应的 handler`);
  }
  console.log("  ✅ all action types have handlers");
}

// 测试 17: 模型克隆不修改原模型
function testModelImmutability() {
  const original = createTestModel([
    { id: "b1", type: "paragraph", text: "Original" },
  ]);

  const action = {
    type: "replaceTextRun",
    targetId: "b1",
    before: "Original",
    after: "Modified",
  };

  const result = DEFAULT_HANDLERS.replaceTextRun({ model: original, action });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(original.blocks[0].text, "Original", "原模型不应被修改");
  assert.strictEqual(result.model.blocks[0].text, "Modified", "新模型应被修改");
  console.log("  ✅ model immutability");
}

// 运行所有测试
try {
  testReplaceTextRunBasic();
  testReplaceTextRunBlockNotFound();
  testReplaceTextRunBeforeNotFound();
  testReplaceTextRunDefaultFields();
  testReplaceTextRunExplicitField();
  testReplaceTextRunListItems();
  testReplaceTextRunListOutOfBounds();
  testReplaceTextRunNoSuitableField();
  testSelectFallbackRouteRecommend();
  testSelectFallbackRouteApply();
  testSelectFallbackRouteMissingTarget();
  testSelectFallbackRouteMissingRegistry();
  testSelectFallbackRouteEqualsOriginal();
  testSelectFallbackRouteFailed();
  testPlaceholderHandlers();
  testAllActionTypesHaveHandlers();
  testModelImmutability();

  console.log("\n✅ Repair handlers test passed");
  console.log("   - 测试了 replaceTextRun 的所有路径");
  console.log("   - 测试了 selectFallbackRoute 的所有场景");
  console.log("   - 测试了 5 个 placeholder handlers");
  console.log("   - 测试了模型不可变性");
  console.log("   - 测试了错误处理路径");
  console.log("   - 预期覆盖率：54.33% → 85%+");

  process.exit(0);
} catch (error) {
  console.error("\n❌ Repair handlers test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
