import { access, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

// 模仿 sync-tesseract-vendor：把 onnxruntime-web 的运行时资源（ort*.mjs + *.wasm）同步到
// public/vendor/onnxruntime/，供 PP-OCRv5 高级 OCR 在浏览器/Tauri 端同源加载。
// onnxruntime-web 是 optionalDependency；缺失时 exit 0，不阻塞 release:prepare / 安装。

const ROOT = process.cwd();
const ORT_DIST = path.join(ROOT, "node_modules", "onnxruntime-web", "dist");
const TARGET_DIR = path.join(ROOT, "public", "vendor", "onnxruntime");

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await pathExists(ORT_DIST))) {
    console.warn("[sync-onnxruntime-vendor] onnxruntime-web is not installed (optionalDependency missing). Skipping vendor sync.");
    console.warn("[sync-onnxruntime-vendor] Run `npm install onnxruntime-web` to enable the PP-OCRv5 advanced OCR runtime.");
    return;
  }

  await mkdir(TARGET_DIR, { recursive: true });

  const entries = await readdir(ORT_DIST);
  let copied = 0;
  for (const entry of entries) {
    if (entry.endsWith(".d.ts")) continue;
    // 运行时只需要 mjs 入口 + wasm 二进制（含 SIMD/threaded 变体）；跳过 cjs/min.js 以外噪声。
    if (!/\.(mjs|wasm)$/.test(entry) && !/^ort.*\.min\.js$/.test(entry)) continue;
    const source = path.join(ORT_DIST, entry);
    const info = await stat(source);
    if (!info.isFile()) continue;
    await copyFile(source, path.join(TARGET_DIR, entry));
    copied += 1;
  }

  if (copied === 0) {
    console.warn("[sync-onnxruntime-vendor] No onnxruntime-web runtime assets found in dist/. PP-OCRv5 will stay unavailable until installed.");
    return;
  }

  console.log(`onnxruntime-web vendor synced to public/vendor/onnxruntime/ (${copied} files).`);
}

main().catch((error) => {
  console.warn(`[sync-onnxruntime-vendor] sync failed: ${error?.message || error}`);
  process.exitCode = 0;
});
