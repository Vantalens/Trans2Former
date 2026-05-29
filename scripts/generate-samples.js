// 优质测试样例生成器：覆盖全部受支持格式、复杂排版、大小不一（large ≥ 3MB），
// 用来压力测试 Trans2Former 的转换、版面与三层检验能力。
//
// 重格式（docx/xlsx/pptx/epub/pdf/png）属可重新生成的程序化 fixture，不入库（见
// .gitignore + samples/fixtures/README.md）。输出统一写到 samples/generated/（已 gitignore）。
//
// 用法：
//   node scripts/generate-samples.js                 # 生成 small + medium + large
//   node scripts/generate-samples.js --tiers small   # 只生成指定层
//   node scripts/generate-samples.js --out custom/dir

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { convertContent } from "../public/browser-transformer.js";
import { SIZE_TIERS, TEXT_BUILDERS, buildToTargetBytes } from "./lib/sample-content.js";
import { buildPatternPng } from "./lib/png-encode.js";

const LARGE_TARGET_BYTES = 3 * 1024 * 1024 + 64 * 1024; // 略超 3MB

function parseArgs(argv) {
  const args = { tiers: ["small", "medium", "large"], out: "samples/generated" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--tiers") args.tiers = argv[++i]?.split(",").map((t) => t.trim()).filter(Boolean) || args.tiers;
    else if (argv[i] === "--out") args.out = argv[++i] || args.out;
  }
  return args;
}

function decodeDataUrlToBuffer(dataUrl) {
  const comma = dataUrl.indexOf(",");
  const base64 = dataUrl.slice(comma + 1);
  return Buffer.from(base64, "base64");
}

function toBinaryBuffer(result) {
  const data = result?.data ?? result;
  if (typeof data === "string" && data.startsWith("data:")) return decodeDataUrlToBuffer(data);
  if (data instanceof Uint8Array) return Buffer.from(data);
  throw new Error("unexpected binary writer output");
}

// 每个 tier 的文本源 builder scale。
function scaleForTier(tier, builderKey) {
  if (tier === "large") {
    return buildToTargetBytes(TEXT_BUILDERS[builderKey], LARGE_TARGET_BYTES).scale;
  }
  return SIZE_TIERS[tier];
}

// 大尺寸 PNG（>3MB 原始像素 → 压缩后视图案而定）。
const PNG_DIMS = { small: [96, 64], medium: [640, 480], large: [1600, 1600] };

async function emit(manifest, outDir, format, tier, buffer, source) {
  const dir = path.join(outDir, tier);
  await mkdir(dir, { recursive: true });
  const fileName = `${format}-${tier}.${format}`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, buffer);
  manifest.files.push({
    format,
    tier,
    path: path.relative(".", filePath).replaceAll("\\", "/"),
    bytes: buffer.length,
    source,
  });
  const mb = (buffer.length / (1024 * 1024)).toFixed(2);
  console.log(`  ${format.padEnd(5)} ${tier.padEnd(6)} ${String(buffer.length).padStart(9)} B (${mb} MB)  ${fileName}`);
}

async function generateTier(manifest, outDir, tier) {
  console.log(`\n[tier: ${tier}]`);

  // 1) 文本原生格式：md / html / json / xml / csv / txt
  const textSources = {};
  for (const key of Object.keys(TEXT_BUILDERS)) {
    const scale = scaleForTier(tier, key);
    const content = TEXT_BUILDERS[key](scale);
    textSources[key] = content;
    await emit(manifest, outDir, key, tier, Buffer.from(content, "utf8"), `builder:${key}@scale=${scale}`);
  }

  // 2) 重格式经项目自带 writer 程序化产出（输入用上面的文本源）。
  const binaryJobs = [
    { format: "docx", from: "md", source: () => textSources.md },
    { format: "pptx", from: "md", source: () => textSources.md },
    { format: "epub", from: "md", source: () => textSources.md },
    { format: "pdf", from: "md", source: () => textSources.md },
    { format: "xlsx", from: "csv", source: () => textSources.csv },
  ];
  for (const job of binaryJobs) {
    try {
      const result = convertContent({
        content: job.source(),
        from: job.from,
        to: job.format,
        title: `sample-${job.format}-${tier}`,
        options: { repair: false },
      });
      await emit(manifest, outDir, job.format, tier, toBinaryBuffer(result), `convert:${job.from}->${job.format}`);
    } catch (error) {
      console.log(`  ${job.format.padEnd(5)} ${tier.padEnd(6)} SKIPPED (${error.message})`);
      manifest.skipped.push({ format: job.format, tier, reason: error.message });
    }
  }

  // 3) PNG：程序化棋盘+渐变图（无 writer，直接编码）。
  const [pw, ph] = PNG_DIMS[tier] || PNG_DIMS.small;
  await emit(manifest, outDir, "png", tier, buildPatternPng(pw, ph), `png-encode:${pw}x${ph}`);
}

async function main() {
  const { tiers, out } = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(out);
  console.log(`Trans2Former sample generator → ${path.relative(".", outDir) || outDir}`);
  console.log(`tiers: ${tiers.join(", ")}`);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const manifest = {
    schema: "trans2former.sample-corpus.v1",
    generatedAt: new Date().toISOString(),
    tiers,
    note: "Programmatically regenerated fixtures. Binaries are git-ignored; rerun `npm run samples:generate`.",
    coverageGaps: [
      { format: "doc", reason: "legacy Word binary has no writer; reader is best-effort only" },
      { format: "ofd", reason: "OFD writer not implemented (reader is L0); see docs/OFD_RESEARCH.md" },
    ],
    files: [],
    skipped: [],
  };

  for (const tier of tiers) {
    if (!(tier in SIZE_TIERS)) {
      console.log(`(skip unknown tier: ${tier})`);
      continue;
    }
    await generateTier(manifest, outDir, tier);
  }

  await writeFile(path.join(outDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

  const largest = manifest.files.reduce((max, f) => Math.max(max, f.bytes), 0);
  console.log(`\nDone. ${manifest.files.length} files, ${manifest.skipped.length} skipped. Largest: ${(largest / (1024 * 1024)).toFixed(2)} MB.`);
  console.log(`Manifest: ${path.relative(".", path.join(outDir, "MANIFEST.json")).replaceAll("\\", "/")}`);
}

main().catch((error) => {
  console.error("Sample generation failed:", error);
  process.exit(1);
});
