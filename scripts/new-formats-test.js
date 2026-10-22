#!/usr/bin/env node
// 新增格式（YAML / TOML / IPYNB / RTF / LaTeX）端到端读写测试：
// 覆盖基本转换、round-trip、警告披露与中文乱码防护（输出不得出现 U+FFFD）。
import assert from "node:assert/strict";

import {
  convertContent,
  getAllowedOutputFormats,
  listFormats,
  toDocumentModel,
} from "../public/browser-transformer.js";
import { parseYaml } from "../public/formats/yaml.js";
import { parseToml } from "../public/formats/toml.js";
import { validateDocumentModel } from "../public/core/document-schema.js";

const MOJIBAKE_RE = new RegExp("\\uFFFD");

function assertNoMojibake(data, label) {
  assert.equal(MOJIBAKE_RE.test(String(data)), false, `${label} must not contain U+FFFD replacement characters`);
}

// ---------- YAML ----------
{
  const yaml = [
    "name: 测试应用",
    "version: 1.2",
    "debug: true",
    "server:",
    "  host: 中文主机",
    "  port: 8080",
    "features:",
    "  - 登录",
    "  - 导出",
  ].join("\n");
  const model = toDocumentModel(yaml, "yaml", "app.yaml");
  assert.equal(validateDocumentModel(model).ok, true);
  const table = model.blocks.find((block) => block.type === "table");
  assert.ok(table, "YAML mapping should map into a key/value table");
  const rowMap = new Map(table.rows.map((row) => [row[0], row[1]]));
  assert.equal(rowMap.get("name"), "测试应用");
  assert.equal(rowMap.get("server.host"), "中文主机");
  assert.equal(rowMap.get("server.port"), "8080");
  assert.equal(rowMap.get("debug"), "true");

  // Uint8Array 输入必须经文本解码而不是变成数字串（TEXT_CONTENT_FORMATS 覆盖）
  const bytes = new TextEncoder().encode(yaml);
  const byteModel = toDocumentModel(bytes, "yaml", "app.yaml");
  const byteTable = byteModel.blocks.find((block) => block.type === "table");
  assert.equal(new Map(byteTable.rows.map((row) => [row[0], row[1]])).get("name"), "测试应用");

  for (const to of getAllowedOutputFormats("yaml")) {
    const result = convertContent({ content: yaml, from: "yaml", to, title: "app.yaml", fileName: "app.yaml" });
    assert.equal(result.format, to);
    assertNoMojibake(result.type === "text" ? result.data : "", `yaml -> ${to}`);
  }

  // round-trip：写出的 YAML 必须能被解析回等价结构
  const out = convertContent({ content: yaml, from: "yaml", to: "yaml", title: "app.yaml" });
  const reparsed = parseYaml(out.data).value;
  assert.equal(reparsed.name, "测试应用");
  assert.equal(reparsed.server.host, "中文主机");
  assert.equal(reparsed.server.port, 8080);
  assert.deepEqual(reparsed.features, ["登录", "导出"]);
  assert.equal(reparsed.debug, true);

  // 高级特性：锚点/别名剥离并登记 warning，不静默成功
  const anchored = toDocumentModel("base: &b 1\nref: *b\n", "yaml", "a.yaml");
  const codes = (anchored.metadata.warnings || []).map((warning) => warning.code);
  assert.ok(codes.includes("YAML_ALIAS_UNRESOLVED"), "alias must be disclosed");

  assert.throws(() => toDocumentModel("key: [1, 2\nother: x\n", "yaml", "bad.yaml"), /YAML 解析失败/);
}

// ---------- TOML ----------
{
  const toml = [
    'title = "配置示例"',
    "",
    "[server]",
    'host = "中文主机"',
    "port = 8080",
    "enabled = true",
    "",
    "[deps]",
    "versions = [1, 2, 3]",
    "",
    "[[plugins]]",
    'name = "认证"',
    "",
    "[[plugins]]",
    'name = "日志"',
  ].join("\n");
  const model = toDocumentModel(toml, "toml", "c.toml");
  assert.equal(validateDocumentModel(model).ok, true);
  const table = model.blocks.find((block) => block.type === "table");
  const rowMap = new Map(table.rows.map((row) => [row[0], row[1]]));
  assert.equal(rowMap.get("server.host"), "中文主机");
  assert.equal(rowMap.get("server.port"), "8080");

  const out = convertContent({ content: toml, from: "toml", to: "toml", title: "c.toml" });
  const reparsed = parseToml(out.data).value;
  assert.equal(reparsed.title, "配置示例");
  assert.equal(reparsed.server.host, "中文主机");
  assert.equal(reparsed.server.port, 8080);
  assert.equal(reparsed.server.enabled, true);
  assert.deepEqual(reparsed.deps.versions, [1, 2, 3]);
  assert.deepEqual(reparsed.plugins.map((entry) => entry.name), ["认证", "日志"]);

  for (const to of getAllowedOutputFormats("toml")) {
    const result = convertContent({ content: toml, from: "toml", to, title: "c.toml", fileName: "c.toml" });
    assert.equal(result.format, to);
    if (result.type === "text") assertNoMojibake(result.data, `toml -> ${to}`);
  }

  assert.throws(() => toDocumentModel("a = 1\na = 2\n", "toml", "dup.toml"), /TOML 解析失败/);
}

// ---------- IPYNB ----------
{
  const notebook = JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { language_info: { name: "python" } },
    cells: [
      { cell_type: "markdown", metadata: {}, source: ["# 实验笔记\n", "\n", "这是**实验**说明。"] },
      {
        cell_type: "code",
        execution_count: 1,
        metadata: {},
        source: ["print('你好')"],
        outputs: [{ output_type: "stream", name: "stdout", text: ["你好\n"] }],
      },
    ],
  });
  const model = toDocumentModel(notebook, "ipynb", "n.ipynb");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.ok(model.blocks.some((block) => block.type === "heading" && block.text === "实验笔记"));
  const codeBlock = model.blocks.find((block) => block.type === "code" && block.language === "python");
  assert.ok(codeBlock, "code cell should map to a python code block");
  const outputBlock = model.blocks.find((block) => block.type === "code" && block.language === "output");
  assert.equal(outputBlock.code.trim(), "你好");
  assert.ok(
    (model.metadata.warnings || []).some((warning) => warning.code === "IPYNB_OUTPUTS_INCLUDED"),
    "included outputs must be disclosed",
  );

  const out = convertContent({ content: notebook, from: "ipynb", to: "ipynb", title: "n.ipynb" });
  const written = JSON.parse(out.data);
  assert.equal(written.nbformat, 4);
  assert.equal(written.nbformat_minor, 5);
  assert.ok(Array.isArray(written.cells));
  assert.ok(written.cells.some((cell) => cell.cell_type === "code" && /你好/.test([].concat(cell.source).join(""))));
  assert.ok(written.cells.every((cell) => cell.cell_type !== "code" || Array.isArray(cell.outputs)));
  assertNoMojibake(out.data, "ipynb -> ipynb");

  const mdOut = convertContent({ content: notebook, from: "ipynb", to: "md", title: "n.ipynb" });
  assert.match(mdOut.data, /# 实验笔记/);
  assert.match(mdOut.data, /```python/);

  assert.throws(() => toDocumentModel('{"nbformat": 4}', "ipynb", "bad.ipynb"), /IPYNB 解析失败/);
  assert.throws(() => toDocumentModel("not json", "ipynb", "bad.ipynb"), /IPYNB 解析失败/);
}

// ---------- RTF（只读） ----------
{
  const rtf = String.raw`{\rtf1\ansi\ansicpg65001\deff0{\fonttbl{\f0 Arial;}}\f0\fs24 Hello World\par \b 加粗\b0\par \'e4\'b8\'ad\'e6\'96\'87\par \u20013?\u27979?\par}`;
  const model = toDocumentModel(rtf, "rtf", "a.rtf");
  assert.equal(validateDocumentModel(model).ok, true);
  const texts = model.blocks.map((block) => block.text);
  assert.ok(texts.includes("Hello World"));
  assert.ok(texts.includes("加粗"));
  assert.ok(texts.includes("中文"));
  assert.ok(texts.includes("中测"));
  assert.ok(
    (model.metadata.warnings || []).some((warning) => warning.code === "RTF_BEST_EFFORT_TEXT"),
    "RTF best-effort extraction must be disclosed",
  );

  for (const to of getAllowedOutputFormats("rtf")) {
    const result = convertContent({ content: rtf, from: "rtf", to, title: "a.rtf", fileName: "a.rtf" });
    assert.equal(result.format, to);
    if (result.type === "text") {
      assertNoMojibake(result.data, `rtf -> ${to}`);
      assert.match(result.data, /Hello World/);
    }
  }

  // RTF 只读：不得出现在任何输出路径中，writer 未注册
  assert.equal(listFormats().output.includes("rtf"), false, "RTF writer must stay unregistered");
  for (const from of listFormats().input) {
    assert.equal(getAllowedOutputFormats(from).includes("rtf"), false, `${from} -> rtf must not be advertised`);
  }
  assert.throws(
    () => convertContent({ content: "# t", from: "md", to: "rtf", title: "t.md" }),
    /输出格式不支持|不支持此转换路径/,
  );
  assert.throws(() => toDocumentModel("plain text", "rtf", "bad.rtf"), /RTF 解析失败/);
}

// ---------- LaTeX ----------
{
  const tex = String.raw`\documentclass{article}
\title{中文标题}
\begin{document}
\maketitle
\section{引言}
这是一段文本，包含 \textbf{加粗} 与 100\% 比例。

\subsection{方法}
\begin{itemize}
\item 第一项
\item 第二项
\end{itemize}
\begin{verbatim}
code 中文注释
\end{verbatim}
\[
a^2 + b^2 = c^2
\]
\end{document}
`;
  const model = toDocumentModel(tex, "latex", "doc.tex");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.ok(model.blocks.some((block) => block.type === "heading" && block.level === 1 && block.text === "引言"));
  assert.ok(model.blocks.some((block) => block.type === "heading" && block.level === 2 && block.text === "方法"));
  assert.ok(model.blocks.some((block) => block.type === "list" && block.items.includes("第一项")));
  assert.ok(model.blocks.some((block) => block.type === "code" && block.code.includes("code 中文注释")));
  assert.ok(model.blocks.some((block) => block.type === "paragraph" && block.text.includes("a^2 + b^2 = c^2")));

  const out = convertContent({ content: tex, from: "latex", to: "latex", title: "doc.tex" });
  assert.match(out.data, /\\documentclass\{article\}/);
  assert.match(out.data, /\\begin\{document\}/);
  assert.match(out.data, /\\end\{document\}/);
  assert.match(out.data, /\\section\{引言\}/);
  assert.match(out.data, /\\begin\{itemize\}/);
  assert.match(out.data, /\\begin\{verbatim\}/);
  assertNoMojibake(out.data, "latex -> latex");

  for (const to of getAllowedOutputFormats("latex")) {
    const result = convertContent({ content: tex, from: "latex", to, title: "doc.tex", fileName: "doc.tex" });
    assert.equal(result.format, to);
    if (result.type === "text") assertNoMojibake(result.data, `latex -> ${to}`);
  }
}

// ---------- 注册表接线 ----------
{
  for (const format of ["yaml", "toml", "ipynb", "rtf", "latex"]) {
    assert.ok(listFormats().input.includes(format), `${format} must be a registered input`);
  }
  for (const format of ["yaml", "toml", "ipynb", "latex"]) {
    assert.ok(listFormats().output.includes(format), `${format} must be a registered output`);
  }
}

console.log("New formats test passed: YAML/TOML/IPYNB read+write, RTF read-only, LaTeX basic read+write, no mojibake.");
