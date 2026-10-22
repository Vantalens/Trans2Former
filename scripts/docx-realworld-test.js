// DOCX 真实世界兼容性测试：样式继承的列表编号、内置样式名兜底、Title/Subtitle 映射。
// 覆盖 issue：python-docx / Word 内置 List Number / List Bullet 样式只在 styles.xml
// 挂 numPr，段落级没有 <w:numPr>，旧 reader 把编号列表降级成普通段落。
// 运行：node scripts/docx-realworld-test.js（失败时 process.exit(1)）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { convertContent } from "../public/browser-transformer.js";
import { readDocx } from "../public/formats/docx.js";

// --- 最小 stored-zip 构建器（与 scripts/smoke-test.js 的 createStoredZip 同思路） ---
const encoder = new TextEncoder();
const uint16 = (value) => [value & 0xff, (value >> 8) & 0xff];
const uint32 = (value) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];

function createStoredZip(entries) {
  const chunks = [];
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    chunks.push(new Uint8Array([
      ...uint32(0x04034b50), ...uint16(20), ...uint16(0), ...uint16(0),
      ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(data.length),
      ...uint32(data.length), ...uint16(nameBytes.length), ...uint16(0),
    ]));
    chunks.push(nameBytes, data);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

// --- 合成 fixture：样式级 numPr（含 basedOn 继承与 ilvl）、段落级覆盖、名字兜底 ---
// numbering.xml：num 5 → abstract 10（decimal 有序）；num 1 → abstract 20（bullet 无序）。
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="5"/></w:numPr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListBulletSub"><w:name w:val="List Bullet Sub"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="MyCustomList"><w:name w:val="My Custom List"/><w:basedOn w:val="ListNumber"/></w:style>
  <w:style w:type="paragraph" w:styleId="WeirdBullet"><w:name w:val="list  bullet"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="CnNumber"><w:name w:val="列表编号"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:num w:numId="5"><w:abstractNumId w:val="10"/></w:num>
  <w:num w:numId="1"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
  <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>报告标题</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t>副标题说明</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="ListNumber"/></w:pPr><w:r><w:t>第一项</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="ListNumber"/></w:pPr><w:r><w:t>第二项</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>要点甲</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="ListBulletSub"/></w:pPr><w:r><w:t>子项</w:t></w:r></w:p>
  <w:p><w:r><w:t>分隔段落</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="ListNumber"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>段落级优先</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="MyCustomList"/></w:pPr><w:r><w:t>继承项</w:t></w:r></w:p>
  <w:p><w:r><w:t>再分隔</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="WeirdBullet"/></w:pPr><w:r><w:t>名字兜底无序</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="CnNumber"/></w:pPr><w:r><w:t>中文别名有序</w:t></w:r></w:p>
</w:body>
</w:document>`;

function buildFixture() {
  return createStoredZip({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "word/document.xml": DOCUMENT_XML,
    "word/styles.xml": STYLES_XML,
    "word/numbering.xml": NUMBERING_XML,
  });
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

test("样式继承有序编号：pStyle=ListNumber（无段落 numPr）→ ordered list", () => {
  const model = readDocx({ content: buildFixture(), title: "t" });
  const ordered = model.blocks.find((b) => b.type === "list" && b.ordered && b.items.includes("第一项"));
  assert.ok(ordered, "第一项/第二项 应进入有序列表");
  assert.deepEqual(ordered.items, ["第一项", "第二项"], "相邻同样式条目应合并为一个列表");
  assert.deepEqual(ordered.itemMeta.map((m) => m.depth), [0, 0]);
});

test("样式继承无序编号与嵌套 ilvl：ListBullet + 样式级 ilvl=1", () => {
  const model = readDocx({ content: buildFixture(), title: "t" });
  const bullet = model.blocks.find((b) => b.type === "list" && !b.ordered && b.items.includes("要点甲"));
  assert.ok(bullet, "要点甲 应进入无序列表");
  assert.deepEqual(bullet.items, ["要点甲", "子项"]);
  assert.deepEqual(bullet.itemMeta.map((m) => m.depth), [0, 1], "样式级 ilvl=1 应体现为嵌套深度");
});

test("段落级 numPr 优先于样式级：ListNumber 样式 + 段落 numId=1(bullet) → 无序", () => {
  const model = readDocx({ content: buildFixture(), title: "t" });
  const block = model.blocks.find((b) => b.type === "list" && b.items.includes("段落级优先"));
  assert.ok(block, "段落级 numPr 的条目必须是列表");
  assert.equal(block.ordered, false, "段落级 numId=1 是 bullet，应覆盖样式的 decimal");
});

test("basedOn 继承链：自定义样式 basedOn=ListNumber → 继承其 numId", () => {
  const model = readDocx({ content: buildFixture(), title: "t" });
  const block = model.blocks.find((b) => b.type === "list" && b.items.includes("继承项"));
  assert.ok(block, "basedOn 链上的样式应继承编号");
  assert.equal(block.ordered, true, "继承 ListNumber 的 numId=5（decimal）应为有序");
});

test("样式名兜底：样式无 numPr 时按 w:name 分类（含空格差异与中文别名）", () => {
  const model = readDocx({ content: buildFixture(), title: "t" });
  const bullet = model.blocks.find((b) => b.type === "list" && b.items.includes("名字兜底无序"));
  assert.ok(bullet, '"list  bullet"（多空格）应识别为 List Bullet');
  assert.equal(bullet.ordered, false);
  const cn = model.blocks.find((b) => b.type === "list" && b.items.includes("中文别名有序"));
  assert.ok(cn, '中文别名 "列表编号" 应识别为 List Number');
  assert.equal(cn.ordered, true);
});

test("Title/Subtitle 映射为标题：Title → level 1，Subtitle → level 2（不被误判为列表）", () => {
  const model = readDocx({ content: buildFixture(), title: "t" });
  const title = model.blocks.find((b) => b.text === "报告标题");
  assert.ok(title?.type === "heading" && title.level === 1, `Title 应为一级标题，实际 ${title?.type}/${title?.level}`);
  const subtitle = model.blocks.find((b) => b.text === "副标题说明");
  assert.ok(subtitle?.type === "heading" && subtitle.level === 2, `Subtitle 应为二级标题，实际 ${subtitle?.type}/${subtitle?.level}`);
});

test("Subtitle 样式里无 numId 的 numPr 不产生列表（ECMA-376：缺省 numId=0 即无编号）", () => {
  const model = readDocx({ content: buildFixture(), title: "t" });
  assert.ok(!model.blocks.some((b) => b.type === "list" && b.items.includes("副标题说明")));
});

test("真实样本回归：report.docx → md 含 # 标题与 1./2./3. 编号", () => {
  const content = new Uint8Array(readFileSync("samples/realworld/report.docx"));
  const { data } = convertContent({ content, from: "docx", to: "md", title: "report.docx" });
  const md = String(data);
  assert.match(md, /^# 季度运营报告/m, "Title 样式应转为一级标题");
  assert.match(md, /^1\. 完成客户回访/m, "ListNumber 第 1 项");
  assert.match(md, /^2\. 更新产品手册/m, "ListNumber 第 2 项");
  assert.match(md, /^3\. 筹备年度会议/m, "ListNumber 第 3 项");
});

test("真实样本回归：report.docx → txt 保留编号文本", () => {
  const content = new Uint8Array(readFileSync("samples/realworld/report.docx"));
  const { data } = convertContent({ content, from: "docx", to: "txt", title: "report.docx" });
  assert.match(String(data), /1\. 完成客户回访/);
});

test("fixture 回归：docx-small.docx 段落级 numPr 列表不受影响（10 项、层级不变）", () => {
  const content = new Uint8Array(readFileSync("samples/generated/small/docx-small.docx"));
  const model = readDocx({ content, title: "t" });
  const lists = model.blocks.filter((b) => b.type === "list");
  const itemCount = lists.reduce((sum, l) => sum + l.items.length, 0);
  assert.equal(itemCount, 10, `docx-small 应有 10 个列表项，实际 ${itemCount}`);
  const { data } = convertContent({ content, from: "docx", to: "md", title: "docx-small.docx" });
  const md = String(data);
  assert.match(md, /^\d+\. /m, "有序列表编号应保留");
  assert.ok(!md.includes("listparagraph"), "ListParagraph 样式名不应泄漏到输出");
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(`      ${String(error.message).split("\n")[0]}`);
  }
}

if (failed > 0) {
  console.error(`docx-realworld-test: ${failed}/${tests.length} failed`);
  process.exit(1);
}
console.log(`DOCX real-world test passed: ${tests.length} cases completed.`);
