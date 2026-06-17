#!/usr/bin/env node
/**
 * 全格式转换验证测试
 * 测试所有支持的格式对的转换质量
 * 包括结构完整性、数据保留、编码正确性等
 */

import assert from "assert";
import { convertContent, getAllowedOutputFormats } from "../public/browser-transformer.js";
import { createDocumentModel, createHeading, createParagraph } from "../public/core/document-model.js";
import { readZipEntries } from "../public/core/zip-container.js";
import { readCsv } from "../public/formats/csv.js";
import { writePptx } from "../public/formats/pptx.js";

// 测试用例：多种格式的标准示例
const testCases = {
  // 基础文本格式
  txt: "Hello World\n中文测试\nMultiline text content\n",
  
  // Markdown - 包含多种元素
  md: `# 文档标题
  
## 副标题

这是一个**粗体**文本，这是*斜体*文本。

- 项目 1
- 项目 2
  - 嵌套项目
  
1. 有序项 1
2. 有序项 2

\`\`\`javascript
const x = 42;
\`\`\`

| 列1 | 列2 |
|-----|-----|
| A   | B   |
| 中  | 文  |

[链接](https://example.com)
`,
  
  // HTML
  html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <title>测试页面</title>
  <meta charset="UTF-8">
</head>
<body>
  <h1>标题</h1>
  <p>段落文本 with <strong>bold</strong> and <em>italic</em>.</p>
  <ul>
    <li>列表项1</li>
    <li>列表项2</li>
  </ul>
  <table>
    <tr><th>Header1</th><th>Header2</th></tr>
    <tr><td>Data1</td><td>Data2</td></tr>
  </table>
</body>
</html>
`,
  
  // CSV - 包含特殊字符和多行单元格
  csv: `Name,Age,Description
John,30,"Simple text"
张三,25,"Multi
line
text"
"Quote""Test"",Smith",28,"Contains, comma"
`,
  
  // JSON - 完整结构
  json: JSON.stringify({
    title: "Test Document",
    blocks: [
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Content" },
      { type: "table", headers: ["Col1", "Col2"], rows: [["A", "B"], ["中", "文"]] }
    ],
    metadata: { created: new Date().toISOString() }
  }, null, 2),
  
  // XML - 包含命名空间和属性
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="http://example.com/ns">
  <title lang="zh">标题</title>
  <section>
    <paragraph>中文段落</paragraph>
    <data attr="value">Content</data>
  </section>
</root>
`,
};

function createBinarySample(format) {
  if (format === "pptx") {
    return writePptx({
      model: createDocumentModel({
        title: "sample.pptx",
        sourceFormat: "manual",
        blocks: [createHeading(1, "Sample slide"), createParagraph("Generated fixture")],
      }),
      title: "sample.pptx",
    }).data;
  }
  const result = convertContent({
    content: testCases.md,
    from: "md",
    to: format,
    title: `sample.${format}`,
  });
  return result.data;
}

const sampleInputs = {
  docx: createBinarySample("docx"),
  xlsx: createBinarySample("xlsx"),
  epub: createBinarySample("epub"),
  pptx: createBinarySample("pptx"),
  pdf: createBinarySample("pdf"),
  doc: testCases.txt,
};

// 所有支持的格式
const formats = {
  input: ["txt", "md", "html", "csv", "json", "xml", "docx", "xlsx", "epub", "pptx", "pdf", "doc"],
  output: ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "epub", "pptx", "pdf"],
};

console.log("\n" + "=".repeat(80));
console.log("全格式转换验证测试");
console.log("=".repeat(80) + "\n");

// 统计信息
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
};

// 测试 1: 基础格式转换（不使用示例数据）
console.log("📋 测试 1: 基础格式转换验证");
console.log("-".repeat(80));

for (const from of formats.input) {
  for (const to of formats.output) {
    if (!getAllowedOutputFormats(from).includes(to)) {
      stats.skipped++;
      continue;
    }
    stats.total++;
    try {
      const testData = sampleInputs[from] || testCases[from] || `Test content for ${from}`;
      const result = convertContent({
        content: testData,
        from,
        to,
        title: `test.${from}`,
        fileName: `test.${from}`,
      });

      // 基本验证
      if (!result || !result.format) {
        throw new Error("No result or missing format");
      }

      if (result.format !== to) {
        throw new Error(`Format mismatch: expected ${to}, got ${result.format}`);
      }

      // 类型检查
      if (!["binary", "text"].includes(result.type)) {
        throw new Error(`Invalid result type: ${result.type}`);
      }

      // 数据完整性检查
      if (!result.data) {
        throw new Error("No output data");
      }

      stats.passed++;
      process.stdout.write(".");
    } catch (err) {
      stats.failed++;
      stats.errors.push({
        test: `${from} → ${to}`,
        error: err.message,
      });
      process.stdout.write("✗");
    }
  }
}

console.log("\n");

// 测试 2: OOXML 格式特定检查
console.log("📋 测试 2: OOXML 格式结构验证");
console.log("-".repeat(80));

const oomlFormats = ["docx", "xlsx", "pptx"];
let oomlTestCount = 0;

for (const format of oomlFormats) {
  try {
    oomlTestCount++;
    const result = convertContent({
      content: testCases.md,
      from: "md",
      to: format,
      title: `test.${format}`,
    });

    const zip = readZipEntries(result.data);

    // 检查基础文件
    assert.ok(zip.has("[Content_Types].xml"), `${format}: Missing [Content_Types].xml`);
    assert.ok(zip.has("_rels/.rels"), `${format}: Missing _rels/.rels`);

    // 格式特定检查
    if (format === "docx") {
      assert.ok(zip.has("word/document.xml"), "docx: Missing word/document.xml");
      assert.ok(zip.has("word/_rels/document.xml.rels"), "docx: Missing document.xml.rels");
      const docXml = zip.getText("word/document.xml");
      assert.ok(docXml.includes("<w:document"), "docx: Invalid document structure");
    }

    if (format === "xlsx") {
      assert.ok(zip.has("xl/workbook.xml"), "xlsx: Missing xl/workbook.xml");
      assert.ok(zip.has("xl/worksheets/sheet1.xml"), "xlsx: Missing worksheet");
      assert.ok(zip.has("xl/sharedStrings.xml"), "xlsx: Missing sharedStrings.xml");
      assert.ok(zip.has("xl/styles.xml"), "xlsx: Missing styles.xml");
      const workbookXml = zip.getText("xl/workbook.xml");
      assert.ok(workbookXml.includes("<sheets"), "xlsx: Invalid workbook structure");
    }

    if (format === "pptx") {
      assert.ok(zip.has("ppt/presentation.xml"), "pptx: Missing presentation.xml");
      assert.ok(zip.has("ppt/slides/slide1.xml"), "pptx: Missing slide1.xml");
      assert.ok(zip.has("ppt/theme/theme1.xml"), "pptx: Missing theme1.xml");
      assert.ok(zip.has("ppt/slideMasters/slideMaster1.xml"), "pptx: Missing slideMaster");
      assert.ok(zip.has("ppt/slideLayouts/slideLayout1.xml"), "pptx: Missing slideLayout");
      const presentXml = zip.getText("ppt/presentation.xml");
      assert.ok(presentXml.includes("<p:sldIdLst"), "pptx: Invalid presentation structure");
    }

    // 修复 issue #74: 测试2成功时计入统计
    stats.total++;
    stats.passed++;
    console.log(`✅ ${format.toUpperCase()}: OOXML 结构完整`);
  } catch (err) {
    // 修复 issue #74: 测试2失败时计入统计
    stats.total++;
    stats.failed++;
    console.log(`❌ ${format.toUpperCase()}: ${err.message}`);
    stats.errors.push({
      test: `OOXML检查: ${format}`,
      error: err.message,
    });
  }
}

// 测试 3: 编码和文本保留
console.log("\n📋 测试 3: 中文文本和编码保留验证");
console.log("-".repeat(80));

const chineseContent = "中文测试：标题、段落、表格数据";
const textFormats = ["txt", "md", "html", "csv", "json", "xml"];
let encodingTestCount = 0;

for (const format of textFormats) {
  try {
    if (!getAllowedOutputFormats("txt").includes(format)) {
      stats.skipped++;
      console.log(`⊘ ${format.toUpperCase()}: 当前产品策略不支持 TXT → ${format}`);
      continue;
    }
    encodingTestCount++;
    const result = convertContent({
      content: chineseContent,
      from: "txt",
      to: format,
      title: "中文测试",
    });

    if (result.type === "text") {
      assert.ok(result.data.includes("中文"), `${format}: Lost Chinese characters`);
      assert.ok(!/[●ï¿½]/.test(result.data), `${format}: Contains mojibake markers`);
    } else if (result.type === "binary") {
      // 对于 ZIP 格式，需要解压后检查
      // (DOCX/XLSX/PPTX 在格式2中已检查)
    }

    // 修复 issue #74: 测试3成功时计入统计
    stats.total++;
    stats.passed++;
    console.log(`✅ ${format.toUpperCase()}: 中文正确保留`);
  } catch (err) {
    // 修复 issue #74: 测试3失败时计入统计
    stats.total++;
    stats.failed++;
    console.log(`❌ ${format.toUpperCase()}: ${err.message}`);
    stats.errors.push({
      test: `编码保留: ${format}`,
      error: err.message,
    });
  }
}

// 测试 4: CSV 特定验证
console.log("\n📋 测试 4: CSV 解析和转换验证");
console.log("-".repeat(80));

try {
  // 测试 CSV 读取
  const csvModel = readCsv({
    content: testCases.csv,
    title: "test.csv",
  });

  assert.ok(csvModel.blocks && csvModel.blocks.length > 0, "CSV: No blocks generated");

  const table = csvModel.blocks.find(b => b.type === "table");
  assert.ok(table, "CSV: No table block found");
  assert.ok(table.headers && table.headers.length > 0, "CSV: No headers");
  assert.ok(table.rows && table.rows.length > 0, "CSV: No rows");

  // 修复 issue #74: 测试4成功时计入统计
  stats.total++;
  stats.passed++;
  console.log(`✅ CSV: 正确解析为 ${table.rows.length} 行数据`);
} catch (err) {
  // 修复 issue #74: 测试4失败时计入统计
  stats.total++;
  stats.failed++;
  console.log(`❌ CSV: ${err.message}`);
  stats.errors.push({
    test: "CSV 解析",
    error: err.message,
  });
}

// 测试 5: 图像输出策略
console.log("\n📋 测试 5: 图像输出策略验证");
console.log("-".repeat(80));

for (const fmt of ["png", "jpeg"]) {
  try {
    stats.total++;
    assert.equal(getAllowedOutputFormats("md").includes(fmt), false, `${fmt}: placeholder visual output should not be exposed`);
    
    stats.passed++;
    console.log(`✅ ${fmt.toUpperCase()}: 未暴露未达标图像输出`);
  } catch (err) {
    stats.failed++;
    console.log(`❌ ${fmt.toUpperCase()}: ${err.message}`);
    stats.errors.push({
      test: `图像生成: ${fmt}`,
      error: err.message,
    });
  }
}

// 测试 6: PDF 和 OFD 格式
console.log("\n📋 测试 6: PDF/OFD 特殊格式验证");
console.log("-".repeat(80));

for (const fmt of ["pdf", "ofd"]) {
  try {
    stats.total++;
    
    // PDF 和 OFD 通常只支持输出或有限的输入
    if (formats.output.includes(fmt)) {
      const result = convertContent({
        content: testCases.md,
        from: "md",
        to: fmt,
        title: `test.${fmt}`,
      });

      assert.ok(result.data, `${fmt}: No output data`);
      assert.equal(result.format, fmt, `${fmt}: Format mismatch`);
      
      stats.passed++;
      console.log(`✅ ${fmt.toUpperCase()}: 转换成功`);
    } else {
      stats.skipped++;
      console.log(`⊘ ${fmt.toUpperCase()}: 不支持此操作`);
    }
  } catch (err) {
    stats.failed++;
    console.log(`❌ ${fmt.toUpperCase()}: ${err.message}`);
    stats.errors.push({
      test: `特殊格式: ${fmt}`,
      error: err.message,
    });
  }
}

// 测试 7: 圆形转换（Round-trip）验证
console.log("\n📋 测试 7: 格式圆形转换验证（关键格式）");
console.log("-".repeat(80));

const roundTripTests = [
  { from: "md", to: "html", backTo: "md" },
  { from: "csv", to: "json", backTo: "csv" },
  { from: "txt", to: "md", backTo: "txt" },
];

for (const test of roundTripTests) {
  try {
    stats.total++;
    
    const source = testCases[test.from] || "Test content";
    const step1 = convertContent({ content: source, from: test.from, to: test.to });
    const step2 = convertContent({ content: step1.data, from: test.to, to: test.backTo });

    // 基本检查：应该返回文本数据
    assert.ok(step2.data, "Round-trip: Lost data");
    
    // 简单的内容保留检查
    const sourceWords = source.toLowerCase().match(/\w+/g) || [];
    const resultWords = step2.data.toLowerCase().match(/\w+/g) || [];
    const preserved = sourceWords.filter(w => resultWords.includes(w)).length;
    const preservationRate = preserved / Math.max(sourceWords.length, 1);

    console.log(`✅ ${test.from}→${test.to}→${test.backTo}: 保留度 ${(preservationRate * 100).toFixed(0)}%`);
    stats.passed++;
  } catch (err) {
    stats.failed++;
    console.log(`❌ ${test.from}→${test.to}→${test.backTo}: ${err.message}`);
    stats.errors.push({
      test: `圆形转换: ${test.from}→${test.to}→${test.backTo}`,
      error: err.message,
    });
  }
}

// 输出结果
console.log("\n" + "=".repeat(80));
console.log("测试结果总结");
console.log("=".repeat(80) + "\n");

console.log(`📊 总测试数：${stats.total}`);
console.log(`✅ 通过：${stats.passed}`);
console.log(`❌ 失败：${stats.failed}`);
console.log(`⊘ 跳过：${stats.skipped}`);
console.log(`通过率：${((stats.passed / stats.total) * 100).toFixed(1)}%\n`);

if (stats.errors.length > 0) {
  console.log("错误详情：\n");
  for (const { test, error } of stats.errors) {
    console.log(`  ❌ ${test}`);
    console.log(`     → ${error}\n`);
  }
}

// 格式覆盖矩阵
console.log("\n📋 格式支持矩阵");
console.log("-".repeat(80));
console.log("输入格式：" + formats.input.join(", "));
console.log("输出格式：" + formats.output.join(", "));

// 最终判断
// 修复 issue #74: errors非空时应失败，跳过的测试不计入失败
const passRate = stats.total > 0 ? (stats.passed / stats.total) : 0;
const effectivePassRate = (stats.passed + stats.skipped) / (stats.total + stats.skipped);
if (effectivePassRate >= 0.98 && stats.errors.length === 0) {
  console.log("\n✅ 格式转换验证通过：所有主要格式正常工作\n");
  process.exit(0);
} else {
  console.log(`\n⚠️  格式转换存在问题：通过率 ${(passRate * 100).toFixed(1)}%, ${stats.errors.length} 个错误\n`);
  if (stats.errors.length > 0) {
    console.log("错误详情:");
    stats.errors.forEach(e => console.log(`  - ${e.test}: ${e.error}`));
  }
  process.exit(1);
}
