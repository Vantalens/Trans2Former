// ONNX Runtime vendor 资源同步包装器
// 统一入口：npm run vendor:onnx
// 实际同步逻辑委托给 sync-onnxruntime-vendor.js

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.join(__dirname, "sync-onnxruntime-vendor.js");

console.log("[vendor-onnx] 启动 ONNX Runtime vendor 资源同步...");
console.log("[vendor-onnx] 目标：public/vendor/onnxruntime/");
console.log();

const child = spawn("node", [syncScript], {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log();
    console.log("[vendor-onnx] ✅ ONNX Runtime vendor 同步完成");
    console.log("[vendor-onnx] PP-OCRv5 高级 OCR 运行时已就绪（如已安装 onnxruntime-web）");
  } else {
    console.warn();
    console.warn(`[vendor-onnx] ⚠️ 同步退出码：${code}`);
    console.warn("[vendor-onnx] 如果 onnxruntime-web 未安装（optionalDependency），这是预期行为");
  }
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error(`[vendor-onnx] ❌ 启动同步脚本失败：${error.message}`);
  process.exit(1);
});
