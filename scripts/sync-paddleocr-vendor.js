import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 把 PP-OCRv5 mobile 模型（det/rec + 字典）从钉定 commit 的 ppu-paddle-ocr-models 仓库下载到
// public/vendor/paddleocr/，供高级 OCR 启动自动载入、开箱即用。逐文件 SHA-256 校验
// scripts/paddleocr-models.manifest.json（入库，可复现）。
//
// 设计与 sync-onnxruntime-vendor 一致的「非阻塞」原则：
//   - 已存在且校验通过 → 跳过（幂等）。
//   - 网络/HTTP 失败（离线、源不可达）→ 警告 + exit 0，不阻断 npm install / release:prepare。
//   - 下到字节但 size/SHA-256 不符 → 删除半成品 + 非零退出（完整性问题必须报警，不可静默放行）。
//
// 注意：本脚本在构建期联网；App 运行期仍零联网（模型已落到同源 vendor）。
// 方向分类 cls.onnx 为可选，不随包；如需 180° 校正可在安全中心手动导入。

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const MANIFEST_PATH = path.join(__dirname, "paddleocr-models.manifest.json");
const TARGET_DIR = path.join(ROOT, "public", "vendor", "paddleocr");

function remoteUrl(source, file) {
  const { repo, commit } = source;
  if (file.kind === "lfs") {
    return `https://media.githubusercontent.com/media/${repo}/${commit}/${file.remotePath}`;
  }
  return `https://raw.githubusercontent.com/${repo}/${commit}/${file.remotePath}`;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fileMatches(destPath, file) {
  try {
    const info = await stat(destPath);
    if (!info.isFile() || info.size !== file.size) return false;
    const buffer = await readFile(destPath);
    return sha256(buffer) === file.sha256;
  } catch {
    return false;
  }
}

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    console.warn(`[sync-paddleocr-vendor] manifest 读取失败：${error?.message || error}；跳过。`);
    return;
  }

  await mkdir(TARGET_DIR, { recursive: true });

  let synced = 0;
  let skipped = 0;
  const failures = []; // issue #50: 收集失败文件，循环结束后统一判定
  for (const file of manifest.files || []) {
    const destPath = path.join(TARGET_DIR, file.target);

    if (await fileMatches(destPath, file)) {
      skipped += 1;
      continue;
    }

    const url = remoteUrl(manifest.source, file);
    let buffer;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      // issue #50: 网络/HTTP 失败 fail-closed——记录失败文件但继续尝试后续文件，
      // 循环结束后若有任一失败则非零退出（阻止 release:prepare 链打包残缺 vendor）。
      console.warn(`[sync-paddleocr-vendor] 下载 ${file.target} 失败（${error?.message || error}）。`);
      console.warn(`[sync-paddleocr-vendor] 源：${url}`);
      failures.push(file.target);
      continue;
    }

    // 下到字节后做完整性校验：不符则删半成品 + 非零退出（不可静默放行）。
    const actualSize = buffer.length;
    const actualSha = sha256(buffer);
    if (actualSize !== file.size || actualSha !== file.sha256) {
      await rm(destPath, { force: true });
      console.error(`[sync-paddleocr-vendor] ${file.target} 完整性校验失败：`);
      console.error(`  期望 size=${file.size} sha256=${file.sha256}`);
      console.error(`  实际 size=${actualSize} sha256=${actualSha}`);
      console.error("  源文件可能已变更/损坏；请核对 manifest 与钉定 commit。");
      process.exit(1);
    }

    await writeFile(destPath, buffer);
    synced += 1;
    console.log(`[sync-paddleocr-vendor] ${file.target} 同步并校验通过 (${(actualSize / (1024 * 1024)).toFixed(2)} MB).`);
  }

  console.log(
    `PP-OCRv5 vendor synced to public/vendor/paddleocr/ (downloaded=${synced}, cached=${skipped}; cls optional, not bundled).`,
  );

  // issue #50: 循环结束后检查 failures，任一失败则非零退出
  if (failures.length > 0) {
    console.error(`[sync-paddleocr-vendor] ${failures.length} 个文件同步失败：${failures.join(", ")}`);
    console.error("[sync-paddleocr-vendor] 离线或源不可达时，请在联网环境下运行 npm run vendor:paddle 或手动导入模型。");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[sync-paddleocr-vendor] 同步异常：${error?.message || error}`);
  process.exit(1);
});
