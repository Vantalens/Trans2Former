// 统一按钮实现测试（稿纸蓝图 · 朱砂实色体系）
// Issue #42 后续：渐变体系已移除，验证统一的实色印章按钮实现
// - styles.css 定义朱砂实色 .primary-button + .btn-stamp 变体
// - hover 统一 translateY(-1px) + --accent-strong
// - data-loading 45° 斜纹动画
// - landing.css / preview.css / preview.html / landing-view.js 全部使用新类串

import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

console.log("Testing unified button implementation (paper-blueprint stamp system)...");

// 测试 1: styles.css 定义朱砂实色主按钮，渐变 token 已删除
function testButtonTokens() {
  const stylesContent = readFileSync(join(projectRoot, "public/styles.css"), "utf-8");

  assert.ok(
    !stylesContent.includes("--btn-gradient-primary"),
    "styles.css 不应再定义 --btn-gradient-primary token"
  );

  assert.ok(
    stylesContent.includes("--accent: #c72c41"),
    "应定义朱砂 --accent: #c72c41"
  );
  assert.ok(
    stylesContent.includes("--accent-strong: #a82133"),
    "应定义深朱砂 --accent-strong: #a82133"
  );

  const primaryBlock = stylesContent.match(/\.primary-button\s*\{([^}]+)\}/);
  assert.ok(primaryBlock, "应有 .primary-button 独立规则块");
  assert.ok(
    primaryBlock[1].includes("background: var(--accent)"),
    ".primary-button 应为朱砂实色背景"
  );

  console.log("  ✅ styles.css 定义朱砂实色主按钮，渐变 token 已删除");
}

// 测试 2: 印章变体与尺寸变体
function testButtonVariants() {
  const stylesContent = readFileSync(join(projectRoot, "public/styles.css"), "utf-8");

  assert.ok(
    stylesContent.includes(".primary-button.btn-stamp"),
    "styles.css 应提供 .btn-stamp 印章实色变体"
  );
  assert.ok(
    !stylesContent.includes(".btn-gradient"),
    "styles.css 不应再有 .btn-gradient 变体"
  );

  const btnLg = stylesContent.match(/\.primary-button\.btn-lg\s*\{([^}]+)\}/);
  assert.ok(btnLg, "应定义 .btn-lg 大尺寸变体");
  assert.ok(btnLg[1].includes("padding: 14px 28px"), ".btn-lg 应使用 14px 28px padding");
  assert.ok(btnLg[1].includes("font-size: var(--text-base)"), ".btn-lg 应使用 --text-base 字号");

  const btnMd = stylesContent.match(/\.primary-button\.btn-md\s*\{([^}]+)\}/);
  assert.ok(btnMd, "应定义 .btn-md 中等尺寸变体");
  assert.ok(btnMd[1].includes("padding: 10px 20px"), ".btn-md 应使用 10px 20px padding");

  console.log("  ✅ .btn-stamp / .btn-lg / .btn-md 变体定义正确");
}

// 测试 3: 统一的 hover / active 行为（translateY(-1px) + 深朱砂）
function testUnifiedHoverBehavior() {
  const stylesContent = readFileSync(join(projectRoot, "public/styles.css"), "utf-8");

  const hover = stylesContent.match(/\.primary-button:hover:not\(:disabled\)\s*\{([^}]+)\}/);
  assert.ok(hover, "应有 .primary-button:hover 规则");
  assert.ok(
    hover[1].includes("background: var(--accent-strong)"),
    "hover 应切换到 --accent-strong"
  );
  assert.ok(
    hover[1].includes("transform: translateY(-1px)"),
    "hover 应上浮 translateY(-1px)"
  );

  const active = stylesContent.match(/\.primary-button:active:not\(:disabled\)\s*\{([^}]+)\}/);
  assert.ok(active && active[1].includes("translateY(0)"), "active 应回到 translateY(0)");

  console.log("  ✅ 统一的 hover/active 行为（accent-strong + translateY(-1px)）");
}

// 测试 4: data-loading 45° 斜纹加载动画
function testLoadingStripes() {
  const stylesContent = readFileSync(join(projectRoot, "public/styles.css"), "utf-8");

  const loading = stylesContent.match(/\.primary-button\[data-loading="true"\]\s*\{([^}]+)\}/);
  assert.ok(loading, "应有 .primary-button[data-loading=\"true\"] 规则");
  assert.ok(
    loading[1].includes("linear-gradient(45deg"),
    "加载态应使用 45° 斜纹"
  );
  assert.ok(
    loading[1].includes("background-size: 16px 16px"),
    "斜纹尺寸应为 16px 16px"
  );
  assert.ok(
    loading[1].includes("animation: btn-stripes"),
    "加载态应运行 btn-stripes 动画"
  );
  assert.ok(
    /@keyframes\s+btn-stripes/.test(stylesContent),
    "应定义 @keyframes btn-stripes"
  );

  console.log("  ✅ data-loading 斜纹加载动画定义正确");
}

// 测试 5: landing.css / preview.css 不再引用渐变 token
function testSubStylesheets() {
  const landingContent = readFileSync(join(projectRoot, "public/styles/landing.css"), "utf-8");
  const previewContent = readFileSync(join(projectRoot, "public/styles/preview.css"), "utf-8");

  for (const [name, content] of [["landing.css", landingContent], ["preview.css", previewContent]]) {
    assert.ok(!content.includes("--btn-gradient-primary"), `${name} 不应引用渐变 token`);
    assert.ok(!content.includes("btn-gradient"), `${name} 不应引用 .btn-gradient`);
    const hardcodedGradient = /linear-gradient\([^)]*#0d9488[^)]*#0f766e[^)]*\)/;
    assert.ok(!hardcodedGradient.test(content), `${name} 不应有硬编码的旧品牌渐变`);
  }

  assert.ok(
    landingContent.includes("var(--accent)"),
    "landing.css 应使用朱砂 var(--accent)"
  );
  assert.ok(
    previewContent.includes(".preview-tool-button:not(.primary-button)"),
    "preview.css 工具按钮应为 ghost 风格（不覆盖主按钮实色）"
  );

  console.log("  ✅ landing.css / preview.css 已切换到实色体系");
}

// 测试 6: HTML / JS 使用统一的 btn-stamp 类串
function testCallSites() {
  const previewHtml = readFileSync(join(projectRoot, "public/preview.html"), "utf-8");
  const landingJs = readFileSync(join(projectRoot, "public/landing-view.js"), "utf-8");

  assert.ok(
    previewHtml.includes('class="preview-tool-button primary-button btn-stamp"'),
    "preview.html 下载按钮应使用 btn-stamp"
  );
  assert.ok(
    previewHtml.includes('class="primary-button btn-stamp btn-md"'),
    "preview.html 返回按钮应使用 btn-stamp btn-md"
  );
  assert.ok(!previewHtml.includes("btn-gradient"), "preview.html 不应残留 btn-gradient");

  const stampUsages = (landingJs.match(/class="primary-button btn-stamp btn-lg"/g) || []).length;
  assert.ok(stampUsages === 2, `landing-view.js 应有 2 处 btn-stamp btn-lg，实际 ${stampUsages} 处`);
  assert.ok(!landingJs.includes("btn-gradient"), "landing-view.js 不应残留 btn-gradient");

  console.log("  ✅ preview.html / landing-view.js 使用统一的 btn-stamp 类串");
}

// 运行测试
try {
  testButtonTokens();
  testButtonVariants();
  testUnifiedHoverBehavior();
  testLoadingStripes();
  testSubStylesheets();
  testCallSites();

  console.log("\n✅ Unified button implementation test passed (paper-blueprint)");
  console.log("   - styles.css 定义朱砂实色 .primary-button + .btn-stamp 变体");
  console.log("   - 渐变体系（--btn-gradient-primary / .btn-gradient）已移除");
  console.log("   - 统一 hover：--accent-strong + translateY(-1px)");
  console.log("   - data-loading 45° 斜纹动画（btn-stripes）");
  console.log("   - preview.html / landing-view.js 全部使用 btn-stamp 类串");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Unified button implementation test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
