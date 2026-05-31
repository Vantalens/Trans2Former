// 优质测试样例内容生成器（纯函数，确定性）。供 generate-samples.js 写盘和
// sample-corpus-test.js 小规模回归共用。每个 builder 接受 scale（章节重复次数），
// 用来产出大小不一的复杂样例：scale=1 小，scale≈120 中（~300KB），scale≈1300 大（≥3MB）。

export const SIZE_TIERS = Object.freeze({
  small: 1,
  medium: 120,
  large: 1300,
});

// 复杂文本素材：中英文、RTL、emoji、标点、实体、长词。确定性、无随机。
const PARAGRAPH_SNIPPETS = [
  "Trans2Former 是一个**本地优先**、_零上传_的多格式文档转换工作台，强调确定性算法转换、本地 OCR 与转换后质量检验。",
  "The quick brown fox jumps over the lazy dog while 中文、日本語、한국어 and emoji 🚀📄✅ coexist in one paragraph.",
  "数学近似：E = mc^2，π ≈ 3.14159，∑(1/n^2) = π²/6；货币 $1,234.56 / €987,65 / ¥10000。",
  "RTL 混排：العربية والعبرية טקסט مع English inline，验证双向文本不破坏块结构。",
  "特殊字符与实体：< > & \" ' © ® ™ — – … « » 「」『』，以及 HTML 实体 &amp; &lt; &copy; 的往返保真。",
  "Edge tokens: supercalifragilisticexpialidocious, a_very_long_snake_case_identifier_that_should_not_wrap_oddly, and URLs like https://example.com/path?query=1&lang=zh#frag.",
];

const CODE_SAMPLES = [
  { lang: "javascript", code: "export function convert(input) {\n  const model = read(input);\n  return write(model); // round-trip\n}" },
  { lang: "python", code: "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a  # 斐波那契" },
  { lang: "json", code: "{\n  \"name\": \"trans2former\",\n  \"local\": true,\n  \"formats\": [\"md\", \"pdf\", \"docx\"]\n}" },
  { lang: "sql", code: "SELECT id, name FROM docs WHERE lang = 'zh-CN' ORDER BY created_at DESC;" },
];

function repeatedField(base, index) {
  return `${base}-${String(index).padStart(5, "0")}`;
}

export function buildComplexMarkdown(scale = 1) {
  const parts = [];
  parts.push("# Trans2Former 综合能力测试样例\n");
  parts.push("> 本文件由 `scripts/generate-samples.js` 程序化生成，用于压力测试转换、版面与检验能力。\n");
  parts.push("[TOC]\n");
  for (let s = 0; s < scale; s += 1) {
    const n = s + 1;
    parts.push(`## 第 ${n} 章 · 复杂排版段落\n`);
    for (const snippet of PARAGRAPH_SNIPPETS) {
      parts.push(`${snippet}\n`);
    }
    parts.push(`### ${n}.1 列表与任务\n`);
    parts.push("- 无序项 A\n  - 嵌套项 A.1\n    - 深层项 A.1.a\n- 无序项 B\n");
    parts.push("1. 有序项一\n2. 有序项二\n   1. 子项 2.1\n   2. 子项 2.2\n");
    parts.push("- [x] 已完成任务\n- [ ] 待办任务\n");
    parts.push(`### ${n}.2 表格（含对齐 + 中文 + 数字）\n`);
    parts.push("| 左对齐 | 居中 | 右对齐 |\n| :--- | :---: | ---: |\n");
    for (let r = 0; r < 6; r += 1) {
      parts.push(`| ${repeatedField("项目", n * 10 + r)} | 状态-${r} | ${(r * 1234.5).toFixed(2)} |\n`);
    }
    parts.push("\n");
    const code = CODE_SAMPLES[s % CODE_SAMPLES.length];
    parts.push(`### ${n}.3 代码块（${code.lang}）\n`);
    parts.push("```" + code.lang + "\n" + code.code + "\n```\n");
    parts.push("> 引用块：转换核心围绕 `input -> canonical model -> mapper route -> QualityReport -> output`。\n>> 嵌套引用：规则 diff + SSIM + OCR 回读 三层检验。\n");
    parts.push(`![示意图 ${n}](https://example.com/img/${n}.png "图 ${n}")\n`);
    parts.push("脚注引用[^note" + n + "]，行内 `code`、**粗体**、*斜体*、~~删除线~~ 与 [链接](https://example.com)。\n");
    parts.push(`[^note${n}]: 第 ${n} 章脚注内容，验证脚注往返。\n`);
    parts.push("\n---\n\n");
  }
  return parts.join("\n");
}

export function buildComplexHtml(scale = 1) {
  const parts = [];
  parts.push("<!DOCTYPE html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>综合 HTML 样例</title></head><body>");
  parts.push("<h1>Trans2Former HTML 能力测试</h1>");
  for (let s = 0; s < scale; s += 1) {
    const n = s + 1;
    parts.push(`<section><h2>第 ${n} 节</h2>`);
    for (const snippet of PARAGRAPH_SNIPPETS) {
      parts.push(`<p>${snippet.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`);
    }
    parts.push("<ul><li>无序 A<ul><li>嵌套 A.1</li></ul></li><li>无序 B</li></ul>");
    parts.push("<ol><li>有序一</li><li>有序二<ol><li>子 2.1</li></ol></li></ol>");
    parts.push("<table><thead><tr><th>列1</th><th>列2</th><th>列3</th></tr></thead><tbody>");
    for (let r = 0; r < 6; r += 1) {
      parts.push(`<tr><td>${repeatedField("单元", n * 10 + r)}</td><td>${r}</td><td>${(r * 99.9).toFixed(2)}</td></tr>`);
    }
    parts.push("</tbody></table>");
    const code = CODE_SAMPLES[s % CODE_SAMPLES.length];
    parts.push(`<pre><code class="language-${code.lang}">${code.code.replace(/</g, "&lt;")}</code></pre>`);
    parts.push("<blockquote><p>引用：本地优先、零上传。</p></blockquote>");
    parts.push(`<figure><img src="https://example.com/img/${n}.png" alt="图 ${n}"><figcaption>图 ${n}</figcaption></figure></section>`);
  }
  parts.push("</body></html>");
  return parts.join("\n");
}

export function buildComplexJson(scale = 1) {
  const records = [];
  for (let s = 0; s < scale; s += 1) {
    records.push({
      id: repeatedField("doc", s),
      title: `文档 ${s + 1} · Document ${s + 1}`,
      tags: ["中文", "english", "العربية", "emoji-🚀"],
      meta: {
        author: `作者-${s}`,
        nested: { level: 3, values: [s, s * 2, s * 3], note: "深层嵌套 nested object" },
        unicode: "特殊字符 < > & \" ' © — …",
      },
      sections: PARAGRAPH_SNIPPETS.map((text, i) => ({ index: i, text })),
    });
  }
  return JSON.stringify({ schema: "trans2former.sample.v1", count: records.length, records }, null, 2);
}

export function buildComplexXml(scale = 1) {
  const parts = [];
  parts.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
  parts.push("<library xmlns:meta=\"https://example.com/meta\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\">");
  for (let s = 0; s < scale; s += 1) {
    const n = s + 1;
    parts.push(`  <book id="b-${n}" lang="zh-CN">`);
    parts.push(`    <dc:title>复杂书目 ${n} &amp; Title ${n}</dc:title>`);
    parts.push(`    <meta:author role="primary">作者 ${n}</meta:author>`);
    parts.push(`    <description><![CDATA[ 含 <markup> 与 & 符号的 CDATA 段，第 ${n} 条。 ]]></description>`);
    parts.push("    <tags><tag>中文</tag><tag>english</tag><tag>emoji-🚀</tag></tags>");
    parts.push(`    <price currency="CNY">${(n * 12.5).toFixed(2)}</price>`);
    parts.push("  </book>");
  }
  parts.push("</library>");
  return parts.join("\n");
}

export function buildComplexCsv(scale = 1) {
  const rows = [];
  rows.push("id,名称,description,price,tags,note");
  for (let s = 0; s < scale; s += 1) {
    for (let r = 0; r < 6; r += 1) {
      const idx = s * 6 + r;
      const desc = `含逗号, 引号"和换行\n的字段 ${idx}`;
      const tags = "中文;english;🚀";
      rows.push(`${idx},"产品 ${idx}","${desc.replace(/"/g, "\"\"")}",${(idx * 3.14).toFixed(2)},"${tags}","note ${idx} — 特殊字符 < > &"`);
    }
  }
  return rows.join("\n");
}

export function buildComplexText(scale = 1) {
  const parts = [];
  parts.push("Trans2Former 纯文本能力测试样例");
  parts.push("=".repeat(60));
  for (let s = 0; s < scale; s += 1) {
    const n = s + 1;
    parts.push(`\n[第 ${n} 段]`);
    for (const snippet of PARAGRAPH_SNIPPETS) {
      // 去掉 markdown 标记，纯文本
      parts.push(snippet.replace(/[*_~`#>]/g, ""));
    }
    parts.push("超长单行：" + "长词".repeat(200) + " end-of-line-" + n);
    parts.push("制表符\t分隔\t列1\t列2\t列3");
  }
  return parts.join("\n");
}

// 把某个 builder 反复扩到至少 targetBytes 字节（用于精确逼近 3MB）。
export function buildToTargetBytes(builder, targetBytes) {
  let scale = 1;
  let content = builder(scale);
  const perScale = Buffer.byteLength(builder(2), "utf8") - Buffer.byteLength(builder(1), "utf8");
  if (perScale > 0) {
    scale = Math.max(1, Math.ceil(targetBytes / perScale));
    content = builder(scale);
    while (Buffer.byteLength(content, "utf8") < targetBytes) {
      scale = Math.ceil(scale * 1.15) + 1;
      content = builder(scale);
    }
  }
  return { content, scale };
}

export const TEXT_BUILDERS = Object.freeze({
  md: buildComplexMarkdown,
  html: buildComplexHtml,
  json: buildComplexJson,
  xml: buildComplexXml,
  csv: buildComplexCsv,
  txt: buildComplexText,
});
