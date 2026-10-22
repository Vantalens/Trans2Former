// 生成 ODT 样本 fixture：用核心 writer 产出合法 ODT，再落盘为二进制 .odt 与
// smoke-test 使用的 data-url 文本两种形态。
import { writeFile } from "node:fs/promises";

import { writeOdt } from "../public/formats/odt.js";
import {
  createDocumentModel,
  createHeading,
  createList,
  createParagraph,
  createTable,
} from "../public/core/document-model.js";

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).match(/^data:[^;]+;base64,(.+)$/)?.[1] || "";
  return new Uint8Array(Buffer.from(base64, "base64"));
}

const fixtures = {
  basic: createDocumentModel({
    title: "ODT 基础样例",
    sourceFormat: "manual",
    blocks: [
      createHeading(1, "ODT 基础样例"),
      createParagraph("这是一段中文正文，用于验证 ODT 写出与读取的基本通路。"),
      createParagraph("Second paragraph in English."),
    ],
  }),
  "heading-list": createDocumentModel({
    title: "标题与列表",
    sourceFormat: "manual",
    blocks: [
      createHeading(1, "标题与列表"),
      createHeading(2, "章节"),
      createList(["第一项", "第二项", "嵌套子项"], false, [
        { depth: 0, marker: "" },
        { depth: 0, marker: "" },
        { depth: 1, marker: "" },
      ]),
      createList(["步骤一", "步骤二"], true),
    ],
  }),
  table: createDocumentModel({
    title: "表格样例",
    sourceFormat: "manual",
    blocks: [
      createHeading(1, "表格样例"),
      createTable(["名称", "数量"], [["苹果", "3"], ["香蕉", "5"]]),
    ],
  }),
};

for (const [name, model] of Object.entries(fixtures)) {
  const output = writeOdt({ model, title: model.title });
  const bytes = dataUrlToBytes(output.data);
  await writeFile(`samples/odt/${name}.odt`, bytes);
  await writeFile(`samples/odt/${name}.data-url.txt`, output.data, "utf8");
  console.log(`samples/odt/${name}.odt (${bytes.length} bytes)`);
}
