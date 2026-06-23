// Tessdata SHA-256 文档一致性测试
// Issue #129: 验证文档和 UI 文案正确说明 tessdata 不进行严格哈希验证

import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

console.log("Testing tessdata SHA-256 documentation consistency (Issue #129)...");

// 测试 1: 验证文档正确说明 SHA-256 验证范围
function testDocumentation() {
  const docPath = join(projectRoot, "docs/architecture/MULTI_MODEL_ARCHITECTURE.md");
  const docContent = readFileSync(docPath, "utf-8");

  // 应该明确说明 PP-OCRv5 需要严格验证
  assert.ok(
    docContent.includes("PP-OCRv5 模型导入后必须经过钉定 SHA-256 校验"),
    "文档应明确说明 PP-OCRv5 需要钉定 SHA-256 校验"
  );

  // 应该明确说明 tesseract 不进行严格验证
  assert.ok(
    docContent.includes("Tesseract tessdata 计算 SHA-256 并记录但不与钉定值比对"),
    "文档应明确说明 tesseract 不与钉定值比对"
  );

  // tesseract 导入流程应该说明只记录不比对
  assert.ok(
    docContent.includes("sha256Hex`（计算并记录，不比对钉定值）"),
    "tesseract 导入流程应说明只记录不比对"
  );

  console.log("  ✅ 文档正确说明 SHA-256 验证范围");
}

// 测试 2: 验证 tesseract manifest 不使用占位 digest
function testTesseractManifest() {
  const bootstrapPath = join(projectRoot, "public/core/ocr/tesseract-bootstrap.js");
  const bootstrapContent = readFileSync(bootstrapPath, "utf-8");

  // 不应该有 "f".repeat(64) 占位值
  assert.ok(
    !bootstrapContent.includes('"f".repeat(64)'),
    "tesseract manifest 不应使用占位 digest"
  );

  // 应该标注为 user-provided
  assert.ok(
    bootstrapContent.includes('digest: "user-provided"'),
    "tesseract manifest digest 应标注为 user-provided"
  );

  // 应该有说明注释
  assert.ok(
    bootstrapContent.includes("由用户自行提供") && bootstrapContent.includes("不与钉定值比对"),
    "tesseract manifest 应有说明注释"
  );

  console.log("  ✅ Tesseract manifest 正确标注为用户提供");
}

// 测试 3: 验证 UI 文案说明哈希记录但不验证
function testUIMessages() {
  const securityCenterPath = join(projectRoot, "public/security-center.js");
  const securityContent = readFileSync(securityCenterPath, "utf-8");

  // 导入成功消息应说明 SHA-256 已记录但未比对
  assert.ok(
    securityContent.includes("SHA-256 已记录但未与官方值比对"),
    "UI 应说明 SHA-256 已记录但未比对"
  );

  // 应提示用户确保来源可信
  assert.ok(
    securityContent.includes("请确保文件来源可信"),
    "UI 应提示用户确保文件来源可信"
  );

  console.log("  ✅ UI 文案正确说明哈希记录但不验证");
}

// 测试 4: 验证 enableHint 说明验证范围
function testEnableHint() {
  const bootstrapPath = join(projectRoot, "public/core/ocr/tesseract-bootstrap.js");
  const bootstrapContent = readFileSync(bootstrapPath, "utf-8");

  // enableHint 应说明 SHA-256 不进行严格验证
  assert.ok(
    bootstrapContent.includes("SHA-256 哈希值会被计算并记录，但不进行严格验证"),
    "enableHint 应说明不进行严格验证"
  );

  // 应提示用户自行确保来源可信
  assert.ok(
    bootstrapContent.includes("用户自行确保文件来源可信"),
    "enableHint 应提示用户自行确保来源"
  );

  console.log("  ✅ enableHint 正确说明验证范围");
}

// 测试 5: 验证 PP-OCRv5 文档说明严格验证
function testPaddleOcrDocumentation() {
  const docPath = join(projectRoot, "docs/architecture/MULTI_MODEL_ARCHITECTURE.md");
  const docContent = readFileSync(docPath, "utf-8");

  // PP-OCRv5 应该说明与钉定值比对
  assert.ok(
    docContent.includes("与钉定值比对，不匹配拒绝激活"),
    "PP-OCRv5 文档应说明与钉定值比对"
  );

  // 应该说明三件齐全且哈希全部通过
  assert.ok(
    docContent.includes("三件齐全且哈希全部通过"),
    "PP-OCRv5 文档应说明哈希验证要求"
  );

  console.log("  ✅ PP-OCRv5 文档正确说明严格验证");
}

// 运行测试
try {
  testDocumentation();
  testTesseractManifest();
  testUIMessages();
  testEnableHint();
  testPaddleOcrDocumentation();

  console.log("\n✅ Tessdata SHA-256 documentation consistency test passed (Issue #129)");
  console.log("   - 文档明确区分了 PP-OCRv5（严格验证）和 Tesseract（仅记录）");
  console.log("   - Tesseract manifest 不再使用占位 digest，标注为 user-provided");
  console.log("   - UI 文案正确说明 SHA-256 已记录但未比对");
  console.log("   - enableHint 提示用户自行确保文件来源可信");
  console.log("   - PP-OCRv5 文档说明钉定值比对和拒绝激活机制");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Tessdata SHA-256 documentation test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
