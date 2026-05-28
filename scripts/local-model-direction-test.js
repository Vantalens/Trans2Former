import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  tasks: await readFile("DEVELOPMENT_TASKS.md", "utf8"),
  desktop: await readFile("docs/DESKTOP_APP_ARCHITECTURE.md", "utf8"),
  release: await readFile("docs/DESKTOP_RELEASE_PLAN.md", "utf8"),
  budget: await readFile("docs/RESOURCE_BUDGET.md", "utf8"),
  strategy: await readFile("docs/PRODUCT_STRATEGY.md", "utf8"),
  multiModel: await readFile("docs/MULTI_MODEL_ARCHITECTURE.md", "utf8"),
};

function assertIncludes(fileKey, expected) {
  assert.equal(
    files[fileKey].includes(expected),
    true,
    `${fileKey} should mention: ${expected}`
  );
}

function assertExcludes(fileKey, forbidden) {
  assert.equal(
    files[fileKey].includes(forbidden),
    false,
    `${fileKey} should no longer mention stale wording: ${forbidden}`
  );
}

assertIncludes("tasks", "不依赖 Office、LibreOffice、Pandoc、云端转换或云端 OCR/AI");
assertIncludes("tasks", "内置本地专用模型");
assertIncludes("tasks", "Repair Engine");
assertExcludes("tasks", "不依赖 Office、LibreOffice、Pandoc、云端转换或 OCR/AI");

assertIncludes("desktop", "安装包内置、按需加载、可禁用");
assertIncludes("desktop", "Repair Engine");
assertExcludes("desktop", "手动安装、手动启用");

assertIncludes("release", "内置模型 manifest");
assertIncludes("release", "模型资源随正式安装包交付");
assertIncludes("release", "离线修复 smoke");
assertExcludes("release", "本地模型资源必须手动安装");

assertIncludes("budget", "轻量核心预算");
assertIncludes("budget", "模型增强桌面包预算");
assertIncludes("budget", "模型资源随安装包交付");

assertIncludes("strategy", "软件自动修复");
assertIncludes("strategy", "文档图像、文字、版面和表格专用本地模型");

assertIncludes("multiModel", "Repair Engine");
assertIncludes("multiModel", "核心本地内置模型");
assertExcludes("multiModel", "external engine 一律插件化");

console.log("Local model direction test passed: active docs match bundled local-model auto-repair direction.");
