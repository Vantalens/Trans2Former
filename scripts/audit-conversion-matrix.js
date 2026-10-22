// 全矩阵转换实测：找出乱码、空输出、标记泄漏、结构混乱等真实问题
import * as bt from "../public/browser-transformer.js";

const SAMPLES = {
  md: '# 标题测试\n\n这是一段**中文加粗**文本，含 *斜体* 与 `代码`。\n\n| 名称 | 数量 | 价格 |\n| --- | --- | --- |\n| 苹果 | 3 | ¥5.00 |\n| 香蕉 | 5 | ¥3.50 |\n\n- 列表项一\n- 列表项二\n  - 嵌套项\n\n1. 有序一\n2. 有序二\n\n> 引用文字块\n\n```js\nconsole.log("你好");\n```\n\n[示例链接](https://example.com) 与公式 $a^2+b^2=c^2$\n\n## 二级标题\n\n末尾段落。',
  txt: '第一行纯文本\n第二行：包含中文、English、数字123\n\n空行后的段落',
  html: '<!doctype html><html><head><meta charset="utf-8"><title>测试</title></head><body><h1>标题</h1><p>段落<strong>加粗</strong></p><table><tr><th>列A</th><th>列B</th></tr><tr><td>值1</td><td>值2</td></tr></table><ul><li>项目一</li><li>项目二</li></ul></body></html>',
  json: JSON.stringify({ name: '测试', items: [1, 2, 3], nested: { key: '值' } }),
  csv: '名称,数量,价格\n苹果,3,5.00\n香蕉,5,3.50\n"含,逗号",1,9.99',
  xml: '<?xml version="1.0" encoding="UTF-8"?><root><item id="1">内容一</item><item id="2">内容二</item></root>',
};

// UTF-8 被误读为 Latin-1 的典型特征：高位拉丁引导字节紧跟续字节，或替换符 U+FFFD
const MOJIBAKE_RE = /\uFFFD|(?:[\u00C0-\u00DF][\u0080-\u00BF]){2,}/;
const LEAK_RE = /\{\{|\}\}|__INTERNAL|textRun|\[object Object\]/;

function checkOutput(from, to, res) {
  const issues = [];
  const data = res?.data;
  if (data == null) return ['no-data'];
  let text = null;
  if (typeof data === 'string') text = data;
  else if (data instanceof Uint8Array) {
    if (data.byteLength === 0) return ['empty-binary'];
    // 二进制格式：解码抽样检测乱码（zip 类容器内 XML 应为合法 UTF-8）
    text = Buffer.from(data).toString('utf8');
    if (data.byteLength < 100) issues.push(`tiny-binary:${data.byteLength}B`);
  } else return ['unknown-data-type:' + typeof data];
  if (typeof data === 'string' && data.trim().length === 0) issues.push('empty-string');
  if (text) {
    const moj = text.match(MOJIBAKE_RE);
    if (moj) issues.push('mojibake:' + moj[0]);
    const leak = text.match(LEAK_RE);
    if (leak) issues.push('marker-leak:' + leak[0]);
    if (text.includes('[object Object]')) issues.push('object-leak');
  }
  const warnCodes = (res?.warnings || res?.quality?.warnings || []).map(w => w.code || w);
  if (warnCodes.includes('UNSUPPORTED_CONVERSION_PATH')) issues.push('path-blocked');
  return issues;
}

const inputs = Object.keys(SAMPLES);
const results = [];
for (const from of inputs) {
  const targets = bt.getAllowedOutputFormats(from);
  for (const to of targets) {
    let row = { from, to, status: 'ok', issues: [] };
    try {
      const res = bt.convertContent({ content: SAMPLES[from], from, to, title: 'audit', options: { repair: false } });
      row.issues = checkOutput(from, to, res);
      if (row.issues.length) row.status = 'issue';
    } catch (e) {
      row.status = 'FAIL';
      row.issues = [(e.code || 'ERR') + ': ' + String(e.message).slice(0, 100)];
    }
    results.push(row);
  }
}

let pass = 0, issue = 0, fail = 0;
for (const r of results) {
  if (r.status === 'ok') { pass++; continue; }
  if (r.status === 'FAIL') fail++; else issue++;
  console.log(`${r.status === 'FAIL' ? '❌' : '⚠️'} ${r.from} -> ${r.to}: ${r.issues.join(' | ')}`);
}
console.log(`\n=== 矩阵结果: ${pass} 通过 / ${issue} 有问题 / ${fail} 失败, 共 ${results.length} 条 ===`);
