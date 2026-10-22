// 二进制输入格式实测：DOCX/XLSX/PPTX/EPUB/PDF 读取是否乱码、结构是否保留
import { readFileSync } from "node:fs";
import * as bt from "../public/browser-transformer.js";

const MOJIBAKE_RE = /\uFFFD|(?:[\u00C0-\u00DF][\u0080-\u00BF]){2,}/;

const files = {
  docx: "samples/generated/small/docx-small.docx",
  xlsx: "samples/generated/small/xlsx-small.xlsx",
  pptx: "samples/generated/small/pptx-small.pptx",
  epub: "samples/generated/small/epub-small.epub",
  pdf: "samples/generated/small/pdf-small.pdf",
};

for (const [fmt, path] of Object.entries(files)) {
  const buf = new Uint8Array(readFileSync(path));
  console.log(`\n########## ${fmt} (${buf.byteLength}B) ##########`);
  for (const to of bt.getAllowedOutputFormats(fmt).slice(0, 8)) {
    try {
      const res = bt.convertContent({ content: buf, from: fmt, to, title: "audit", options: { repair: false } });
      const data = res?.data;
      let text;
      if (typeof data === "string") text = data;
      else if (data instanceof Uint8Array) text = Buffer.from(data).toString("utf8");
      else { console.log(`  ${fmt}->${to}: unknown data ${typeof data}`); continue; }
      const moj = text.match(MOJIBAKE_RE);
      const preview = text.replace(/\s+/g, " ").slice(0, 160);
      console.log(`  ${fmt}->${to}: ${moj ? "MOJIBAKE@" + moj.index + " '" + moj[0] + "'" : "clean"} | ${preview}`);
    } catch (e) {
      console.log(`  ${fmt}->${to}: FAIL ${e.code || ""} ${String(e.message).slice(0, 100)}`);
    }
  }
}
