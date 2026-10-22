// 用仿真的中英文混排 PDF 实测转换链路（本地验证脚本，不入库）。
// 覆盖：pdf → txt/md/html/json/docx 提取质量、pdf → pdf 字节保留、质量报告字段。
import { readFileSync } from "node:fs";
import { convertContentAsync } from "../../public/browser-transformer.js";
import { expandPdfContentForTextExtraction } from "../../public/formats/pdf.js";
import { readDocx } from "../../public/formats/docx.js";

const pdfBytes = readFileSync("samples/generated/mixed-cn-en-form.pdf");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log("========== 1. pdf → txt ==========");
const toTxt = await convertContentAsync({
  content: pdfBytes, from: "pdf", to: "txt", title: "mixed-cn-en-form.pdf", options: { repair: false },
});
console.log("--- 提取文本 ---");
console.log(toTxt.data);
console.log("--- warnings ---");
for (const w of toTxt.warnings || []) console.log(`  [${w.severity}] ${w.code}: ${w.message}`);
console.log("--- quality ---");
console.log(JSON.stringify({
  textFidelity: toTxt.quality?.qualityReport?.textFidelity,
  layoutFidelity: toTxt.quality?.qualityReport?.layoutFidelity,
  unresolvedPdfPages: toTxt.quality?.qualityReport?.unresolvedPdfPages,
}, null, 2));

const text = toTxt.data;
check("英文单词不被拆开", /\bInternational\b|Servo Motor|Precision Gear/.test(text) && !/S e r v o|P r e c i s i o n/.test(text));
check("字段标签与值同行（表单对齐）", /姓名 Name:.*张三 Zhang San/.test(text.replace(/\s+/g, " ")) || /姓名 Name:\s*张三 Zhang San/.test(text));
check("右列字段同一逻辑行", /ACCT-10245/.test(text) && /\+86 138-0000-1234/.test(text));
check("下划线字段名保留", /field__id__legacy-A102/.test(text));
check("金额与小数完整", /\$1,234\.56/.test(text) && /13\.00%/.test(text));
check("表格单元格文本齐", ["Servo Motor", "Precision Gear", "¥6,400.00", "¥855.00"].every((s) => text.includes(s)));
check("中文条款保留", /本合同受中华人民共和国法律管辖/.test(text));
check("第 2 页内容存在", /Terms and Conditions/.test(text) && /Supplier Signature/.test(text));
check("不是扫描件误判", !(toTxt.warnings || []).some((w) => w.code === "PDF_PAGES_WITHOUT_TEXT"));
check("条款编号保持 1/2/3/4 不拆重排", ["1. Delivery", "2. Warranty", "3. Liability", "4. Governing Law"].every((s) => text.includes(s)));
check("签名下划线串不缩减（12 个下划线 ×2）", (text.match(/Date 日期: _{12}/g) || []).length === 2);
check("CID 字体不错乱（无替换字符）", !/�/.test(text));

console.log("\n========== 2. pdf → md / html / json ==========");
for (const to of ["md", "html", "json"]) {
  const out = await convertContentAsync({ content: pdfBytes, from: "pdf", to, title: "mixed-cn-en-form.pdf", options: { repair: false } });
  const payload = typeof out.data === "string" ? out.data : JSON.stringify(out.data);
  check(`pdf → ${to} 提取内容`, payload.includes("张三") && payload.includes("Servo Motor"), `length=${payload.length}`);
}

console.log("\n========== 3. pdf → docx 往返 ==========");
const toDocx = await convertContentAsync({ content: pdfBytes, from: "pdf", to: "docx", title: "mixed-cn-en-form.pdf", options: { repair: false } });
const docxBytes = Buffer.from(toDocx.data.split(",")[1], "base64");
const docxModel = readDocx({ content: new Uint8Array(docxBytes), title: "roundtrip" });
const docxText = JSON.stringify(docxModel.blocks);
check("pdf → docx 可读回且含字段", docxText.includes("张三") && docxText.includes("ACCT-10245"));
check("pdf → docx 含表格内容", docxText.includes("Servo Motor"));

console.log("\n========== 4. pdf → pdf ==========");
const toPdf = await convertContentAsync({ content: pdfBytes, from: "pdf", to: "pdf", title: "mixed-cn-en-form.pdf" });
check("pdf → pdf 字节级保留原件", Buffer.from(toPdf.data.split(",")[1], "base64").equals(pdfBytes));
check("pdf → pdf 发出保留提示", (toPdf.warnings || []).some((w) => w.code === "PDF_ORIGINAL_PRESERVED"));

console.log("\n========== 5. 预提取同步路径（工作台实际路径） ==========");
const expanded = await expandPdfContentForTextExtraction(pdfBytes);
const syncModel = await convertContentAsync({ content: expanded, from: "pdf", to: "txt", title: "expanded", options: { repair: false } });
check("预提取路径文本一致", syncModel.data.includes("张三 Zhang San"));

const failed = results.filter((r) => !r.ok);
console.log(`\n========== 结果: ${results.length - failed.length}/${results.length} 通过 ==========`);
process.exit(failed.length ? 1 : 0);
