import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  convertContent,
  listFormats,
  renderPreviewHtml,
  toDocumentModel,
} from "../public/browser-transformer.js";
import {
  chunkTextByLines,
  compareDocumentModelsForEquivalence,
  mergePartialDocumentModels,
} from "../public/core/chunking.js";
import { ConversionError, normalizeConversionError } from "../public/core/conversion-error.js";
import { assertValidDocumentModel, validateDocumentModel } from "../public/core/document-schema.js";

const SAMPLE_ROOT = path.resolve("samples");
const INPUT_FORMATS = ["md", "html", "txt", "json", "csv", "xml", "png"];
const OUTPUT_FORMATS = ["md", "html", "txt", "json", "csv", "xml", "pdf"];
const TEXT_OUTPUT_FORMATS = ["md", "html", "txt", "json", "xml", "pdf"];
const EXPECTED_BLOCK_TYPES = ["heading", "paragraph", "list", "code", "table", "quote", "image", "asset", "raw"];

const SAMPLE_MATRIX = {
  md: ["chinese.md", "table-code.md", "image-link.md"],
  html: ["article.html", "table-list.html", "inline-media.html"],
  txt: ["chinese.txt", "long-lines.txt", "code-list.txt"],
  json: ["object.json", "array.json", "document-model.json"],
  csv: ["basic.csv", "quoted.csv", "unicode.csv"],
  xml: ["basic.xml", "attributes.xml", "namespace.xml"],
  png: ["tiny-red.data-url.txt", "tiny-green.data-url.txt", "tiny-blue.data-url.txt"],
};

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`Smoke test passed: ${tests.length} test groups completed.`);
}

async function readSample(format, fileName) {
  return readFile(path.join(SAMPLE_ROOT, format, fileName), "utf8");
}

async function readSamples() {
  const samples = [];
  for (const [format, fileNames] of Object.entries(SAMPLE_MATRIX)) {
    for (const fileName of fileNames) {
      samples.push({
        format,
        fileName,
        content: await readSample(format, fileName),
      });
    }
  }
  return samples;
}

function assertValidOutput(result, toFormat, label) {
  assert.equal(result.format, toFormat, `${label} should output ${toFormat}`);
  assert.equal(typeof result.data, "string", `${label} should return string data`);
  assert.equal(result.data.trim().length > 0, true, `${label} should not return empty data`);
  if (toFormat === "pdf") {
    assert.equal(result.type, "print", `${label} should use print output for PDF`);
    assert.equal(result.data.includes("@media print"), true, `${label} PDF-print output should include print CSS`);
  } else {
    assert.equal(result.type, "text", `${label} should use text output`);
  }
}

test("format registry exposes the supported input and output matrix", () => {
  const formats = listFormats();
  assert.deepEqual(formats.input, INPUT_FORMATS);
  assert.deepEqual(formats.output, OUTPUT_FORMATS);
});

test("DocumentModel validation accepts generated models and rejects invalid models", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.\n\n- One\n- Two\n\n```js\nconsole.log('ok');\n```";
  const model = toDocumentModel(markdown, "md", "sample");
  assert.equal(model.schemaVersion, "trans2former.document.v1");
  assert.equal(model.blocks[0].type, "heading");
  assert.equal(model.blocks[0].text, "Title");
  assert.equal(validateDocumentModel(model).ok, true);
  assert.doesNotThrow(() => assertValidDocumentModel(model));
  assert.throws(() => assertValidDocumentModel({ schemaVersion: "bad", blocks: [] }), /schema validation failed/);
});

test("DocumentModel audit layer adds stable ids, source spans, metadata, and quality report", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.\n\n- One\n- Two";
  const model = toDocumentModel(markdown, "md", "audit.md");

  assert.equal(model.blocks.every((block) => /^block-[0-9]+-[a-z0-9]{8}$/.test(block.id)), true);
  assert.equal(model.blocks.every((block) => block.sourceSpan && Number.isInteger(block.sourceSpan.startLine)), true);
  assert.equal(model.blocks.every((block) => Array.isArray(block.warnings)), true);
  assert.equal(model.metadata.conversion.reader, "md");
  assert.equal(model.metadata.conversion.schemaVersion, "trans2former.document.v1");
  assert.equal(model.metadata.qualityReport.warningCount, 0);
  assert.equal(model.metadata.qualityReport.structureFidelity, "high");
});

test("DocumentModel records block warnings, asset provenance, and conversion metadata", () => {
  const markdown = "Footnote reference[^safe].\n\n[^safe]: Footnote body";
  const model = toDocumentModel(markdown, "md", "warnings.md");

  assert.equal(model.metadata.warnings.some((warning) => warning.code === "MARKDOWN_FOOTNOTE"), true);
  assert.equal(model.blocks.some((block) => block.warnings.some((warning) => warning.code === "MARKDOWN_FOOTNOTE")), true);
  assert.equal(model.metadata.qualityReport.warningCount > 0, true);

  const pngData = "data:image/png;base64,iVBORw0KGgo=";
  const pngModel = toDocumentModel(pngData, "png", "tiny.png");
  assert.equal(pngModel.assets[0].provenance.sourceFormat, "png");
  assert.equal(pngModel.assets[0].provenance.fileName, "tiny.png");
});

test("chunked DocumentModel merge is equivalent to direct conversion for markdown", () => {
  const markdown = "# A\n\nFirst paragraph.\n\n## B\n\nSecond paragraph.";
  const direct = toDocumentModel(markdown, "md", "chunked.md");
  const chunks = chunkTextByLines(markdown, { maxLines: 3 });
  const partials = chunks.map((chunk, index) => toDocumentModel(chunk.content, "md", `chunk-${index + 1}.md`));
  const merged = mergePartialDocumentModels(partials, {
    title: "chunked.md",
    sourceFormat: "md",
    originalContent: markdown,
  });

  const comparison = compareDocumentModelsForEquivalence(direct, merged);
  assert.deepEqual(comparison, { ok: true, differences: [] });
});

test("chunked DocumentModel merge has baseline fixtures for CSV and XML", () => {
  for (const { content, format } of [
    { format: "csv", content: "Name,Value\nA,1\nB,2" },
    { format: "xml", content: "<root>\n  <item>A</item>\n  <item>B</item>\n</root>" },
  ]) {
    const direct = toDocumentModel(content, format, `chunked.${format}`);
    const chunks = chunkTextByLines(content, { maxLines: 100 });
    const partials = chunks.map((chunk, index) => toDocumentModel(chunk.content, format, `chunk-${index + 1}.${format}`));
    const merged = mergePartialDocumentModels(partials, {
      title: `chunked.${format}`,
      sourceFormat: format,
      originalContent: content,
    });
    assert.deepEqual(compareDocumentModelsForEquivalence(direct, merged), { ok: true, differences: [] });
  }
});

test("ConversionError normalizes parse, validate, and convert failures", () => {
  assert.throws(
    () => convertContent({ content: "{", from: "json", to: "md", title: "invalid" }),
    (error) => error instanceof ConversionError
      && error.category === "parse"
      && error.code === "JSON_PARSE_ERROR"
      && error.format === "json"
  );

  assert.throws(
    () => assertValidDocumentModel({ schemaVersion: "bad", blocks: [] }),
    (error) => error instanceof ConversionError
      && error.category === "validate"
      && error.code === "DOCUMENT_MODEL_SCHEMA_ERROR"
  );

  assert.throws(
    () => convertContent({ content: "# Title", from: "md", to: "docx", title: "unsupported" }),
    (error) => error instanceof ConversionError
      && error.category === "convert"
      && error.code === "UNSUPPORTED_OUTPUT_FORMAT"
      && error.format === "docx"
  );

  const normalized = normalizeConversionError(new Error("plain failure"), {
    category: "render",
    code: "PREVIEW_RENDER_ERROR",
  });
  assert.equal(normalized instanceof ConversionError, true);
  assert.equal(normalized.category, "render");
  assert.equal(normalized.code, "PREVIEW_RENDER_ERROR");
});

test("Markdown preview and core conversions preserve common document structure", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.\n\n- One\n- Two\n\n```js\nconsole.log('ok');\n```";
  const preview = renderPreviewHtml(markdown, "md", "sample");
  assert.equal(preview.includes("<h1>Title</h1>"), true);
  assert.equal(preview.includes("<strong>Trans2Former</strong>"), true);

  const html = convertContent({ content: markdown, from: "md", to: "html", title: "sample" });
  assertValidOutput(html, "html", "markdown to html");
  assert.equal(html.data.includes("<main>"), true);

  const text = convertContent({ content: "<h1>Hello</h1><p>World</p>", from: "html", to: "txt", title: "sample" });
  assertValidOutput(text, "txt", "html to txt");
  assert.equal(text.data.includes("Hello"), true);
  assert.equal(text.data.includes("World"), true);

  const json = convertContent({ content: "{\"hello\":\"world\"}", from: "json", to: "md", title: "sample" });
  assertValidOutput(json, "md", "json to markdown");
  assert.equal(json.data.includes("```json"), true);
});

test("Markdown advanced syntax keeps ordered lists, nesting hints, alignment, and footnotes", () => {
  const markdown = [
    "# Advanced",
    "",
    "1. First item",
    "   - Nested item",
    "2. Second item with `code` and [link](https://example.com)",
    "",
    "| Left | Center | Right |",
    "| :--- | :---: | ---: |",
    "| A | B | C |",
    "",
    "Footnote reference[^safe].",
    "",
    "[^safe]: Footnote body",
  ].join("\n");

  const model = toDocumentModel(markdown, "md", "advanced");
  const ordered = model.blocks.find((block) => block.type === "list" && block.ordered);
  const table = model.blocks.find((block) => block.type === "table");

  assert.deepEqual(ordered.items, ["First item", "Nested item", "Second item with `code` and [link](https://example.com)"]);
  assert.deepEqual(ordered.itemMeta.map((item) => item.depth), [0, 1, 0]);
  assert.deepEqual(table.alignments, ["left", "center", "right"]);
  assert.equal(model.metadata.warnings.some((warning) => warning.severity === "info" && warning.code === "MARKDOWN_FOOTNOTE"), true);

  const preview = renderPreviewHtml(markdown, "md", "advanced");
  assert.equal(preview.includes("<ol>"), true);
  assert.equal(preview.includes('data-depth="1"'), true);
  assert.equal(preview.includes('<sup id="fnref-safe">'), true);
});

test("JSON output wraps a DocumentModel with markdown and plain text projections", () => {
  const markdown = "# Title\n\nHello **Trans2Former**.";
  const jsonDocument = convertContent({ content: markdown, from: "md", to: "json", title: "sample" });
  assertValidOutput(jsonDocument, "json", "markdown to json");
  const parsedDocumentJson = JSON.parse(jsonDocument.data);
  assert.equal(parsedDocumentJson.schemaVersion, "trans2former.document.v1");
  assert.equal(Array.isArray(parsedDocumentJson.blocks), true);
  assert.equal(parsedDocumentJson.blocks[0].type, "heading");
  assert.equal(parsedDocumentJson.blocks[0].text, "Title");
  assert.equal(parsedDocumentJson.markdown.includes("# Title"), true);
});

test("table conversions round-trip through Markdown, CSV, and HTML", () => {
  const tableMarkdown = "| Name | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |";
  const tableModel = toDocumentModel(tableMarkdown, "md", "table");
  assert.equal(tableModel.blocks[0].type, "table");
  assert.deepEqual(tableModel.blocks[0].headers, ["Name", "Value"]);
  assert.deepEqual(tableModel.blocks[0].rows[1], ["B", "2"]);

  const tableHtml = convertContent({ content: tableMarkdown, from: "md", to: "html", title: "table" });
  assertValidOutput(tableHtml, "html", "markdown table to html");
  assert.equal(tableHtml.data.includes("<table>"), true);

  const tableRoundTrip = convertContent({ content: tableMarkdown, from: "md", to: "md", title: "table" });
  assertValidOutput(tableRoundTrip, "md", "markdown table round-trip");
  assert.equal(tableRoundTrip.data.includes("| Name | Value |"), true);

  const csvContent = "Name,Value\nA,1\nB,2";
  const csvModel = toDocumentModel(csvContent, "csv", "csv");
  assert.equal(csvModel.blocks[0].type, "table");
  assert.deepEqual(csvModel.blocks[0].headers, ["Name", "Value"]);

  const csvToMarkdown = convertContent({ content: csvContent, from: "csv", to: "md", title: "csv" });
  assertValidOutput(csvToMarkdown, "md", "csv to markdown");
  assert.equal(csvToMarkdown.data.includes("| Name | Value |"), true);

  const markdownToCsv = convertContent({ content: tableMarkdown, from: "md", to: "csv", title: "table" });
  assertValidOutput(markdownToCsv, "csv", "markdown to csv");
  assert.equal(markdownToCsv.data.includes("Name,Value"), true);
});

test("CSV parser handles BOM, quoted commas, multiline cells, empty cells, and CRLF", () => {
  const csvContent = "\uFEFFName,Note,Empty\r\n\"A, one\",\"line 1\r\nline 2\",\r\nB,\"quoted \"\"value\"\"\",";
  const csvModel = toDocumentModel(csvContent, "csv", "csv-edge");
  const table = csvModel.blocks[0];

  assert.deepEqual(table.headers, ["Name", "Note", "Empty"]);
  assert.deepEqual(table.rows[0], ["A, one", "line 1\nline 2", ""]);
  assert.deepEqual(table.rows[1], ["B", "quoted \"value\"", ""]);
  assert.equal(csvModel.metadata.warnings.some((warning) => warning.severity === "info" && warning.code === "CSV_MULTILINE_FIELD"), true);
});

test("XML and PNG inputs convert through the DocumentModel pipeline", () => {
  const xmlContent = "<root><item>A</item><item>B</item></root>";
  const xmlModel = toDocumentModel(xmlContent, "xml", "xml");
  assert.equal(validateDocumentModel(xmlModel).ok, true);

  const markdown = "# Title\n\nHello **Trans2Former**.";
  const markdownToXml = convertContent({ content: markdown, from: "md", to: "xml", title: "sample" });
  assertValidOutput(markdownToXml, "xml", "markdown to xml");
  assert.equal(markdownToXml.data.includes("<document"), true);
  assert.equal(markdownToXml.data.includes("<heading level=\"1\">Title</heading>"), true);

  const pngData = "data:image/png;base64,iVBORw0KGgo=";
  const pngModel = toDocumentModel(pngData, "png", "tiny");
  assert.equal(pngModel.assets.length, 1);
  assert.equal(pngModel.blocks.some((block) => block.type === "asset"), true);
  assert.equal(validateDocumentModel(pngModel).ok, true);

  const pngHtml = convertContent({ content: pngData, from: "png", to: "html", title: "tiny", fileName: "tiny.png" });
  assertValidOutput(pngHtml, "html", "png to html");
  assert.equal(pngHtml.data.includes("data:image/png;base64"), true);

  const pdf = convertContent({ content: markdown, from: "md", to: "pdf", title: "sample" });
  assertValidOutput(pdf, "pdf", "markdown to pdf-print");
});

test("XML parser reports namespaces, attributes, and parser errors without DOMParser", () => {
  const xmlContent = '<doc xmlns:ofd="urn:ofd" id="root"><ofd:item type="a">A</ofd:item></doc>';
  const xmlModel = toDocumentModel(xmlContent, "xml", "xml-edge");
  const readable = xmlModel.blocks.find((block) => block.type === "paragraph").text;

  assert.equal(xmlModel.metadata.rootElement, "doc");
  assert.deepEqual(xmlModel.metadata.namespaces, [{ prefix: "ofd", uri: "urn:ofd" }]);
  assert.equal(xmlModel.metadata.attributes.doc.id, "root");
  assert.equal(readable.includes('<ofd:item type="a">'), true);
  assert.equal(xmlModel.metadata.warnings.some((warning) => warning.severity === "info" && warning.code === "XML_ATTRIBUTES_EXTRACTED"), true);

  assert.throws(
    () => toDocumentModel("<root><item></root>", "xml", "broken"),
    (error) => error instanceof ConversionError
      && error.category === "parse"
      && error.code === "XML_PARSE_ERROR"
      && error.format === "xml"
  );
});

test("sample fixtures exist and parse into valid DocumentModels", async () => {
  const samples = await readSamples();
  assert.equal(samples.length, INPUT_FORMATS.length * 3);

  for (const [format, fileNames] of Object.entries(SAMPLE_MATRIX)) {
    assert.equal(fileNames.length >= 3, true, `${format} should have at least three samples`);
  }

  for (const sample of samples) {
    const label = `${sample.format}/${sample.fileName}`;
    assert.equal(sample.content.trim().length > 0, true, `${label} should not be empty`);
    const model = toDocumentModel(sample.content.trimEnd(), sample.format, sample.fileName);
    assert.equal(validateDocumentModel(model).ok, true, `${label} should produce a valid DocumentModel`);
  }
});

test("sample fixtures convert to common text outputs with explicit degradation paths", async () => {
  const samples = await readSamples();
  for (const sample of samples) {
    for (const toFormat of TEXT_OUTPUT_FORMATS) {
      const label = `${sample.format}/${sample.fileName} -> ${toFormat}`;
      const result = convertContent({
        content: sample.content.trimEnd(),
        from: sample.format,
        to: toFormat,
        title: sample.fileName,
        fileName: sample.fileName,
      });
      assertValidOutput(result, toFormat, label);
    }
  }
});

test("machine-readable DocumentModel schema mirrors the runtime block and asset shapes", async () => {
  const schemaPath = path.resolve("docs", "document-model.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.equal(schema.$id, "https://vantalens.github.io/trans2former/document-model.schema.json");
  assert.equal(schema.properties.schemaVersion.const, "trans2former.document.v1");
  assert.deepEqual(schema.properties.blocks.items.oneOf.map((entry) => entry.properties.type.const), EXPECTED_BLOCK_TYPES);
  assert.deepEqual(Object.keys(schema.properties.assets.items.properties), ["id", "name", "mime", "data", "size", "role", "provenance"]);
});

await runTests();
