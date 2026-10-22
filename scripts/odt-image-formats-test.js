#!/usr/bin/env node
// ODT / JPEG / WebP / SVG 格式测试：
// - ODT 读取（标题/列表/表格/中文/粗斜体自动样式）与写出 round-trip（合法 ZIP 包，
//   mimetype 首位不压缩，content.xml 骨架完整）
// - JPEG/WebP data URL 输入产出含 asset 的 DocumentModel
// - SVG 文本/data URL/字节输入提取 <text> 元素；Node 环境 OCR 跳过并如实 warning
// - 产品矩阵一致性（新格式行与注册表一致）
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  convertContent,
  convertContentAsync,
  createOCRResult,
  defaultOCRRegistry,
  detectFormatFromName,
  getAllowedOutputFormats,
  listFormats,
  toDocumentModel,
} from "../public/browser-transformer.js";
import { validateDocumentModel } from "../public/core/document-schema.js";
import { readZipEntries } from "../public/core/zip-container.js";
import { writeStoredZip } from "../public/core/zip-writer.js";
import { bytesToDataUrl } from "../public/core/binary-utils.js";

const MOJIBAKE_RE = new RegExp("\\uFFFD");

function assertNoMojibake(data, label) {
  assert.equal(MOJIBAKE_RE.test(String(data)), false, `${label} must not contain U+FFFD replacement characters`);
}

// ---------- ODT 读取（手工 content.xml，覆盖标题/列表/表格/粗斜体/中文） ----------
{
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
    <style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
    <text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style>
    <text:list-style style:name="L2"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>
  </office:automatic-styles>
  <office:body><office:text>
    <text:h text:outline-level="1">第一章 概述</text:h>
    <text:p>正文包含<text:span text:style-name="T1">加粗</text:span>与<text:span text:style-name="T2">斜体</text:span>文本。</text:p>
    <text:list text:style-name="L1">
      <text:list-item><text:p>无序甲</text:p><text:list text:style-name="L1"><text:list-item><text:p>嵌套子项</text:p></text:list-item></text:list></text:list-item>
      <text:list-item><text:p>无序乙</text:p></text:list-item>
    </text:list>
    <text:list text:style-name="L2">
      <text:list-item><text:p>第一步</text:p></text:list-item>
      <text:list-item><text:p>第二步</text:p></text:list-item>
    </text:list>
    <table:table>
      <table:table-row><table:table-cell><text:p>名称</text:p></table:table-cell><table:table-cell><text:p>数量</text:p></table:table-cell></table:table-row>
      <table:table-row><table:table-cell><text:p>苹果</text:p></table:table-cell><table:table-cell><text:p>3</text:p></table:table-cell></table:table-row>
    </table:table>
    <text:p>访问<text:a xlink:href="https://example.com">示例链接</text:a>获取详情。</text:p>
  </office:text></office:body>
</office:document-content>`;
  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2"><office:meta><dc:title>手工 ODT 标题</dc:title></office:meta></office:document-meta>`;
  const zipBytes = writeStoredZip([
    { name: "mimetype", data: "application/vnd.oasis.opendocument.text" },
    { name: "content.xml", data: contentXml },
    { name: "meta.xml", data: metaXml },
    { name: "META-INF/manifest.xml", data: "<manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"/>" },
  ]);
  const odtDataUrl = bytesToDataUrl(zipBytes, "application/vnd.oasis.opendocument.text");

  const model = toDocumentModel(odtDataUrl, "odt", "handcrafted.odt");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.title, "手工 ODT 标题", "meta.xml dc:title must become the document title");
  const heading = model.blocks.find((block) => block.type === "heading");
  assert.equal(heading.text, "第一章 概述");
  assert.equal(heading.level, 1);

  const styled = model.blocks.find((block) => block.type === "paragraph" && block.text.includes("加粗"));
  assert.ok(styled, "paragraph with styled spans must exist");
  assert.equal(styled.text, "正文包含加粗与斜体文本。", "styled paragraph text must keep plain reading order");
  const strong = styled.inlines.find((node) => node.type === "strong");
  assert.ok(strong, "bold span must map to a strong inline node");
  assert.equal(strong.inlines[0].value, "加粗");
  const em = styled.inlines.find((node) => node.type === "em");
  assert.ok(em, "italic span must map to an em inline node");

  const bulletList = model.blocks.find((block) => block.type === "list" && block.ordered === false);
  assert.ok(bulletList, "bullet list must be extracted");
  assert.deepEqual(bulletList.items, ["无序甲", "嵌套子项", "无序乙"], "nested list items flatten with depth");
  assert.deepEqual(bulletList.itemMeta.map((meta) => meta.depth), [0, 1, 0]);

  const orderedList = model.blocks.find((block) => block.type === "list" && block.ordered === true);
  assert.ok(orderedList, "list-style with number level must be ordered");
  assert.deepEqual(orderedList.items, ["第一步", "第二步"]);

  const table = model.blocks.find((block) => block.type === "table");
  assert.ok(table, "table:table must map to a table block");
  assert.deepEqual(table.headers, ["名称", "数量"]);
  assert.deepEqual(table.rows, [["苹果", "3"]]);

  const linkParagraph = model.blocks.find((block) => block.type === "paragraph" && block.text.includes("示例链接"));
  const link = linkParagraph.inlines.find((node) => node.type === "link");
  assert.equal(link.href, "https://example.com");

  // 中文内容转文本输出不得乱码
  for (const to of getAllowedOutputFormats("odt")) {
    const result = convertContent({ content: odtDataUrl, from: "odt", to, title: "handcrafted.odt", fileName: "handcrafted.odt" });
    assert.equal(result.format, to);
    if (result.type === "text") {
      assertNoMojibake(result.data, `odt -> ${to}`);
      assert.match(result.data, /第一章 概述/, `odt -> ${to} should preserve Chinese heading`);
    }
  }
}

// ---------- ODT 写出 + round-trip ----------
{
  const mdSource = "# ODT 标题\n\n中文正文段落。\n\n- 项目一\n- 项目二\n\n| 列A | 列B |\n| --- | --- |\n| 值1 | 值2 |\n";
  const written = convertContent({ content: mdSource, from: "md", to: "odt", title: "roundtrip.odt", fileName: "roundtrip.odt" });
  assert.equal(written.type, "binary");
  assert.equal(written.format, "odt");
  assert.equal(written.mime, "application/vnd.oasis.opendocument.text");

  const zip = readZipEntries(written.data);
  assert.deepEqual(zip.list(), ["mimetype", "content.xml", "styles.xml", "meta.xml", "META-INF/manifest.xml"], "ODT package must carry the minimal entry set with mimetype first");
  assert.equal(zip.getText("mimetype"), "application/vnd.oasis.opendocument.text");
  assert.deepEqual(zip.methods(), [0], "ODT entries must be stored (uncompressed), mimetype included");
  const contentXml = zip.getText("content.xml");
  assert.match(contentXml, /<office:document-content\b/);
  assert.match(contentXml, /<office:body><office:text>/);
  assert.match(contentXml, /中文正文段落/);
  assertNoMojibake(contentXml, "odt content.xml");
  assert.match(zip.getText("META-INF/manifest.xml"), /application\/vnd\.oasis\.opendocument\.text/);
  assert.match(zip.getText("meta.xml"), /<dc:title>roundtrip\.odt<\/dc:title>/);

  // round-trip：写出的 ODT 再读回，标题/列表/表格语义保留
  const roundTrip = toDocumentModel(written.data, "odt", "roundtrip.odt");
  assert.equal(validateDocumentModel(roundTrip).ok, true);
  assert.equal(roundTrip.title, "roundtrip.odt", "written meta.xml dc:title must round-trip");
  assert.equal(roundTrip.blocks.some((block) => block.type === "heading" && block.text === "ODT 标题"), true);
  assert.equal(roundTrip.blocks.some((block) => block.type === "paragraph" && block.text === "中文正文段落。"), true);
  const list = roundTrip.blocks.find((block) => block.type === "list");
  assert.ok(list, "list must survive the ODT round-trip");
  assert.deepEqual(list.items, ["项目一", "项目二"]);
  const table = roundTrip.blocks.find((block) => block.type === "table");
  assert.ok(table, "table must survive the ODT round-trip");
  assert.deepEqual(table.headers, ["列A", "列B"]);
  assert.deepEqual(table.rows, [["值1", "值2"]]);

  // 真实样本文件（writer 生成的 fixture）可直接读取
  const sampleBytes = new Uint8Array(await readFile("samples/odt/basic.odt"));
  const sampleModel = toDocumentModel(sampleBytes, "odt", "basic.odt");
  assert.equal(validateDocumentModel(sampleModel).ok, true);
  assert.equal(sampleModel.blocks.some((block) => block.type === "heading" && block.text === "ODT 基础样例"), true);
  assert.equal(sampleModel.blocks.some((block) => block.type === "paragraph" && String(block.text).includes("中文正文")), true);

  // 损坏输入如实报错
  assert.throws(
    () => toDocumentModel(bytesToDataUrl(writeStoredZip([{ name: "foo.txt", data: "bar" }]), "application/octet-stream"), "odt", "bad.odt"),
    (error) => error?.code === "ODT_CONTENT_XML_MISSING",
  );
}

// ---------- JPEG / WebP 图片输入 ----------
{
  const jpegData = (await readFile("samples/jpeg/tiny-red.data-url.txt", "utf8")).trim();
  assert.ok(jpegData.startsWith("data:image/jpeg;base64,"));
  const jpegModel = toDocumentModel(jpegData, "jpeg", "tiny-red.jpg");
  assert.equal(validateDocumentModel(jpegModel).ok, true);
  assert.equal(jpegModel.assets.length, 1);
  assert.equal(jpegModel.assets[0].mime, "image/jpeg");
  assert.equal(jpegModel.blocks.some((block) => block.type === "asset"), true);

  const webpData = (await readFile("samples/webp/tiny-green.data-url.txt", "utf8")).trim();
  assert.ok(webpData.startsWith("data:image/webp;base64,"));
  const webpModel = toDocumentModel(webpData, "webp", "tiny-green.webp");
  assert.equal(validateDocumentModel(webpModel).ok, true);
  assert.equal(webpModel.assets[0].mime, "image/webp");
  assert.equal(webpModel.blocks.some((block) => block.type === "asset"), true);

  for (const [from, content] of [["jpeg", jpegData], ["webp", webpData]]) {
    for (const to of getAllowedOutputFormats(from)) {
      const result = convertContent({ content, from, to, title: `case.${from}`, fileName: `case.${from}` });
      assert.equal(result.format, to);
      assert.equal(String(result.data).trim().length > 0, true, `${from} -> ${to} should not be empty`);
      if (to === "html") {
        assert.equal(result.data.includes(`data:image/${from === "jpeg" ? "jpeg" : "webp"};base64`), true, `${from} -> html should embed the image asset`);
      }
    }
  }

  // OCR 禁用的异步路径在 Node 下可直接跑通
  const asyncResult = await convertContentAsync({
    content: jpegData,
    from: "jpeg",
    to: "txt",
    title: "tiny-red.jpg",
    options: { repair: false, ocr: { enabled: false } },
  });
  assert.equal(asyncResult.format, "txt");
  assert.equal(typeof asyncResult.data, "string");
}

// ---------- SVG 文本输入 ----------
{
  const svgText = (await readFile("samples/svg/unicode.svg", "utf8")).trim();
  const model = toDocumentModel(svgText, "svg", "unicode.svg");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.equal(model.title, "中文标题", "<title> element must become the document title");
  assert.equal(model.blocks.some((block) => block.type === "paragraph" && block.text === "中文文本元素"), true, "<text> elements must be extracted as paragraphs");
  assert.equal(model.blocks.some((block) => block.type === "asset"), true);
  assert.equal(model.assets[0].mime, "image/svg+xml");
  assert.ok(model.assets[0].data.startsWith("data:image/svg+xml;base64,"), "text input must be packaged as an svg data URL asset");

  // tspan 嵌套文本拼接
  const tspans = toDocumentModel((await readFile("samples/svg/text.svg", "utf8")).trim(), "svg", "text.svg");
  assert.equal(tspans.blocks.some((block) => block.type === "paragraph" && /Second\s*line/.test(block.text)), true, "tspan content must survive tag stripping");

  // data URL 输入（注册表 coercion 与 reader 直收两条路径都要工作）
  const svgDataUrl = "data:image/svg+xml;base64," + Buffer.from(svgText, "utf8").toString("base64");
  const viaRegistry = toDocumentModel(svgDataUrl, "svg", "unicode.svg");
  assert.equal(viaRegistry.blocks.some((block) => block.type === "paragraph" && block.text === "中文文本元素"), true, "data URL input must be coerced to svg text by the registry");
  const { readSvg } = await import("../public/formats/svg.js");
  const direct = readSvg({ content: svgDataUrl, title: "unicode.svg" });
  assert.equal(direct.blocks.some((block) => block.type === "paragraph" && block.text === "中文文本元素"), true, "reader must accept a data URL when called directly");

  // Uint8Array 字节输入走 TEXT_CONTENT_FORMATS 解码，不得变成数字串
  const bytes = new TextEncoder().encode(svgText);
  const viaBytes = toDocumentModel(bytes, "svg", "unicode.svg");
  assert.equal(viaBytes.blocks.some((block) => block.type === "paragraph" && block.text === "中文文本元素"), true, "byte input must be decoded as utf-8 text");

  for (const to of getAllowedOutputFormats("svg")) {
    const result = convertContent({ content: svgText, from: "svg", to, title: "unicode.svg", fileName: "unicode.svg" });
    assert.equal(result.format, to);
    if (result.type === "text") {
      assertNoMojibake(result.data, `svg -> ${to}`);
      assert.match(result.data, /中文文本元素/, `svg -> ${to} should preserve extracted text`);
    }
  }

  assert.throws(() => toDocumentModel("not an svg", "svg", "bad.svg"), /SVG 输入必须/);
}

// ---------- SVG 在 Node 下的 OCR 路径：跳过并如实 warning，不崩溃 ----------
{
  const svgText = (await readFile("samples/svg/basic.svg", "utf8")).trim();
  const result = await convertContentAsync({
    content: svgText,
    from: "svg",
    to: "txt",
    title: "basic.svg",
    options: {},
  });
  assert.equal(result.format, "txt");
  assert.equal(typeof result.data, "string");
  const warnings = result.quality?.warnings || [];
  assert.equal(
    warnings.some((warning) => warning.code === "SVG_RASTERIZE_UNSUPPORTED"),
    true,
    "svg OCR must be skipped with an explicit SVG_RASTERIZE_UNSUPPORTED warning instead of crashing in Node",
  );
  assert.match(result.data, /Hello SVG/, "extracted <text> content must still reach the output without OCR");

  // 注入栅格化钩子后走标准 OCR 路径（stub 引擎），不得再报 SVG_RASTERIZE_UNSUPPORTED
  const stubEngine = {
    id: "svg-stub",
    taskCapabilities: ["ocr-text"],
    manifestId: "svg-stub",
    isAvailable: () => true,
    recognize: async ({ image }) => {
      assert.ok(String(image).startsWith("data:image/png;base64,"), "rasterized svg must reach the engine as a raster data URL");
      return createOCRResult({
        language: "auto",
        pages: [{ pageIndex: 0, width: 8, height: 8, lines: [{ text: "SVG-OCR-STUB", confidence: 0.9, bbox: null }] }],
        fullText: "SVG-OCR-STUB",
        averageConfidence: 0.9,
        runtimeMs: 1,
        engine: "svg-stub",
        modelVersion: "0.0.1",
      });
    },
  };
  defaultOCRRegistry.register(stubEngine);
  try {
    const rasterized = await convertContentAsync({
      content: svgText,
      from: "svg",
      to: "txt",
      title: "basic.svg",
      options: {
        repair: false,
        ocr: { svgRasterize: async () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=" },
      },
    });
    assert.ok(rasterized.data.includes("SVG-OCR-STUB"), "rasterize hook must route svg through the standard OCR enhancement");
  } finally {
    defaultOCRRegistry.unregister(stubEngine.id);
  }
}

// ---------- 矩阵与注册表一致性 ----------
{
  const formats = listFormats();
  for (const format of ["odt", "jpeg", "webp", "svg"]) {
    assert.ok(formats.input.includes(format), `${format} must be a registered input`);
  }
  assert.ok(formats.output.includes("odt"), "odt must be a registered output");
  for (const format of ["jpeg", "webp", "svg"]) {
    assert.equal(formats.output.includes(format), false, `${format} writer must stay unregistered`);
  }
  assert.deepEqual(getAllowedOutputFormats("odt"), ["md", "html", "txt", "json", "xml", "docx", "pdf", "odt", "latex"]);
  for (const format of ["jpeg", "webp", "svg"]) {
    assert.deepEqual(getAllowedOutputFormats(format), ["html", "txt", "json", "pdf"]);
  }
  // 新格式不得倒灌进既有输入的出路
  for (const from of formats.input) {
    for (const imageFormat of ["jpeg", "webp", "svg"]) {
      assert.equal(getAllowedOutputFormats(from).includes(imageFormat), false, `${from} -> ${imageFormat} must not be advertised`);
    }
  }

  assert.equal(detectFormatFromName("报告.odt"), "odt");
  assert.equal(detectFormatFromName("photo.JPG"), "jpeg");
  assert.equal(detectFormatFromName("photo.jpe"), "jpeg");
  assert.equal(detectFormatFromName("photo.jfif"), "jpeg");
  assert.equal(detectFormatFromName("pic.webp"), "webp");
  assert.equal(detectFormatFromName("icon.svg"), "svg");
}

console.log("ODT/image formats test passed: ODT read+write round-trip, JPEG/WebP asset input, SVG text extraction, and Node-safe OCR skipping all work.");
