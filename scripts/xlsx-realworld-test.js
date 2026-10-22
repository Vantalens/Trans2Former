#!/usr/bin/env node

/**
 * XLSX 真实世界兼容性测试
 *
 * 覆盖 openpyxl / 部分 Excel 导出文件的真实写法：
 * - t="inlineStr" 内联字符串（含 &#26376; 数字字符引用）
 * - 缺失 xl/sharedStrings.xml
 * - rels 包根绝对路径 Target="/xl/worksheets/sheet1.xml"
 * - 公式单元格 <f> 无缓存 <v>（保留公式文本）
 * - t="str" 公式字符串缓存 / t="b" 布尔 / t="e" 错误值
 * - 自闭合空单元格 <c r="B1"/> 的列对齐
 * - 现有 sharedStrings（t="s"）+ 日期样式路径回归
 * - samples/realworld/sales.xlsx 端到端 xlsx->md
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { readXlsx } from "../public/formats/xlsx.js";
import { writeStoredZip } from "../public/core/zip-writer.js";
import * as bt from "../public/browser-transformer.js";

const NS = "http://schemas.openxmlformats.org";

console.log("XLSX Real-World Compatibility Test\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ❌ ${name}`);
    console.error(`     ${String(error.message).split("\n")[0]}`);
  }
}

/**
 * 构造最小 xlsx 包。readXlsx 只读 workbook.xml / rels / sharedStrings / styles / sheets，
 * 不需要 [Content_Types].xml。
 * relTargetMode: "absolute" 模拟 openpyxl 的包根绝对路径；"relative" 模拟经典相对路径。
 */
function buildXlsx({ sheetXml, sharedStringsXml = null, stylesXml = null, relTargetMode = "absolute", sheetName = "Sheet1" }) {
  const target = relTargetMode === "absolute" ? "/xl/worksheets/sheet1.xml" : "worksheets/sheet1.xml";
  const files = [
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="${target}"/></Relationships>`,
    },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
  ];
  if (sharedStringsXml) files.push({ name: "xl/sharedStrings.xml", data: sharedStringsXml });
  if (stylesXml) files.push({ name: "xl/styles.xml", data: stylesXml });
  return writeStoredZip(files);
}

function sheetXml(innerRows, extra = "") {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}/spreadsheetml/2006/main"><sheetData>${innerRows}</sheetData>${extra}</worksheet>`;
}

function firstSheet(model) {
  const sheet = model.workbook?.sheets?.[0];
  assert.ok(sheet, "workbook model 应该有第一个 sheet");
  return sheet;
}

// 1. openpyxl 风格：inlineStr + 数字字符引用 + 无 sharedStrings.xml + 绝对路径 rel target
await test("inlineStr + 无 sharedStrings.xml + 包根绝对路径 target（openpyxl 风格）", () => {
  const content = buildXlsx({
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" s="1" t="inlineStr"><is><t>&#26376;&#20221;</t></is></c><c r="B1" t="inlineStr"><is><t>Sales</t></is></c></row>` +
      `<row r="2"><c r="A2" t="inlineStr"><is><t>&#19968;&#26376;</t></is></c><c r="B2" t="n"><v>12500</v></c></row>`
    ),
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.headers, ["月份", "Sales"]);
  assert.deepEqual(sheet.rows, [["一月", "12500"]]);
});

// 2. 现有 sharedStrings（t="s"）路径回归 + 相对路径 rel target + 命名实体
await test("sharedStrings t=\"s\" 回归（相对路径 target + 命名实体解码）", () => {
  const content = buildXlsx({
    relTargetMode: "relative",
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
      `<row r="2"><c r="A2"><v>42</v></c><c r="B2"><v>3.5</v></c></row>`
    ),
    sharedStringsXml:
      `<?xml version="1.0"?><sst xmlns="${NS}/spreadsheetml/2006/main" count="2" uniqueCount="2">` +
      `<si><t>姓名</t></si><si><t>Dept &amp; Sales</t></si></sst>`,
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.headers, ["姓名", "Dept & Sales"]);
  assert.deepEqual(sheet.rows, [["42", "3.5"]]);
});

// 3. 数字/日期样式回归：numFmtId=14（内置日期）转 ISO，普通数字原样
await test("数字/日期样式回归（numFmtId=14 转 ISO 日期）", () => {
  const content = buildXlsx({
    relTargetMode: "relative",
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
      `<row r="2"><c r="A2" s="1"><v>44927</v></c><c r="B2"><v>12500</v></c></row>`
    ),
    sharedStringsXml:
      `<?xml version="1.0"?><sst xmlns="${NS}/spreadsheetml/2006/main" count="2" uniqueCount="2">` +
      `<si><t>日期</t></si><si><t>金额</t></si></sst>`,
    stylesXml:
      `<?xml version="1.0"?><styleSheet xmlns="${NS}/spreadsheetml/2006/main">` +
      `<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>` +
      `<cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="14" xfId="0"/></cellXfs></styleSheet>`,
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.rows, [["2023-01-01", "12500"]]);
});

// 4. 公式无缓存 <v>：保留公式文本，不出现悬空的 "=>"
await test("公式单元格 <f> 无缓存 <v> 时保留公式文本", () => {
  const content = buildXlsx({
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>v</t></is></c></row>` +
      `<row r="2"><c r="A2"><f>C2*1.1</f><v></v></c><c r="B2"><f>SUM(1,2)</f></c></row>`
    ),
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.rows[0], ["=C2*1.1", "=SUM(1,2)"]);
  assert.equal(sheet.formulas.length, 2);
  assert.equal(sheet.formulas[0].expression, "C2*1.1");
  assert.equal(sheet.formulas[0].cachedValue, "");
});

// 5. 公式有数字缓存值：保持 "=expr => cached" 显示
await test("公式单元格有缓存值时显示 =expr => cached", () => {
  const content = buildXlsx({
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>v</t></is></c></row>` +
      `<row r="2"><c r="A2"><f>SUM(B2:B3)</f><v>26300</v></c></row>`
    ),
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.rows[0], ["=SUM(B2:B3) => 26300"]);
  assert.equal(sheet.formulas[0].cachedValue, "26300");
});

// 6. t="str"：公式字符串缓存，含命名实体解码
await test("t=\"str\" 公式字符串结果", () => {
  const content = buildXlsx({
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>v</t></is></c></row>` +
      `<row r="2"><c r="A2" t="str"><f>CONCATENATE(B2,C2)</f><v>结果 &amp; 文本</v></c></row>`
    ),
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.rows[0], ["=CONCATENATE(B2,C2) => 结果 & 文本"]);
  assert.equal(sheet.formulas[0].cachedValue, "结果 & 文本");
});

// 7. t="b" 布尔：1→TRUE，0→FALSE
await test("t=\"b\" 布尔值", () => {
  const content = buildXlsx({
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>flag</t></is></c></row>` +
      `<row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="b"><v>0</v></c></row>`
    ),
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.rows[0], ["TRUE", "FALSE"]);
});

// 8. t="e" 错误值：原文保留，不做日期转换
await test("t=\"e\" 错误值", () => {
  const content = buildXlsx({
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>err</t></is></c></row>` +
      `<row r="2"><c r="A2" t="e"><v>#DIV/0!</v></c><c r="B2" t="e"><v>#N/A</v></c></row>`
    ),
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.rows[0], ["#DIV/0!", "#N/A"]);
});

// 9. t="s" 但 sharedStrings.xml 缺失：优雅降级为空，不崩溃
await test("t=\"s\" 但缺失 sharedStrings.xml 时优雅降级", () => {
  const content = buildXlsx({
    sheetXml: sheetXml(`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>7</v></c></row>`),
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.headers, ["", "7"]);
});

// 10. t="s" 且无缓存 <v>：不能错取 sharedStrings[0]
await test("t=\"s\" 无缓存 <v> 不错取 sharedStrings[0]", () => {
  const content = buildXlsx({
    relTargetMode: "relative",
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
      `<row r="2"><c r="A2" t="s"><f>LEN(B2)</f></c></row>`
    ),
    sharedStringsXml:
      `<?xml version="1.0"?><sst xmlns="${NS}/spreadsheetml/2006/main" count="1" uniqueCount="1">` +
      `<si><t>表头</t></si></sst>`,
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.headers, ["表头"]);
  assert.deepEqual(sheet.rows[0], ["=LEN(B2)"]);
});

// 11. 自闭合空单元格 <c r="B1"/>：列对齐不错位
await test("自闭合空单元格列对齐", () => {
  const content = buildXlsx({
    relTargetMode: "relative",
    sheetXml: sheetXml(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"/><c r="C1" t="s"><v>1</v></c></row>`
    ),
    sharedStringsXml:
      `<?xml version="1.0"?><sst xmlns="${NS}/spreadsheetml/2006/main" count="2" uniqueCount="2">` +
      `<si><t>第一列</t></si><si><t>第三列</t></si></sst>`,
  });
  const sheet = firstSheet(readXlsx({ content, title: "t" }));
  assert.deepEqual(sheet.headers, ["第一列", "", "第三列"]);
});

// 12. 真实样本端到端：samples/realworld/sales.xlsx -> md
await test("真实样本 sales.xlsx（openpyxl 生成）xlsx->md 端到端", async () => {
  const buf = new Uint8Array(readFileSync("samples/realworld/sales.xlsx"));

  const model = readXlsx({ content: buf, title: "sales" });
  const sheet = firstSheet(model);
  assert.deepEqual(sheet.headers, ["月份", "销售额", "增长率"]);
  // 缺失的尾部单元格（C2、B6:C6）不补齐，数组长度到最后一个实际存在的列
  assert.deepEqual(sheet.rows[0], ["一月", "12500"]);
  assert.deepEqual(sheet.rows[1], ["二月", "13800", "=C2*1.1"]);
  assert.deepEqual(sheet.rows[3], ["备注：数据截至季度末"]);
  assert.deepEqual(sheet.merges, [{ from: "A6", to: "C6" }]);

  const res = await bt.convertContentAsync({ content: buf, from: "xlsx", to: "md", title: "sales", options: { repair: false } });
  const md = typeof res.data === "string" ? res.data : Buffer.from(res.data).toString("utf8");
  for (const keyword of ["月份", "销售额", "一月", "12500", "二月", "13800", "备注：数据截至季度末"]) {
    assert.ok(md.includes(keyword), `md 输出应包含 "${keyword}"`);
  }
  assert.ok(md.includes("|"), "md 输出应该是表格");
});

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  console.error("❌ XLSX real-world compatibility test FAILED");
  process.exit(1);
}
console.log("✅ XLSX real-world compatibility test PASSED");
