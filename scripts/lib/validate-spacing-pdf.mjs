// 空格压测：逐字符加字距 / 逐词词距 / 紧密排布三种场景下的提取结果。
// 已知边界：拉丁加字距碎词（"E x p a n d e d"）的词边界在 pdf.js 合并 item 时丢失，
// 无法可靠还原（上游启发式限制）；CJK 伪空格必须收拢。
import { readFileSync } from "node:fs";
import { convertContentAsync } from "../../public/browser-transformer.js";

const pdfBytes = readFileSync("samples/generated/spacing-stress.pdf");
const out = await convertContentAsync({
  content: new Uint8Array(pdfBytes), from: "pdf", to: "txt", title: "spacing-stress.pdf", options: { repair: false },
});
console.log("--- 提取文本 ---");
console.log(out.data);
console.log("--- 判定 ---");
const text = out.data;
let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (!ok) failed += 1;
};
check("CJK 伪空格收拢（加字距版 而非 加 字 距 版）", /加字距版/.test(text) && !/加 字 距/.test(text));
check("多字 CJK 词间对齐空格保留（逐词 绘制）", /逐词 绘制/.test(text));
check("逐词行单词间单空格", /Word by word/.test(text));
check("紧密行无空格", /Compact/.test(text));
check("正常行不受影响", /Normal spacing line 正常行 ACCT-10245/.test(text));
const latin = text.split("\n").find((l) => l.includes("xpanded") || l.includes("x p a n"));
console.log(`⚠️ 已知上游限制 — 拉丁加字距行实际: ${JSON.stringify(latin)}（pdf.js addFakeSpaces 词边界不可还原）`);
process.exit(failed ? 1 : 0);
