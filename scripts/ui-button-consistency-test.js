#!/usr/bin/env node
/**
 * UI 主操作按钮一致性测试
 * 验证 Issue #42 修复：三套 CSS 中的主操作按钮样式统一
 *
 * 测试范围：
 * 1. 检查 styles.css 中统一的 .primary-button 定义
 * 2. 验证 landing.css 和 preview.css 已删除旧的独立类
 * 3. 检查 HTML 和 JS 中使用统一类名
 * 4. 验证渐变和圆角使用 CSS 变量
 */

import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const publicDir = join(projectRoot, "public");
const stylesMainPath = join(publicDir, "styles.css");
const stylesLandingPath = join(publicDir, "styles", "landing.css");
const stylesPreviewPath = join(publicDir, "styles", "preview.css");
const previewHtmlPath = join(publicDir, "preview.html");
const landingViewJsPath = join(publicDir, "landing-view.js");

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// 测试 1: styles.css 包含统一的按钮定义
test("styles.css 定义 .primary-button 基础类", () => {
  const content = fs.readFileSync(stylesMainPath, "utf-8");
  assert(content.includes(".primary-button,"), "应该定义 .primary-button 基础类");
  assert(content.includes(".primary-button {"), "应该有 .primary-button 独立样式");
});

test("styles.css 定义渐变变体 .btn-gradient", () => {
  const content = fs.readFileSync(stylesMainPath, "utf-8");
  assert(content.includes(".primary-button.btn-gradient"), "应该定义 .btn-gradient 修饰符");
  assert(content.includes("var(--btn-gradient-primary)"), "渐变应使用 CSS 变量");
});

test("styles.css 定义尺寸变体 .btn-lg 和 .btn-md", () => {
  const content = fs.readFileSync(stylesMainPath, "utf-8");
  assert(content.includes(".primary-button.btn-lg"), "应该定义 .btn-lg 大尺寸变体");
  assert(content.includes(".primary-button.btn-md"), "应该定义 .btn-md 中等尺寸变体");
});

test("styles.css 定义 --btn-gradient-primary 变量", () => {
  const content = fs.readFileSync(stylesMainPath, "utf-8");
  assert(content.includes("--btn-gradient-primary:"), "应该定义渐变变量");
  assert(content.includes("linear-gradient(180deg, var(--accent), var(--accent-strong))"),
    "渐变应使用品牌色变量");
});

// 测试 2: landing.css 不包含旧的独立类
test("landing.css 不包含 .landing-cta-primary 独立定义", () => {
  const content = fs.readFileSync(stylesLandingPath, "utf-8");
  const hasPrimaryClass = /\.landing-cta-primary\s*\{/.test(content);
  assert(!hasPrimaryClass, "不应该有 .landing-cta-primary 独立类定义");
});

test("landing.css 不包含硬编码渐变", () => {
  const content = fs.readFileSync(stylesLandingPath, "utf-8");
  // 检查是否有硬编码的 #0d9488 或 #0f766e 在按钮相关样式中
  const lines = content.split("\n");
  let inButtonStyle = false;
  for (const line of lines) {
    if (line.includes("landing-cta-primary")) {
      inButtonStyle = true;
    }
    if (inButtonStyle && (line.includes("#0d9488") || line.includes("#0f766e"))) {
      throw new Error("landing.css 不应在按钮样式中硬编码品牌色");
    }
    if (line.includes("}") && inButtonStyle) {
      inButtonStyle = false;
    }
  }
});

// 测试 3: preview.css 不包含旧的独立类
test("preview.css 不包含 .preview-tool-primary 定义", () => {
  const content = fs.readFileSync(stylesPreviewPath, "utf-8");
  const hasPrimaryClass = /\.preview-tool-button\.preview-tool-primary/.test(content);
  assert(!hasPrimaryClass, "不应该有 .preview-tool-primary 独立类定义");
});

test("preview.css 不包含 .preview-back-cta 定义", () => {
  const content = fs.readFileSync(stylesPreviewPath, "utf-8");
  const hasBackCta = /\.preview-back-cta/.test(content);
  assert(!hasBackCta, "不应该有 .preview-back-cta 独立类定义");
});

// 测试 4: HTML 使用统一类名
test("preview.html 使用统一的 .primary-button 类名", () => {
  const content = fs.readFileSync(previewHtmlPath, "utf-8");
  assert(content.includes('class="preview-tool-button primary-button btn-gradient"'),
    "下载按钮应使用统一类名");
  assert(content.includes('class="primary-button btn-gradient btn-md"'),
    "返回按钮应使用统一类名");
  assert(!content.includes("preview-tool-primary"),
    "不应使用旧的 preview-tool-primary 类名");
  assert(!content.includes("preview-back-cta"),
    "不应使用旧的 preview-back-cta 类名");
});

// 测试 5: JS 使用统一类名
test("landing-view.js 使用统一的 .primary-button 类名", () => {
  const content = fs.readFileSync(landingViewJsPath, "utf-8");
  assert(content.includes('class="primary-button btn-gradient btn-lg"'),
    "landing 按钮应使用统一类名");
  assert(!content.includes("landing-cta-primary"),
    "不应使用旧的 landing-cta-primary 类名");
});

// 测试 6: 样式一致性验证
test("所有主操作按钮使用相同的圆角系统", () => {
  const stylesMain = fs.readFileSync(stylesMainPath, "utf-8");

  // 检查基础圆角使用 var(--radius-sm)
  assert(stylesMain.includes("border-radius: var(--radius-sm)"),
    "基础按钮应使用 --radius-sm 变量");

  // 检查大尺寸圆角使用 var(--radius-lg)
  const btnLgMatch = stylesMain.match(/\.primary-button\.btn-lg[^}]+border-radius:\s*var\(--radius-lg\)/s);
  assert(btnLgMatch, ".btn-lg 应使用 --radius-lg 变量");
});

test("所有主操作按钮 hover 行为统一", () => {
  const stylesMain = fs.readFileSync(stylesMainPath, "utf-8");

  // 纯色变体使用背景色变化
  const primaryHoverMatch = stylesMain.match(/\.primary-button:hover:not\(:disabled\)[^}]+background:\s*var\(--accent-strong\)/s);
  assert(primaryHoverMatch, "纯色按钮 hover 应切换到 --accent-strong");

  // 渐变变体使用 brightness + translateY
  const gradientHoverMatch = stylesMain.match(/\.primary-button\.btn-gradient:hover:not\(:disabled\)[^}]+filter:\s*brightness\(1\.05\)/s);
  assert(gradientHoverMatch, "渐变按钮 hover 应使用 brightness(1.05)");

  const gradientTransformMatch = stylesMain.match(/\.primary-button\.btn-gradient:hover:not\(:disabled\)[^}]+transform:\s*translateY\(-2px\)/s);
  assert(gradientTransformMatch, "渐变按钮 hover 应使用 translateY(-2px)");
});

// 运行所有测试
console.log("🧪 运行 UI 按钮一致性测试...\n");

for (const { name, fn } of tests) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}\n`);
  }
}

console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败 (共 ${tests.length} 个测试)`);

if (failed > 0) {
  console.error("\n❌ 测试失败");
  process.exit(1);
} else {
  console.log("\n✅ 所有测试通过");
  process.exit(0);
}
