#!/usr/bin/env node
// 基准测试执行脚本
// 运行所有基准测试并生成汇总报告

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const BENCHMARK_TESTS = [
  {
    name: "转换质量回归",
    script: "scripts/conversion-quality-test.js",
    category: "correctness",
  },
  {
    name: "格式完整性",
    script: "scripts/format-integrity-test.js",
    category: "correctness",
  },
  {
    name: "格式验证",
    script: "scripts/format-validation-test.js",
    category: "correctness",
  },
  {
    name: "能力矩阵一致性",
    script: "scripts/capability-matrix-consistency-test.js",
    category: "correctness",
  },
  {
    name: "OCR 基准",
    script: "scripts/ocr-baseline-test.js",
    category: "ocr",
  },
  {
    name: "OCR 结果",
    script: "scripts/ocr-result-test.js",
    category: "ocr",
  },
  {
    name: "XLSX 写入性能",
    script: "scripts/xlsx-writer-performance-test.js",
    category: "performance",
  },
  {
    name: "响应性测试",
    script: "scripts/p2-responsiveness-test.js",
    category: "performance",
  },
  {
    name: "资源预算",
    script: "scripts/resource-budget-test.js",
    category: "performance",
  },
  {
    name: "数据完整性",
    script: "scripts/r0-p0-data-integrity-test.js",
    category: "robustness",
  },
  {
    name: "服务器加固",
    script: "scripts/server-hardening-test.js",
    category: "robustness",
  },
  {
    name: "本地安全",
    script: "scripts/local-security-test.js",
    category: "robustness",
  },
];

function runTest(test) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn("node", [test.script], {
      stdio: "pipe",
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const duration = Date.now() - startTime;
      resolve({
        name: test.name,
        category: test.category,
        passed: code === 0,
        duration,
        stdout,
        stderr,
      });
    });
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getCategoryEmoji(category) {
  const emojis = {
    correctness: "✅",
    ocr: "👁️",
    performance: "⚡",
    robustness: "🛡️",
  };
  return emojis[category] || "📊";
}

async function main() {
  console.log("🚀 开始运行基准测试套件...\n");
  console.log(`总计 ${BENCHMARK_TESTS.length} 个测试\n`);
  console.log("=" .repeat(80));

  const results = [];
  let currentCategory = null;

  for (const test of BENCHMARK_TESTS) {
    if (test.category !== currentCategory) {
      currentCategory = test.category;
      console.log(`\n${getCategoryEmoji(test.category)} ${test.category.toUpperCase()}\n`);
    }

    process.stdout.write(`  ${test.name} ... `);
    const result = await runTest(test);
    results.push(result);

    if (result.passed) {
      console.log(`✅ 通过 (${formatDuration(result.duration)})`);
    } else {
      console.log(`❌ 失败 (${formatDuration(result.duration)})`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("\n📊 基准测试汇总\n");

  const byCategory = {};
  for (const result of results) {
    if (!byCategory[result.category]) {
      byCategory[result.category] = { passed: 0, failed: 0, totalTime: 0 };
    }
    if (result.passed) {
      byCategory[result.category].passed += 1;
    } else {
      byCategory[result.category].failed += 1;
    }
    byCategory[result.category].totalTime += result.duration;
  }

  for (const [category, stats] of Object.entries(byCategory)) {
    const total = stats.passed + stats.failed;
    const emoji = getCategoryEmoji(category);
    console.log(
      `${emoji} ${category.padEnd(15)} ${stats.passed}/${total} 通过，耗时 ${formatDuration(stats.totalTime)}`
    );
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log("\n" + "-".repeat(80));
  console.log(`总计: ${totalPassed}/${results.length} 通过，${totalFailed} 失败，总耗时 ${formatDuration(totalTime)}`);

  if (totalFailed > 0) {
    console.log("\n❌ 失败的测试:\n");
    for (const result of results.filter((r) => !r.passed)) {
      console.log(`  - ${result.name}`);
      if (result.stderr) {
        console.log(`    错误: ${result.stderr.split("\n")[0]}`);
      }
    }
  }

  // 生成 JSON 报告
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: totalPassed,
      failed: totalFailed,
      duration: totalTime,
    },
    byCategory,
    results: results.map((r) => ({
      name: r.name,
      category: r.category,
      passed: r.passed,
      duration: r.duration,
    })),
  };

  await writeFile("benchmark-report.json", JSON.stringify(report, null, 2));
  console.log("\n📄 详细报告已保存到 benchmark-report.json");

  if (totalFailed > 0) {
    console.log("\n⚠️  部分基准测试失败，请检查上述错误信息");
    process.exit(1);
  } else {
    console.log("\n✅ 所有基准测试通过！");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("基准测试执行失败:", error);
  process.exit(1);
});
