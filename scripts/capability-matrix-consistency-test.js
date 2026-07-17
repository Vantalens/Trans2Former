/**
 * 能力矩阵一致性测试
 * 验证 README.md、CONVERSION_PATHS.md 和代码实现的一致性
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// 从代码中提取格式能力定义
const formatRegistryPath = join(rootDir, "public", "core", "format-registry.js");
const formatRegistryContent = readFileSync(formatRegistryPath, "utf-8");

// 提取 PRODUCT_MATRIX_BY_INPUT
const matrixMatch = formatRegistryContent.match(/const PRODUCT_MATRIX_BY_INPUT = \{([^}]+)\}/s);
if (!matrixMatch) {
  console.error("❌ 无法从 format-registry.js 提取 PRODUCT_MATRIX_BY_INPUT");
  process.exit(1);
}

const matrixText = matrixMatch[0];
const codeMatrix = {};

// 解析矩阵
const lines = matrixText.split("\n").filter(line => line.includes(":"));
for (const line of lines) {
  const match = line.match(/(\w+):\s*\[([^\]]+)\]/);
  if (match) {
    const input = match[1];
    const outputs = match[2]
      .split(",")
      .map(s => s.trim().replace(/['"]/g, ""))
      .filter(Boolean);
    codeMatrix[input] = outputs;
  }
}

console.log("📊 代码中定义的转换能力矩阵:");
console.log("输入格式:", Object.keys(codeMatrix).map(k => k.toUpperCase()).join(", "));
console.log("总计:", Object.keys(codeMatrix).length, "种输入格式\n");

// 实现的 readers 和 writers（从 formats 目录检查）
const implementedReaders = ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "pdf", "epub", "pptx", "png", "doc", "ofd"];
const implementedWriters = ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "pdf", "epub", "pptx"];

console.log("✅ 实现的格式能力:");
console.log("输入格式 (readers):", implementedReaders.map(f => f.toUpperCase()).join(", "));
console.log("输出格式 (writers):", implementedWriters.map(f => f.toUpperCase()).join(", "));
console.log("总计:", implementedReaders.length, "种输入,", implementedWriters.length, "种输出\n");

// 读取 README.md
const readmePath = join(rootDir, "README.md");
const readmeContent = readFileSync(readmePath, "utf-8");

// 检查 README 中的格式声明
const readmeInputMatch = readmeContent.match(/输入（(\d+)\s*种）/);
const readmeOutputMatch = readmeContent.match(/输出（(\d+)\s*种）/);

const readmeInputCount = readmeInputMatch ? parseInt(readmeInputMatch[1]) : 0;
const readmeOutputCount = readmeOutputMatch ? parseInt(readmeOutputMatch[1]) : 0;

console.log("📄 README.md 中声明的格式数量:");
console.log("输入:", readmeInputCount, "种");
console.log("输出:", readmeOutputCount, "种\n");

// 读取 CONVERSION_PATHS.md
const conversionPathsPath = join(rootDir, "docs", "product", "CONVERSION_PATHS.md");
const conversionPathsContent = readFileSync(conversionPathsPath, "utf-8");

// 提取转换路径矩阵
const pathsLines = conversionPathsContent.split("\n").filter(line => line.startsWith("| ") && !line.includes("---"));
const pathsMatrix = {};

for (const line of pathsLines) {
  if (line.includes("输入") || line.includes("可选输出")) continue;

  const parts = line.split("|").map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const input = parts[0];
    const outputs = parts[1];

    // 标准化输入格式名
    let normalizedInput = input.toLowerCase();
    if (normalizedInput.includes("markdown")) normalizedInput = "md";
    else if (normalizedInput.includes("doc / docx") || normalizedInput.includes("docx")) normalizedInput = "docx";
    else if (normalizedInput.includes("doc")) normalizedInput = "doc";
    else if (normalizedInput === "txt") normalizedInput = "txt";
    else if (normalizedInput === "html") normalizedInput = "html";
    else if (normalizedInput === "json") normalizedInput = "json";
    else if (normalizedInput === "xml") normalizedInput = "xml";
    else if (normalizedInput === "csv") normalizedInput = "csv";
    else if (normalizedInput === "xlsx") normalizedInput = "xlsx";
    else if (normalizedInput === "epub") normalizedInput = "epub";
    else if (normalizedInput === "pdf") normalizedInput = "pdf";
    else if (normalizedInput === "pptx") normalizedInput = "pptx";
    else if (normalizedInput === "png") normalizedInput = "png";
    else if (normalizedInput === "ofd") normalizedInput = "ofd";

    if (normalizedInput && outputs) {
      pathsMatrix[normalizedInput] = outputs;
    }
  }
}

console.log("📋 CONVERSION_PATHS.md 中定义的输入格式:");
console.log(Object.keys(pathsMatrix).map(k => k.toUpperCase()).join(", "));
console.log("总计:", Object.keys(pathsMatrix).length, "种输入格式\n");

// 验证一致性
let hasErrors = false;

console.log("🔍 一致性检查:");

// 1. 检查 README 中的数量声明
if (readmeInputCount !== implementedReaders.length) {
  console.error(`❌ README.md 输入格式数量不一致: 声明 ${readmeInputCount} 种，实际实现 ${implementedReaders.length} 种`);
  hasErrors = true;
} else {
  console.log(`✅ README.md 输入格式数量一致: ${readmeInputCount} 种`);
}

if (readmeOutputCount !== implementedWriters.length) {
  console.error(`❌ README.md 输出格式数量不一致: 声明 ${readmeOutputCount} 种，实际实现 ${implementedWriters.length} 种`);
  hasErrors = true;
} else {
  console.log(`✅ README.md 输出格式数量一致: ${readmeOutputCount} 种`);
}

// 2. 检查代码矩阵是否包含所有实现的 readers
for (const reader of implementedReaders) {
  if (!codeMatrix[reader]) {
    console.error(`❌ 代码矩阵缺失输入格式: ${reader.toUpperCase()}`);
    hasErrors = true;
  }
}

if (!hasErrors) {
  console.log(`✅ 代码矩阵包含所有实现的输入格式`);
}

// 3. 检查 CONVERSION_PATHS.md 是否包含所有输入格式
const missingInPaths = [];
for (const reader of implementedReaders) {
  if (!pathsMatrix[reader]) {
    missingInPaths.push(reader.toUpperCase());
  }
}

if (missingInPaths.length > 0) {
  console.error(`❌ CONVERSION_PATHS.md 缺失输入格式: ${missingInPaths.join(", ")}`);
  hasErrors = true;
} else {
  console.log(`✅ CONVERSION_PATHS.md 包含所有输入格式`);
}

// 4. 检查代码矩阵与 CONVERSION_PATHS.md 的输出一致性
console.log("\n🔍 详细转换路径一致性检查:");
for (const input of Object.keys(codeMatrix).sort()) {
  const codeOutputs = codeMatrix[input].sort();
  const pathsOutputsRaw = pathsMatrix[input];

  if (!pathsOutputsRaw) {
    console.error(`❌ ${input.toUpperCase()}: CONVERSION_PATHS.md 中未定义`);
    hasErrors = true;
    continue;
  }

  // 解析 CONVERSION_PATHS.md 中的输出列表
  const pathsOutputs = [];
  const outputParts = pathsOutputsRaw.split(/[、，,]/).map(s => s.trim());
  for (const part of outputParts) {
    let normalized = part.toLowerCase();
    if (normalized.includes("markdown")) pathsOutputs.push("md");
    else if (normalized === "html") pathsOutputs.push("html");
    else if (normalized === "txt") pathsOutputs.push("txt");
    else if (normalized === "json") pathsOutputs.push("json");
    else if (normalized === "csv") pathsOutputs.push("csv");
    else if (normalized === "xml") pathsOutputs.push("xml");
    else if (normalized === "docx") pathsOutputs.push("docx");
    else if (normalized === "xlsx") pathsOutputs.push("xlsx");
    else if (normalized === "pdf") pathsOutputs.push("pdf");
    else if (normalized === "epub") pathsOutputs.push("epub");
    else if (normalized === "pptx") pathsOutputs.push("pptx");
  }

  const pathsOutputsUnique = [...new Set(pathsOutputs)].sort();

  // 比较
  const codeStr = codeOutputs.join(",");
  const pathsStr = pathsOutputsUnique.join(",");

  if (codeStr !== pathsStr) {
    console.error(`❌ ${input.toUpperCase()}: 代码与文档输出不一致`);
    console.error(`   代码: ${codeOutputs.join(", ")}`);
    console.error(`   文档: ${pathsOutputsUnique.join(", ")}`);

    // 找出差异
    const missingInCode = pathsOutputsUnique.filter(o => !codeOutputs.includes(o));
    const missingInDocs = codeOutputs.filter(o => !pathsOutputsUnique.includes(o));

    if (missingInCode.length > 0) {
      console.error(`   代码中缺失: ${missingInCode.join(", ")}`);
    }
    if (missingInDocs.length > 0) {
      console.error(`   文档中缺失: ${missingInDocs.join(", ")}`);
    }

    hasErrors = true;
  } else {
    console.log(`✅ ${input.toUpperCase()}: 一致 (${codeOutputs.length} 种输出)`);
  }
}

console.log("\n" + "=".repeat(60));
if (hasErrors) {
  console.error("\n❌ 能力矩阵一致性检查失败");
  console.error("\n需要执行的操作:");
  console.error("1. 更新 README.md 中的格式数量声明");
  console.error("2. 更新 CONVERSION_PATHS.md 中的转换路径定义");
  console.error("3. 确保代码、README 和 CONVERSION_PATHS.md 三者一致");
  process.exit(1);
} else {
  console.log("\n✅ 所有能力矩阵一致性检查通过");
  process.exit(0);
}
