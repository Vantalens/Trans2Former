import { access, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

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

async function copyDistEntries(sourceDir, destDir) {
  if (!(await pathExists(sourceDir))) return [];
  const entries = await readdir(sourceDir);
  const copied = [];
  for (const entry of entries) {
    const fullSource = path.join(sourceDir, entry);
    const info = await stat(fullSource);
    if (!info.isFile()) continue;
    if (!/\.(js|mjs|wasm|map)$/.test(entry)) continue;
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
    if (!/\.(js|mjs|map)$/.test(entry)) continue;
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

  console.log(`Tesseract.js vendor synced to public/vendor/tesseract/ (worker=${workerCopied}, core=${coreBundleCopied}).`);
}

main().catch((error) => {
  console.warn(`[sync-tesseract-vendor] sync failed: ${error?.message || error}`);
  process.exitCode = 0;
});
