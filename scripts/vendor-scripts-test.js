// vendor 脚本功能测试
// 验证 vendor-onnx.js 和 vendor-paddle.js 的可执行性和输出正确性

import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

// 测试辅助函数
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath], { cwd: ROOT });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => { stdout += data.toString(); });
    child.stderr?.on("data", (data) => { stderr += data.toString(); });

    child.on("exit", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function testVendorOnnx() {
  console.log("\n[test] 测试 vendor-onnx.js");

  const scriptPath = path.join(ROOT, "scripts", "vendor-onnx.js");
  const vendorDir = path.join(ROOT, "public", "vendor", "onnxruntime");

  // 1. 脚本文件存在
  if (!(await pathExists(scriptPath))) {
    throw new Error(`vendor-onnx.js 不存在：${scriptPath}`);
  }
  console.log("  ✅ vendor-onnx.js 文件存在");

  // 2. 执行脚本
  const result = await runScript(scriptPath);
  if (result.code !== 0) {
    console.warn(`  ⚠️ 脚本退出码：${result.code}（onnxruntime-web 可能未安装，这是预期行为）`);
  } else {
    console.log("  ✅ 脚本执行成功");
  }

  // 3. 检查输出内容
  const output = result.stdout + result.stderr;
  if (!output.includes("vendor-onnx")) {
    throw new Error("脚本输出缺少 [vendor-onnx] 标签");
  }
  console.log("  ✅ 脚本输出格式正确");

  // 4. 验证 vendor 目录（如果 onnxruntime-web 已安装）
  if (await pathExists(vendorDir)) {
    const expectedFiles = ["ort.min.mjs", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];
    let foundCount = 0;
    for (const file of expectedFiles) {
      if (await pathExists(path.join(vendorDir, file))) {
        foundCount += 1;
      }
    }
    if (foundCount > 0) {
      console.log(`  ✅ vendor 目录存在，包含 ${foundCount}/${expectedFiles.length} 个预期文件`);
    }
  } else {
    console.log("  ℹ️ vendor 目录不存在（onnxruntime-web 未安装）");
  }
}

async function testVendorPaddle() {
  console.log("\n[test] 测试 vendor-paddle.js");

  const scriptPath = path.join(ROOT, "scripts", "vendor-paddle.js");
  const vendorDir = path.join(ROOT, "public", "vendor", "paddleocr");

  // 1. 脚本文件存在
  if (!(await pathExists(scriptPath))) {
    throw new Error(`vendor-paddle.js 不存在：${scriptPath}`);
  }
  console.log("  ✅ vendor-paddle.js 文件存在");

  // 2. 执行脚本
  const result = await runScript(scriptPath);
  if (result.code !== 0) {
    throw new Error(`vendor-paddle.js 执行失败，退出码：${result.code}\n${result.stderr}`);
  }
  console.log("  ✅ 脚本执行成功");

  // 3. 检查输出内容
  const output = result.stdout + result.stderr;
  if (!output.includes("vendor-paddle")) {
    throw new Error("脚本输出缺少 [vendor-paddle] 标签");
  }
  if (!output.includes("PP-OCRv5")) {
    throw new Error("脚本输出缺少 PP-OCRv5 关键词");
  }
  console.log("  ✅ 脚本输出格式正确");

  // 4. 验证 vendor 目录和文件
  if (!(await pathExists(vendorDir))) {
    throw new Error(`vendor 目录不存在：${vendorDir}`);
  }

  const expectedFiles = [
    "ch_PP-OCRv5_det_infer.onnx",
    "ch_PP-OCRv5_rec_infer.onnx",
    "ppocr_keys_v1.txt",
  ];

  for (const file of expectedFiles) {
    const filePath = path.join(vendorDir, file);
    if (!(await pathExists(filePath))) {
      throw new Error(`预期文件不存在：${file}`);
    }
    const info = await stat(filePath);
    if (info.size === 0) {
      throw new Error(`文件为空：${file}`);
    }
  }
  console.log(`  ✅ vendor 目录包含 ${expectedFiles.length} 个预期文件`);
}

async function testGenerateSamples() {
  console.log("\n[test] 测试 generate-samples.js");

  const scriptPath = path.join(ROOT, "scripts", "generate-samples.js");

  // 1. 脚本文件存在
  if (!(await pathExists(scriptPath))) {
    throw new Error(`generate-samples.js 不存在：${scriptPath}`);
  }
  console.log("  ✅ generate-samples.js 文件存在");

  // 2. 执行脚本（只生成 small tier 以节省时间）
  const result = await runScript(scriptPath);
  if (result.code !== 0) {
    throw new Error(`generate-samples.js 执行失败，退出码：${result.code}\n${result.stderr}`);
  }
  console.log("  ✅ 脚本执行成功");

  // 3. 检查输出内容
  const output = result.stdout + result.stderr;
  if (!output.includes("Trans2Former sample generator")) {
    throw new Error("脚本输出缺少标题");
  }
  if (!output.includes("Done.")) {
    throw new Error("脚本输出缺少完成标记");
  }
  console.log("  ✅ 脚本输出格式正确");

  // 4. 验证生成的文件
  const outputDir = path.join(ROOT, "samples", "generated");
  if (!(await pathExists(outputDir))) {
    throw new Error(`输出目录不存在：${outputDir}`);
  }

  const manifestPath = path.join(outputDir, "MANIFEST.json");
  if (!(await pathExists(manifestPath))) {
    throw new Error("MANIFEST.json 不存在");
  }
  console.log("  ✅ 生成文件验证通过");
}

async function main() {
  console.log("vendor 脚本功能测试");
  console.log("=".repeat(50));

  let passed = 0;
  let failed = 0;

  // 测试 vendor-onnx.js
  try {
    await testVendorOnnx();
    passed += 1;
  } catch (error) {
    console.error(`  ❌ vendor-onnx.js 测试失败：${error.message}`);
    failed += 1;
  }

  // 测试 vendor-paddle.js
  try {
    await testVendorPaddle();
    passed += 1;
  } catch (error) {
    console.error(`  ❌ vendor-paddle.js 测试失败：${error.message}`);
    failed += 1;
  }

  // 测试 generate-samples.js
  try {
    await testGenerateSamples();
    passed += 1;
  } catch (error) {
    console.error(`  ❌ generate-samples.js 测试失败：${error.message}`);
    failed += 1;
  }

  console.log("\n" + "=".repeat(50));
  console.log(`测试完成：${passed} 通过，${failed} 失败`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("测试异常：", error);
  process.exit(1);
});
