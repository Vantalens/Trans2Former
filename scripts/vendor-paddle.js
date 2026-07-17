// PaddleOCR 模型资源同步包装器
// 统一入口：npm run vendor:paddle
// 实际同步逻辑委托给 sync-paddleocr-vendor.js

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.join(__dirname, "sync-paddleocr-vendor.js");

console.log("[vendor-paddle] 启动 PaddleOCR 模型资源同步...");
console.log("[vendor-paddle] 目标：public/vendor/paddleocr/");
console.log("[vendor-paddle] 包含：PP-OCRv5 det/rec 模型 + 字典");
console.log();

const child = spawn("node", [syncScript], {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log();
    console.log("[vendor-paddle] ✅ PaddleOCR 模型同步完成");
    console.log("[vendor-paddle] PP-OCRv5 高级 OCR 已就绪（det + rec 模型 + 字典）");
    console.log("[vendor-paddle] 注：cls 方向分类模型为可选，不随包分发");
  } else {
    console.error();
    console.error(`[vendor-paddle] ❌ 同步失败，退出码：${code}`);
    console.error("[vendor-paddle] 可能原因：网络连接失败、SHA-256 校验不通过、磁盘空间不足");
    console.error("[vendor-paddle] 请检查网络连接后重试，或参考 docs/OCR_SETUP.md 手动导入模型");
  }
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error(`[vendor-paddle] ❌ 启动同步脚本失败：${error.message}`);
  process.exit(1);
});
