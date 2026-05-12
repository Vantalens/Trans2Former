import { readFile } from "node:fs/promises";
import path from "node:path";

import { convertContent, expandPdfContentForTextExtraction, listFormats } from "../public/browser-transformer.js";

function preview(value, limit = 240) {
  if (value instanceof Uint8Array) return `<bytes ${value.length}>`;
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit)}…(${text.length} total)` : text;
}

async function loadSample(file) {
  const raw = await readFile(file);
  const ext = path.extname(file).toLowerCase().slice(1);
  if (["png", "pdf", "docx", "xlsx", "pptx", "epub", "doc"].includes(ext)) {
    return { ext, content: `data:application/octet-stream;base64,${raw.toString("base64")}` };
  }
  return { ext, content: raw.toString("utf8") };
}

async function probe(label, file, from, to) {
  try {
    const { content } = await loadSample(file);
    let payload = content;
    if (from === "pdf") payload = await expandPdfContentForTextExtraction(content);
    const result = convertContent({ content: payload, from, to, title: path.basename(file), fileName: path.basename(file) });
    const body = result?.data ?? result;
    console.log(`\n=== [${label}] ${from} -> ${to} (${path.basename(file)}) ===`);
    console.log(preview(body));
  } catch (error) {
    console.log(`\n=== [${label}] ${from} -> ${to} (${path.basename(file)}) FAILED ===`);
    console.log(error.message);
  }
}

console.log("Trans2Former real-sample conversion probe");
console.log("Allowed formats:", JSON.stringify(listFormats()));

await probe("MD-chinese", "samples/md/chinese.md", "md", "html");
await probe("MD-chinese", "samples/md/chinese.md", "md", "txt");
await probe("MD-chinese", "samples/md/chinese.md", "md", "json");
await probe("MD-table", "samples/md/table-code.md", "md", "html");
await probe("MD-table", "samples/md/table-code.md", "md", "docx");
await probe("HTML-article", "samples/html/article.html", "html", "md");
await probe("HTML-article", "samples/html/article.html", "html", "txt");
await probe("HTML-table", "samples/html/table-list.html", "html", "md");
await probe("CSV-unicode", "samples/csv/unicode.csv", "csv", "md");
await probe("CSV-unicode", "samples/csv/unicode.csv", "csv", "html");
await probe("CSV-unicode", "samples/csv/unicode.csv", "csv", "json");
await probe("TXT-chinese", "samples/txt/chinese.txt", "txt", "md");
await probe("TXT-chinese", "samples/txt/chinese.txt", "txt", "html");
await probe("XML-basic", "samples/xml/basic.xml", "xml", "md");
await probe("XML-namespace", "samples/xml/namespace.xml", "xml", "json");
await probe("JSON-object", "samples/json/object.json", "json", "md");
await probe("JSON-object", "samples/json/object.json", "json", "html");
await probe("JSON-document-model", "samples/json/document-model.json", "json", "html");
