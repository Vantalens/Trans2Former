// Design Token 体系测试
// Issue #38: 验证完整的 Design Token 体系（颜色角色化、间距刻度、字号梯度、动效时长）

import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

console.log("Testing Design Token system (Issue #38)...");

// 测试 1: 验证角色色（success/warning/danger）定义
function testSemanticColors() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  // 成功色
  assert.ok(stylesContent.includes("--color-success:"), "应定义 --color-success");
  assert.ok(stylesContent.includes("--color-success-soft:"), "应定义 --color-success-soft");
  assert.ok(stylesContent.includes("--color-success-strong:"), "应定义 --color-success-strong");

  // 警告色
  assert.ok(stylesContent.includes("--color-warning:"), "应定义 --color-warning");
  assert.ok(stylesContent.includes("--color-warning-soft:"), "应定义 --color-warning-soft");
  assert.ok(stylesContent.includes("--color-warning-strong:"), "应定义 --color-warning-strong");

  // 危险色（已有基础，验证扩展）
  assert.ok(stylesContent.includes("--danger:"), "应定义 --danger");
  assert.ok(stylesContent.includes("--danger-soft:"), "应定义 --danger-soft");
  assert.ok(stylesContent.includes("--danger-strong:"), "应定义 --danger-strong");

  console.log("  ✅ 角色色（success/warning/danger）完整定义");
}

// 测试 2: 验证间距刻度（4px 基数）
function testSpacingScale() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  const expectedSpaces = [
    { token: "--space-1", value: "0.25rem", px: "4px" },
    { token: "--space-2", value: "0.5rem", px: "8px" },
    { token: "--space-3", value: "0.75rem", px: "12px" },
    { token: "--space-4", value: "1rem", px: "16px" },
    { token: "--space-5", value: "1.25rem", px: "20px" },
    { token: "--space-6", value: "1.5rem", px: "24px" },
    { token: "--space-7", value: "1.75rem", px: "28px" },
    { token: "--space-8", value: "2rem", px: "32px" },
  ];

  expectedSpaces.forEach(({ token, value, px }) => {
    assert.ok(
      stylesContent.includes(`${token}: ${value}`),
      `应定义 ${token}: ${value} (${px})`
    );
  });

  console.log("  ✅ 间距刻度（4px 基数，--space-1 到 --space-8）");
}

// 测试 3: 验证字号梯度（统一 rem）
function testFontSizeScale() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  const expectedSizes = [
    { token: "--text-xs", value: "0.75rem", px: "12px" },
    { token: "--text-sm", value: "0.875rem", px: "14px" },
    { token: "--text-base", value: "1rem", px: "16px" },
    { token: "--text-lg", value: "1.125rem", px: "18px" },
    { token: "--text-xl", value: "1.25rem", px: "20px" },
    { token: "--text-2xl", value: "1.5rem", px: "24px" },
    { token: "--text-3xl", value: "1.875rem", px: "30px" },
  ];

  expectedSizes.forEach(({ token, value, px }) => {
    assert.ok(
      stylesContent.includes(`${token}: ${value}`),
      `应定义 ${token}: ${value} (${px})`
    );
  });

  console.log("  ✅ 字号梯度（统一 rem，--text-xs 到 --text-3xl）");
}

// 测试 4: 验证动效时长 token
function testDurationTokens() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  assert.ok(stylesContent.includes("--duration-fast:"), "应定义 --duration-fast");
  assert.ok(stylesContent.includes("--duration-base:"), "应定义 --duration-base");
  assert.ok(stylesContent.includes("--duration-slow:"), "应定义 --duration-slow");

  // 验证具体值
  assert.ok(stylesContent.includes("--duration-fast: 0.15s"), "fast 应为 0.15s");
  assert.ok(stylesContent.includes("--duration-base: 0.2s"), "base 应为 0.2s");
  assert.ok(stylesContent.includes("--duration-slow: 0.3s"), "slow 应为 0.3s");

  console.log("  ✅ 动效时长 token（--duration-fast/base/slow）");
}

// 测试 5: 验证圆角扩展
function testRadiusTokens() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  assert.ok(stylesContent.includes("--radius:"), "应定义 --radius");
  assert.ok(stylesContent.includes("--radius-sm:"), "应定义 --radius-sm");
  assert.ok(stylesContent.includes("--radius-lg:"), "应定义 --radius-lg");
  assert.ok(stylesContent.includes("--radius-xl:"), "应定义 --radius-xl");
  assert.ok(stylesContent.includes("--radius-full:"), "应定义 --radius-full");

  console.log("  ✅ 圆角 token 扩展（--radius-xl / --radius-full）");
}

// 测试 6: 验证 token 总数增加
function testTokenCount() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  // 统计自定义属性数量
  const customProps = stylesContent.match(/--[\w-]+:/g) || [];
  const uniqueProps = new Set(customProps.map(p => p.replace(":", "")));

  // 应该有大量 token（原来约 22 个，现在应该 50+ 个）
  assert.ok(
    uniqueProps.size >= 50,
    `Token 数量应 ≥ 50，实际 ${uniqueProps.size} 个`
  );

  console.log(`  ✅ Token 总数：${uniqueProps.size} 个（从原来 ~22 个扩展）`);
}

// 测试 7: 验证 token 分类组织
function testTokenOrganization() {
  const stylesPath = join(projectRoot, "public/styles.css");
  const stylesContent = readFileSync(stylesPath, "utf-8");

  // 应该有注释分类
  assert.ok(stylesContent.includes("/* 基础色板 */"), "应有基础色板分类");
  assert.ok(stylesContent.includes("/* 品牌色 */"), "应有品牌色分类");
  assert.ok(stylesContent.includes("/* 角色色（语义） */"), "应有角色色分类");
  assert.ok(stylesContent.includes("/* 间距刻度（4px 基数） */"), "应有间距刻度分类");
  assert.ok(stylesContent.includes("/* 字号梯度（rem 统一） */"), "应有字号梯度分类");
  assert.ok(stylesContent.includes("/* 动效时长 */"), "应有动效时长分类");

  console.log("  ✅ Token 按分类组织（基础色板/品牌色/角色色/间距/字号/动效）");
}

// 运行测试
try {
  testSemanticColors();
  testSpacingScale();
  testFontSizeScale();
  testDurationTokens();
  testRadiusTokens();
  testTokenCount();
  testTokenOrganization();

  console.log("\n✅ Design Token system test passed (Issue #38)");
  console.log("   - 角色色完整（success/warning/danger 各带 soft/strong 变体）");
  console.log("   - 间距刻度（4px 基数，--space-1 到 --space-8）");
  console.log("   - 字号梯度（统一 rem，--text-xs 到 --text-3xl）");
  console.log("   - 动效时长 token（--duration-fast/base/slow）");
  console.log("   - 圆角扩展（--radius-xl / --radius-full）");
  console.log("   - Token 总数从 ~22 个扩展到 50+ 个");
  console.log("   - Token 按分类清晰组织");
  console.log("\n下一步建议：");
  console.log("   - 在 styles.css/landing.css/preview.css 中替换硬编码颜色为 token");
  console.log("   - 统一使用 rem 字号（替换 px）");
  console.log("   - 使用 --duration-* 替换硬编码动效时长");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Design Token system test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
