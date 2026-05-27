import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// 任务清单已分为活跃看板（DEVELOPMENT_TASKS.md）和历史归档
// （docs/archive/DEVELOPMENT_HISTORY.md），P7 详细状态行和子任务保留在归档中。
const tasksMain = await readFile("DEVELOPMENT_TASKS.md", "utf8");
const tasksArchive = await readFile("docs/archive/DEVELOPMENT_HISTORY.md", "utf8");
const tasks = `${tasksMain}\n${tasksArchive}`;
const releasePlan = await readFile("docs/DESKTOP_RELEASE_PLAN.md", "utf8");
const releasePrep = await readFile("docs/RELEASE_PREP.md", "utf8");
const prepareRelease = await readFile("scripts/prepare-release.js", "utf8");
const tauriConfig = await readFile("src-tauri/tauri.conf.json", "utf8");
const docsIndex = await readFile("docs/README.md", "utf8");

for (const expected of [
  "Trans2Former_<version>_x64_en-US.msi",
  "Trans2Former_<version>_x64-setup.exe",
  "checksums.sha256",
  "Windows WebView2",
  "macOS WKWebView",
  "Linux WebKitGTK",
  "文件关联",
  "自动更新",
]) {
  assert.equal(releasePlan.includes(expected), true, `desktop release plan should mention ${expected}`);
}

for (const expected of ["DESKTOP_RELEASE_PLAN.md", "release asset", "OFD", "core local capabilities"]) {
  assert.equal(releasePrep.includes(expected), true, `release prep should mention ${expected}`);
}

assert.equal(prepareRelease.includes("pluginPatchAssets"), false, "release manifest should not include plugin patch assets");
assert.equal(prepareRelease.includes("plugin-patches"), false, "release prepare should not copy plugin patch packages");
assert.equal(tauriConfig.includes('"targets": "all"'), true, "Tauri bundle should keep all platform targets declared");
assert.equal(tauriConfig.includes('"icon": ["icons/icon.ico"]'), true, "Tauri bundle should declare a Windows installer icon");
assert.equal(tauriConfig.includes("connect-src 'self'"), true, "desktop CSP should keep network scope local-only by default");
assert.equal(docsIndex.includes("DESKTOP_RELEASE_PLAN.md"), true, "docs index should expose P7 release plan");
assert.equal(tasks.includes("状态：核心完成，发布卫生和平台安装包仍在收尾。"), true, "P7 task status should reflect release productization completion");
assert.equal(tasks.includes("平台安装包真实产出、签名/公证和跨平台 smoke 仍需"), true, "P7 task list should keep platform installer work explicit");

console.log("P7 release productization test passed: desktop release and core capability docs gates are covered.");
