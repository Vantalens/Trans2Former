import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { convertContent } from "../public/browser-transformer.js";
import { readBlobAsDecodedText } from "../public/core/text-decoding.js";
import { readPdf } from "../public/formats/pdf.js";

const largeText = "标题\n\n" + "大文件内容。".repeat(700_000);
const decoded = await readBlobAsDecodedText(new Blob([largeText]), { fileName: "large.md", mime: "text/markdown" });
assert.equal(decoded.text, largeText, "large text should be decoded in chunks without changing content");

const largeResult = convertContent({
  content: largeText,
  from: "md",
  to: "txt",
  title: "large.md",
  fileName: "large.md",
  options: { repair: false },
});
assert.equal(largeResult.type, "text", "large Markdown should remain convertible through the Worker-compatible path");
assert.ok(largeResult.data.length > largeText.length * 0.9, "large conversion should not be silently truncated");

const spacedPdf = "%PDF-1.4\n1 0 obj\n<< /Length 32 >>\nstream\nBT [(Hello) -250 (world)] TJ ET\nendstream\nendobj\n%%EOF";
const pdfModel = readPdf({ content: spacedPdf, title: "spaced.pdf" });
assert.match(pdfModel.blocks.map((block) => block.text || "").join(" "), /Hello world/, "PDF TJ spacing should preserve word boundaries");

const htmlResult = convertContent({
  content: "<table><tr><th><strong>Name</strong></th></tr><tr><td><em>Alice</em></td></tr></table>",
  from: "html",
  to: "html",
  title: "semantic.html",
  fileName: "semantic.html",
  options: { repair: false },
});
assert.match(htmlResult.data, /<strong>Name<\/strong>/, "HTML table header inline semantics should survive conversion");
assert.match(htmlResult.data, /<em>Alice<\/em>/, "HTML table cell inline semantics should survive conversion");

const markdownResult = convertContent({
  content: "---\ntitle: Demo\nowner: \"Trans2Former\"\n---\n# Title\n\n---",
  from: "md",
  to: "md",
  title: "front-matter.md",
  fileName: "front-matter.md",
  options: { repair: false },
});
assert.match(markdownResult.data, /^---\ntitle: Demo\nowner: (?:Trans2Former|\"Trans2Former\")\n---\n/, "Markdown front matter should be preserved");
assert.match(markdownResult.data, /\n---\n?$/, "Markdown thematic break should remain syntax instead of prose");

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
assert.match(appSource, /function renderBinaryOutputPreview/, "binary outputs should have an in-workbench preview strategy");
assert.match(indexSource, /id="workflowSteps"/, "workbench should expose a compact workflow guide");
assert.equal(indexSource.includes("id=\"openPdfPreviewButton\""), false, "duplicate PDF preview control should be removed");

console.log("Test-result regression tests passed: large files, PDF spacing, HTML semantics, Markdown syntax, and UX wiring are covered.");
