#!/usr/bin/env node
// 修复 issue #33: 为桌面构建创建过滤后的 dist，排除开发自检页

import { cp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(ROOT, "public");
const distDir = path.join(ROOT, "desktop-dist");

// 排除开发自检页和空目录
const EXCLUDE_FILES = new Set([
  "smoke-test.html",
  "smoke-test.js",
  "plugin-patches",
]);

async function prepareDesktopDist() {
  console.log("准备桌面构建产物目录...");

  // 清理并重建 desktop-dist
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  // 拷贝 public 目录，排除测试文件
  await cp(publicDir, distDir, {
    recursive: true,
    filter: (source) => !EXCLUDE_FILES.has(path.basename(source)),
  });

  console.log(`✅ 桌面构建产物已准备完成: ${distDir}`);
  console.log(`   排除文件: ${Array.from(EXCLUDE_FILES).join(", ")}`);
}

prepareDesktopDist().catch((error) => {
  console.error("准备桌面构建产物失败:", error);
  process.exit(1);
});
