// Repair Engine placeholder 收缩测试
// Issue #14: 验证 Landing 文案如实标注实现范围，recommendations 渲染到质检报告

import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

console.log("Testing Repair Engine placeholder documentation (Issue #14)...");

// 测试 1: 验证 Landing 页面如实标注实现范围
function testLandingPageCaveats() {
  const landingPath = join(projectRoot, "public/landing-view.js");
  const landingContent = readFileSync(landingPath, "utf-8");

  // 应该标注当前实现的动作数量
  assert.ok(
    landingContent.includes("当前实现：replaceTextRun + selectFallbackRoute"),
    "Landing 页面应标注当前实现的动作"
  );

  // 应该明确列出占位动作
  assert.ok(
    landingContent.includes("insertTextRun / reorderBlocks / restoreTableGrid / adjustBoundingBox / regeneratePageLayout 为占位"),
    "Landing 页面应列出占位动作"
  );

  // Hero 区域应标注 2/7 动作已实现
  assert.ok(
    landingContent.includes("Repair Engine（2/7 动作已实现）"),
    "Hero 区域应标注 2/7 动作已实现"
  );

  // Workflow 步骤应标注当前 2/7 动作
  assert.ok(
    landingContent.includes("Repair Engine 提议、应用（当前 2/7 动作）、复核"),
    "Workflow 步骤应标注当前实现范围"
  );

  console.log("  ✅ Landing 页面如实标注实现范围");
}

// 测试 2: 验证 repair-handlers.js 中的 placeholder 实现
function testPlaceholderHandlers() {
  const handlersPath = join(projectRoot, "public/core/repair-handlers.js");
  const handlersContent = readFileSync(handlersPath, "utf-8");

  // 验证 placeholderHandler 函数存在
  assert.ok(
    handlersContent.includes("function placeholderHandler"),
    "repair-handlers.js 应有 placeholderHandler 函数"
  );

  // 验证 5 个占位 handler
  const placeholders = [
    "insertTextRun: placeholderHandler",
    "reorderBlocks: placeholderHandler",
    "restoreTableGrid: placeholderHandler",
    "adjustBoundingBox: placeholderHandler",
    "regeneratePageLayout: placeholderHandler",
  ];

  placeholders.forEach((placeholder) => {
    assert.ok(
      handlersContent.includes(placeholder),
      `应有 ${placeholder}`
    );
  });

  // 验证 2 个已实现 handler
  assert.ok(
    handlersContent.includes("replaceTextRun: applyReplaceTextRun"),
    "replaceTextRun 应已实现"
  );
  assert.ok(
    handlersContent.includes("selectFallbackRoute: applySelectFallbackRoute"),
    "selectFallbackRoute 应已实现"
  );

  console.log("  ✅ repair-handlers.js 正确标注占位和实现");
}

// 测试 3: 验证 app.js 渲染 recommendations
function testRecommendationsRendering() {
  const appPath = join(projectRoot, "public/app.js");
  const appContent = readFileSync(appPath, "utf-8");

  // 应该获取 recommendations
  assert.ok(
    appContent.includes("const recommendations = autoRepair.recommendations || []"),
    "app.js 应获取 recommendations"
  );

  // 应该检查 recommendations 长度
  assert.ok(
    appContent.includes("if (recommendations.length > 0)"),
    "app.js 应检查 recommendations 是否存在"
  );

  // 应该渲染 recommendations 到 qualityLines
  assert.ok(
    appContent.includes("qualityLines.push(`repair recommendations: ${recommendations.length} 条`)"),
    "app.js 应显示 recommendations 数量"
  );

  // 应该遍历并显示每个 recommendation
  assert.ok(
    appContent.includes("recommendations.forEach((rec, index) =>"),
    "app.js 应遍历 recommendations"
  );

  // 应该显示 actionType 和 note
  assert.ok(
    appContent.includes("const actionDesc = rec.actionType || \"unknown\""),
    "app.js 应显示 actionType"
  );
  assert.ok(
    appContent.includes("const noteDesc = rec.note ? ` (${rec.note})` : \"\""),
    "app.js 应显示 note"
  );

  console.log("  ✅ app.js 正确渲染 recommendations");
}

// 测试 4: 验证文档说明占位状态
function testDocumentation() {
  const docPath = join(projectRoot, "docs/architecture/MULTI_MODEL_ARCHITECTURE.md");
  if (readFileSync(docPath, "utf-8")) {
    // 文档存在，检查是否说明占位状态
    const docContent = readFileSync(docPath, "utf-8");

    // 应该说明占位 handler
    const hasPlaceholderNote =
      docContent.includes("占位") ||
      docContent.includes("placeholder") ||
      docContent.includes("handler-not-implemented");

    if (hasPlaceholderNote) {
      console.log("  ✅ 文档说明了占位状态");
    } else {
      console.log("  ℹ️  文档未明确说明占位状态（可选）");
    }
  } else {
    console.log("  ℹ️  文档不存在，跳过");
  }
}

// 测试 5: 验证占位 handler 返回正确的结构
function testPlaceholderHandlerStructure() {
  const handlersPath = join(projectRoot, "public/core/repair-handlers.js");
  const handlersContent = readFileSync(handlersPath, "utf-8");

  // placeholderHandler 应该返回 { ok: false, model, note }
  assert.ok(
    handlersContent.includes("ok: false") &&
    handlersContent.includes("handler-not-implemented"),
    "placeholderHandler 应返回正确的拒绝结构"
  );

  console.log("  ✅ placeholderHandler 返回正确的拒绝结构");
}

// 运行测试
try {
  testLandingPageCaveats();
  testPlaceholderHandlers();
  testRecommendationsRendering();
  testDocumentation();
  testPlaceholderHandlerStructure();

  console.log("\n✅ Repair Engine placeholder documentation test passed (Issue #14)");
  console.log("   - Landing 页面如实标注 2/7 动作已实现");
  console.log("   - 明确列出占位动作（insertTextRun/reorderBlocks/restoreTableGrid/adjustBoundingBox/regeneratePageLayout）");
  console.log("   - app.js 正确渲染 recommendations 到质检报告");
  console.log("   - repair-handlers.js 正确区分已实现和占位 handler");
  console.log("   - 用户可见 recommendations 内容（不再是计算后不可见的死数据）");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Repair Engine placeholder test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
