import { access, copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// 本项目 local-only 安全门禁（scripts/local-security-test.js）禁止 public/vendor/ 下任何
// vendor .js 出现远程协议字符串。tesseract.js bundle 里只内置了 CDN 默认路径
// （https://cdn.jsdelivr.net/...），而运行时（tesseract-runtime.js）恒以同源 /vendor/ 路径
// 覆盖 corePath/workerPath/langPath —— 这些 CDN 默认值是死代码。复制后把它们改写成同源相对
// 路径并去掉 sourceMappingURL 注释，让 served asset 真正 local-only。
const REMOTE_PROTOCOL_RE = /(https?:|wss?:)\/\//;

const ROOT = process.cwd();
const TESSERACT_DIST = path.join(ROOT, "node_modules", "tesseract.js", "dist");
const TESSERACT_CORE = path.join(ROOT, "node_modules", "tesseract.js-core");
const TARGET_DIR = path.join(ROOT, "public", "vendor", "tesseract");
const TARGET_CORE_DIR = path.join(TARGET_DIR, "core");
const TARGET_WORKER_DIR = path.join(TARGET_DIR, "worker");

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyIfPresent(source, destination) {
  if (!(await pathExists(source))) return false;
  await copyFile(source, destination);
  return true;
}

// 复制后清洗：把 vendor bundle 里的 CDN 默认路径改写成同源 /vendor 路径，并去掉
// sourceMappingURL 注释（对应 .map 不再随包）。清洗后逐文件断言无残留远程协议，
// 让未来 tesseract 版本若引入新远程 host 时本脚本先行报警而非静默漏过门禁。
async function sanitizeVendorBundles(dir) {
  if (!(await pathExists(dir))) return;
  const entries = await readdir(dir);
  const violations = []; // issue #29: 收集违规文件，避免先写入后检查的竞态
  for (const entry of entries) {
    if (!/\.(js|mjs)$/.test(entry)) continue;
    const filePath = path.join(dir, entry);
    const info = await stat(filePath);
    if (!info.isFile()) continue;
    const original = await readFile(filePath, "utf8");
    const cleaned = original
      .replaceAll("https://cdn.jsdelivr.net", "/vendor")
      .replace(/\n?\/\/[#@]\s*sourceMappingURL=.*$/gm, "");

    // issue #29: 先检查清洗后内容，再决定是否写入
    const leftover = cleaned.match(REMOTE_PROTOCOL_RE);
    if (leftover) {
      violations.push({ file: path.relative(ROOT, filePath).replaceAll("\\", "/"), sample: leftover[0] });
      continue; // 不写入违规内容
    }

    if (cleaned !== original) await writeFile(filePath, cleaned, "utf8");
  }

  // 循环结束后统一报告违规
  if (violations.length > 0) {
    console.error(`[sync-tesseract-vendor] ${violations.length} 个文件清洗后仍含远程协议串：`);
    for (const v of violations) {
      console.error(`  - ${v.file}: ${v.sample}...`);
    }
    throw new Error("清洗门禁失败；请扩展 sanitizeVendorBundles 的改写规则后再发布。");
  }
}

async function copyDistEntries(sourceDir, destDir) {
  if (!(await pathExists(sourceDir))) return [];
  const entries = await readdir(sourceDir);
  const copied = [];
  for (const entry of entries) {
    const fullSource = path.join(sourceDir, entry);
    const info = await stat(fullSource);
    if (!info.isFile()) continue;
    if (!/\.(js|mjs|wasm)$/.test(entry)) continue;
    if (entry.endsWith(".d.ts")) continue;
    await copyFile(fullSource, path.join(destDir, entry));
    copied.push(entry);
  }
  return copied;
}

async function main() {
  if (!(await pathExists(TESSERACT_DIST))) {
    console.warn("[sync-tesseract-vendor] tesseract.js is not installed (optionalDependency missing). Skipping vendor sync.");
    console.warn("[sync-tesseract-vendor] Run `npm install tesseract.js@^5` to enable the OCR runtime.");
    return;
  }

  await mkdir(TARGET_CORE_DIR, { recursive: true });
  await mkdir(TARGET_WORKER_DIR, { recursive: true });

  const distEntries = await readdir(TESSERACT_DIST);
  let mainCopied = false;
  let workerCopied = false;
  for (const entry of distEntries) {
    if (!/\.(js|mjs)$/.test(entry)) continue;
    if (entry.endsWith(".d.ts")) continue;
    const source = path.join(TESSERACT_DIST, entry);
    if (entry.startsWith("worker")) {
      await copyFile(source, path.join(TARGET_WORKER_DIR, entry));
      workerCopied = true;
    } else {
      await copyFile(source, path.join(TARGET_CORE_DIR, entry));
      mainCopied = true;
    }
  }

  if (!mainCopied) {
    console.warn("[sync-tesseract-vendor] Could not locate tesseract.js main bundle in dist/. Skipping.");
    return;
  }

  const coreFiles = await copyDistEntries(TESSERACT_CORE, TARGET_CORE_DIR);
  let coreBundleCopied = coreFiles.length > 0;
  if (!coreBundleCopied) {
    const nestedDist = path.join(TESSERACT_CORE, "dist");
    if (await pathExists(nestedDist)) {
      const nested = await copyDistEntries(nestedDist, TARGET_CORE_DIR);
      if (nested.length > 0) coreBundleCopied = true;
    }
  }

  if (!coreBundleCopied) {
    console.warn("[sync-tesseract-vendor] tesseract.js-core not found; wasm runtime missing. OCR will stay unavailable until installed.");
  }

  await sanitizeVendorBundles(TARGET_CORE_DIR);
  await sanitizeVendorBundles(TARGET_WORKER_DIR);

  console.log(`Tesseract.js vendor synced to public/vendor/tesseract/ (worker=${workerCopied}, core=${coreBundleCopied}); remote URLs sanitized.`);
}

main().catch((error) => {
  console.error(`[sync-tesseract-vendor] 同步异常：${error?.message || error}`);
  process.exit(1);
});
