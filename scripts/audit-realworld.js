// 真实世界样本转换实测 v2：每次转换重新读文件，避免 buffer detach 干扰
import { readFileSync } from "node:fs";
import * as bt from "../public/browser-transformer.js";

const MOJIBAKE_RE = /\uFFFD|(?:[\u00C0-\u00DF][\u0080-\u00BF]){2,}/;

const cases = [
  ["samples/realworld/report.docx", "docx", ["md", "txt", "html"]],
  ["samples/realworld/sales.xlsx", "xlsx", ["md", "csv", "html"]],
  ["samples/realworld/chinese.pdf", "pdf", ["md", "txt", "html", "docx"]],
  ["samples/realworld/gbk.txt", "txt", ["md", "html", "txt"]],
  ["samples/realworld/gbk.csv", "csv", ["md", "json", "html"]],
  ["samples/realworld/utf8.csv", "csv", ["md", "json"]],
];

for (const [path, from, targets] of cases) {
  console.log(`\n########## ${path} ##########`);
  for (const to of targets) {
    const buf = new Uint8Array(readFileSync(path)); // 每次重新读，避免 detach
    try {
      const res = await bt.convertContentAsync({ content: buf, from, to, title: "audit", options: { repair: false } });
      const data = res?.data;
      let text;
      if (typeof data === "string" && data.startsWith("data:")) {
        console.log(`  -> ${to}: [binary ${Math.round(data.length * 0.75)}B dataURI]`);
        continue;
      }
      text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
      const moj = text.match(MOJIBAKE_RE);
      const preview = text.replace(/\s+/g, " ").slice(0, 150);
      const warn = (res.warnings || []).map(w => w.code).filter(Boolean);
      console.log(`  -> ${to}: ${moj ? "❌MOJIBAKE '" + moj[0] + "'" : "ok"} ${warn.length ? "warn:" + warn.join(",") : ""}`);
      console.log(`       ${preview}`);
    } catch (e) {
      console.log(`  -> ${to}: ❌FAIL ${e.code || ""} ${String(e.message).slice(0, 110)}`);
    }
  }
}
