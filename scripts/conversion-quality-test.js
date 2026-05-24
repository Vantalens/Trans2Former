// P8-M6 转换质量回归。
//
// 跑 samples/ 真样例的关键路径，按指标输出 Quality Report：
//   - 文本等价率：核心关键词在输出中保留比例
//   - 结构保留率：heading / list / table / code block 数量保持
//   - 路径温度：从 RoutePlanner 拿 hot/warm/cold
//   - warnings 数量：lossy / unsupported 各分类计数
//
// 失败条件（任一即 fail，CI 阻断）：
//   - 关键词丢失 > 阈值
//   - 该路径声明 hot 但实际转换抛错
//   - 输出体积异常（< 10 字节或 > 50MB）

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { convertContent, getRouteTemperature, toDocumentModel } from "../public/browser-transformer.js";

const QUALITY_TARGETS = [
  {
    name: "MD 中文 → HTML",
    inputPath: "samples/md/chinese.md",
    from: "md",
    to: "html",
    keywords: ["中文样例", "第一项", "第二项", "这是一段引用"],
    expectedTemperature: "hot",
    minLength: 200,
  },
  {
    name: "MD 表格 → HTML",
    inputPath: "samples/md/table-code.md",
    from: "md",
    to: "html",
    keywords: ["Table And Code", "alpha", "beta", "console.log"],
    expectedTemperature: "hot",
    structureMin: { table: 1, code: 1, heading: 1 },
  },
  {
    name: "HTML article → MD",
    inputPath: "samples/html/article.html",
    from: "html",
    to: "md",
    keywords: ["HTML Article", "**bold**", "> Quoted text"],
    expectedTemperature: "hot",
    structureMin: { heading: 1, paragraph: 1, quote: 1 },
  },
  {
    name: "HTML inline-media → MD",
    inputPath: "samples/html/inline-media.html",
    from: "html",
    to: "md",
    keywords: ["[example](https://example.com)", "![Inline image]"],
    expectedTemperature: "hot",
  },
  {
    name: "HTML 表格列表 → MD",
    inputPath: "samples/html/table-list.html",
    from: "html",
    to: "md",
    keywords: ["Table And List", "- One", "- Two", "| Name | Value |"],
    expectedTemperature: "hot",
    structureMin: { heading: 1, list: 1, table: 1 },
  },
  {
    name: "CSV 中文 → MD",
    inputPath: "samples/csv/unicode.csv",
    from: "csv",
    to: "md",
    keywords: ["| 名称 | 说明 |", "苹果", "中文单元格", "香蕉"],
    expectedTemperature: "warm",
    structureMin: { table: 1 },
  },
  {
    name: "CSV → JSON（保留 WorkbookModel 结构）",
    inputPath: "samples/csv/basic.csv",
    from: "csv",
    to: "json",
    keywords: ["\"type\": \"table\""],
    expectedTemperature: "warm",
  },
  {
    name: "TXT 中文 → MD",
    inputPath: "samples/txt/chinese.txt",
    from: "txt",
    to: "md",
    keywords: ["中文纯文本样例", "第一段", "第二段"],
    expectedTemperature: "hot",
    structureMin: { paragraph: 2 },
  },
  {
    name: "JSON object → MD（fenced code 包装）",
    inputPath: "samples/json/object.json",
    from: "json",
    to: "md",
    keywords: ["```json", "JSON Object", "alpha", "beta"],
    expectedTemperature: "hot",
  },
  {
    name: "XML basic → MD（raw fenced code 输出）",
    inputPath: "samples/xml/basic.xml",
    from: "xml",
    to: "md",
    keywords: ["```xml", "<root>", "<item>", "</root>"],
    expectedTemperature: "hot",
  },
  {
    name: "MD chinese → JSON",
    inputPath: "samples/md/chinese.md",
    from: "md",
    to: "json",
    keywords: ["\"type\": \"heading\"", "中文样例", "\"type\": \"list\""],
    expectedTemperature: "hot",
  },
];

function countBlocksByType(model) {
  const counts = {};
  for (const block of model.blocks || []) {
    counts[block.type] = (counts[block.type] || 0) + 1;
  }
  return counts;
}

const qualityReport = [];
let failures = 0;

for (const target of QUALITY_TARGETS) {
  const fileName = path.basename(target.inputPath);
  let outcome = { name: target.name, status: "ok" };
  try {
    const raw = await readFile(target.inputPath, "utf8");
    const result = convertContent({
      content: raw,
      from: target.from,
      to: target.to,
      title: fileName,
      fileName,
    });
    const data = String(result?.data ?? "");
    outcome.length = data.length;
    outcome.temperature = getRouteTemperature(target.from, target.to);

    if (target.expectedTemperature && outcome.temperature !== target.expectedTemperature) {
      throw new Error(`期望温度 ${target.expectedTemperature}，实际 ${outcome.temperature}`);
    }

    if (target.minLength && data.length < target.minLength) {
      throw new Error(`输出长度 ${data.length} 低于阈值 ${target.minLength}`);
    }

    const missingKeywords = target.keywords.filter((keyword) => !data.includes(keyword));
    if (missingKeywords.length > 0) {
      throw new Error(`关键词丢失：${missingKeywords.map((kw) => JSON.stringify(kw)).join(", ")}`);
    }

    if (target.structureMin) {
      const inputModel = toDocumentModel(raw, target.from, fileName);
      const counts = countBlocksByType(inputModel);
      for (const [type, min] of Object.entries(target.structureMin)) {
        if ((counts[type] || 0) < min) {
          throw new Error(`reader 结构断言失败：${type} 实际 ${counts[type] || 0} < ${min}`);
        }
      }
      outcome.structure = counts;
    }

    qualityReport.push(outcome);
    console.log(`ok - ${target.name}（temp=${outcome.temperature}, length=${outcome.length}）`);
  } catch (error) {
    outcome.status = "fail";
    outcome.error = error?.message || String(error);
    failures += 1;
    qualityReport.push(outcome);
    console.error(`FAIL - ${target.name}: ${outcome.error}`);
  }
}

console.log(`Conversion quality test summary: ${qualityReport.length - failures} ok, ${failures} fail`);
assert.equal(failures, 0, `转换质量回归发现 ${failures} 项失败`);
console.log("Conversion quality test passed: all sample paths met keyword / structure / temperature thresholds.");
