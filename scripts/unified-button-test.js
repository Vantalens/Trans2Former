// 统一按钮实现测试
// Issue #42: 验证按钮样式使用统一的 CSS token 和渐变

import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

console.log("Testing unified button implementation (Issue #42)...");

// 测试 1: 验证 styles.css 定义了统一的按钮 token
function testButtonTokens() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  // 应该定义 --btn-gradient-primary token
  assert.ok(
    stylesContent.includes("--btn-gradient-primary"),
    "styles.css 应定义 --btn-gradient-primary token"
  );

  // 应该使用 var(--accent) 和 var(--accent-strong)
  assert.ok(
    stylesContent.includes("linear-gradient(180deg, var(--accent), var(--accent-strong))"),
    "--btn-gradient-primary 应使用 CSS 变量"
  );

  console.log("  ✅ styles.css 定义了统一的按钮 token");
}

// 测试 2: 验证 landing.css 使用统一的渐变 token
function testLandingButtons() {
  const landingPath = join(projectRoot, "public/styles/landing.css");
  const landingContent = readFileSync(landingPath, "utf-8");

  // 应该使用 var(--btn-gradient-primary)
  assert.ok(
    landingContent.includes("background: var(--btn-gradient-primary)"),
    "landing.css 应使用 var(--btn-gradient-primary)"
  );

  // 不应该有硬编码的渐变（#0d9488 和 #0f766e）
  const hardcodedGradientPattern = /linear-gradient\([^)]*#0d9488[^)]*#0f766e[^)]*\)/;
  assert.ok(
    !hardcodedGradientPattern.test(landingContent),
    "landing.css 不应有硬编码的渐变"
  );

  // 应该使用 var(--radius-lg)
  assert.ok(
    landingContent.includes("border-radius: var(--radius-lg)"),
    "landing.css 应使用 var(--radius-lg)"
  );

  console.log("  ✅ landing.css 使用统一的按钮 token");
}

// 测试 3: 验证 preview.css 使用统一的渐变 token
function testPreviewButtons() {
  const previewPath = join(projectRoot, "public/styles/preview.css");
  const previewContent = readFileSync(previewPath, "utf-8");

  // 应该使用 var(--btn-gradient-primary)
  const gradientUsages = (previewContent.match(/var\(--btn-gradient-primary\)/g) || []).length;
  assert.ok(
    gradientUsages >= 2,
    `preview.css 应至少使用 2 次 var(--btn-gradient-primary)，实际 ${gradientUsages} 次`
  );

  // 不应该有硬编码的渐变
  const hardcodedGradientPattern = /linear-gradient\([^)]*#0d9488[^)]*#0f766e[^)]*\)/;
  assert.ok(
    !hardcodedGradientPattern.test(previewContent),
    "preview.css 不应有硬编码的渐变"
  );

  console.log("  ✅ preview.css 使用统一的按钮 token");
}

// 测试 4: 验证 styles.css 提供了按钮变体类
function testButtonVariants() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  // 应该有渐变变体
  assert.ok(
    stylesContent.includes(".primary-button.btn-gradient"),
    "styles.css 应提供 .btn-gradient 变体"
  );

  // 应该有大尺寸变体
  assert.ok(
    stylesContent.includes(".primary-button.btn-lg"),
    "styles.css 应提供 .btn-lg 变体"
  );

  // 应该有中等尺寸变体
  assert.ok(
    stylesContent.includes(".primary-button.btn-md"),
    "styles.css 应提供 .btn-md 变体"
  );

  console.log("  ✅ styles.css 提供了按钮变体类");
}

// 测试 5: 验证统一的 hover 行为
function testUnifiedHoverBehavior() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  // .btn-gradient 应该有统一的 hover 行为
  assert.ok(
    stylesContent.includes(".primary-button.btn-gradient:hover") &&
    stylesContent.includes("filter: brightness(1.05)") &&
    stylesContent.includes("transform: translateY(-2px)"),
    ".btn-gradient 应有统一的 hover 行为"
  );

  console.log("  ✅ 统一的 hover 行为定义正确");
}

// 测试 6: 验证品牌色使用 CSS 变量
function testBrandColorVariables() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  // 应该定义 --accent 和 --accent-strong
  assert.ok(
    stylesContent.includes("--accent: #0d9488"),
    "应定义 --accent 变量"
  );
  assert.ok(
    stylesContent.includes("--accent-strong: #0f766e"),
    "应定义 --accent-strong 变量"
  );

  // --btn-gradient-primary 应使用这些变量
  const gradientDef = stylesContent.match(/--btn-gradient-primary:\s*([^;]+)/);
  assert.ok(
    gradientDef && gradientDef[1].includes("var(--accent)") && gradientDef[1].includes("var(--accent-strong)"),
    "--btn-gradient-primary 应使用品牌色变量"
  );

  console.log("  ✅ 品牌色使用 CSS 变量");
}

// 运行测试
try {
  testButtonTokens();
  testLandingButtons();
  testPreviewButtons();
  testButtonVariants();
  testUnifiedHoverBehavior();
  testBrandColorVariables();

  console.log("\n✅ Unified button implementation test passed (Issue #42)");
  console.log("   - styles.css 定义统一的 --btn-gradient-primary token");
  console.log("   - landing.css 和 preview.css 使用统一的渐变 token");
  console.log("   - 品牌色集中管理（var(--accent) / var(--accent-strong)）");
  console.log("   - 提供按钮变体类（.btn-gradient / .btn-lg / .btn-md）");
  console.log("   - 统一的 hover 行为（brightness + translateY）");
  console.log("   - 改主色只需修改 1 处（--accent / --accent-strong）");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Unified button implementation test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
