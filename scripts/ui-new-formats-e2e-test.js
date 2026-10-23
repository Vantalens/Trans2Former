// UI E2E：验证新格式（YAML/TOML/IPYNB/LaTeX/ODT/SVG）在真实浏览器工作台中可选、可转换，
// 以及 GBK 文件上传路径不乱码。驱动方式与 ui-conversion-e2e-test.js 一致。
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";

import puppeteer from "puppeteer";

import { startWebServer } from "../src/web-server.js";

async function findPort(start = 49401, end = 49480) {
  for (let port = start; port <= end; port += 1) {
    if (await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, "127.0.0.1");
    })) return port;
  }
  throw new Error("No local port available");
}

const { server, port } = await startWebServer(await findPort());
const baseUrl = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

async function pasteAndConvert(page, { content, from, to }) {
  await page.$eval("#inputContent", (element, value) => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, content);
  await page.select("#fromFormatSelect", from);
  await page.select("#toFormatSelect", to);
  await page.click("#transformButton");
  await page.waitForSelector("#conversionProgress[data-state='complete']", { timeout: 15000 });
  return page.evaluate(() => ({
    meta: document.getElementById("outputMeta")?.textContent || "",
    preview: document.getElementById("textOutputPreview")?.textContent || "",
    editor: document.getElementById("outputEditor")?.value || "",
    downloadName: document.getElementById("downloadOutputButton")?.getAttribute("download") || "",
    errorHidden: document.getElementById("errorDetailsPanel")?.hidden,
  }));
}

try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.click("[data-nav-workbench]");

  // 1. 新格式在输入下拉框中可见；输出下拉框按输入格式动态过滤
  const formatOptions = await page.evaluate(() => ({
    from: [...document.getElementById("fromFormatSelect").options].map((o) => o.value),
    to: [...document.getElementById("toFormatSelect").options].map((o) => o.value),
  }));
  for (const fmt of ["yaml", "toml", "ipynb", "rtf", "latex", "odt", "jpeg", "webp", "svg"]) {
    assert.ok(formatOptions.from.includes(fmt), `输入下拉框应包含 ${fmt}`);
  }
  // 默认 md 输入：应包含 latex/ipynb 新输出
  for (const fmt of ["latex", "ipynb", "odt"]) {
    assert.ok(formatOptions.to.includes(fmt), `md 输入下输出应包含 ${fmt}`);
  }
  // 切到 json 输入：应出现 yaml/toml 输出
  await page.select("#fromFormatSelect", "json");
  await page.waitForFunction(
    () => [...document.getElementById("toFormatSelect").options].some((o) => o.value === "yaml"),
    { timeout: 5000 },
  );
  const jsonOutputs = await page.evaluate(
    () => [...document.getElementById("toFormatSelect").options].map((o) => o.value),
  );
  for (const fmt of ["yaml", "toml"]) {
    assert.ok(jsonOutputs.includes(fmt), `json 输入下输出应包含 ${fmt}`);
  }

  // 2. 粘贴 YAML → md
  const yamlResult = await pasteAndConvert(page, {
    content: "标题: 配置示例\n服务:\n  端口: 8080\n  启用: true\n列表:\n  - 项目甲\n  - 项目乙\n",
    from: "yaml",
    to: "md",
  });
  assert.equal(yamlResult.errorHidden, true, "yaml->md 不应报错");
  assert.match(yamlResult.editor + yamlResult.preview, /配置示例|端口|项目甲/, "yaml->md 应包含键值内容");
  assert.ok(yamlResult.downloadName.endsWith(".md"), "yaml->md 下载名应为 .md");

  // 3. json → yaml（数据格式互转方向）
  const toYaml = await pasteAndConvert(page, {
    content: '{"服务": {"端口": 8080, "名称": "测试服务"}}',
    from: "json",
    to: "yaml",
  });
  assert.equal(toYaml.errorHidden, true, "json->yaml 不应报错");
  assert.match(toYaml.editor + toYaml.preview, /8080|测试服务/, "json->yaml 应包含数据");
  assert.ok(toYaml.downloadName.endsWith(".yaml"), "json->yaml 下载名应为 .yaml");

  // 4. TOML → json
  const tomlResult = await pasteAndConvert(page, {
    content: "[server]\nhost = \"localhost\"\nport = 8080\n",
    from: "toml",
    to: "json",
  });
  assert.equal(tomlResult.errorHidden, true, "toml->json 不应报错");
  assert.match(tomlResult.editor + tomlResult.preview, /localhost|8080/, "toml->json 应包含数据");

  // 5. LaTeX → md
  const latexResult = await pasteAndConvert(page, {
    content: "\\section{引言}\n这是正文。\n\\begin{itemize}\n\\item 第一条\n\\item 第二条\n\\end{itemize}\n",
    from: "latex",
    to: "md",
  });
  assert.equal(latexResult.errorHidden, true, "latex->md 不应报错");
  assert.match(latexResult.editor + latexResult.preview, /引言|第一条/, "latex->md 应保留章节与列表");

  // 6. GBK 文件上传（真实文件路径，走 readBlobAsDecodedText）
  const fileInput = await page.$("#fileInput");
  await fileInput.uploadFile(path.resolve("samples/realworld/gbk.txt"));
  await page.waitForFunction(
    () => document.getElementById("inputContent")?.value?.includes("会议纪要"),
    { timeout: 15000 },
  );
  await page.select("#toFormatSelect", "md");
  await page.click("#transformButton");
  await page.waitForSelector("#conversionProgress[data-state='complete']", { timeout: 15000 });
  const gbkResult = await page.evaluate(() => ({
    editor: document.getElementById("outputEditor")?.value || "",
    preview: document.getElementById("textOutputPreview")?.textContent || "",
  }));
  assert.match(gbkResult.editor + gbkResult.preview, /会议纪要|议题讨论/, "GBK 上传转换后应为正确中文");
  assert.doesNotMatch(gbkResult.editor + gbkResult.preview, /\uFFFD|\d+,\d+,\d+/, "GBK 输出不得有替换符或字节数字串");

  // 7. ODT 文件上传 → md（二进制 data URL 路径）
  await fileInput.uploadFile(path.resolve("samples/odt/heading-list.odt"));
  await page.waitForFunction(
    () => document.getElementById("fromFormatSelect")?.value === "odt",
    { timeout: 15000 },
  );
  await page.select("#toFormatSelect", "md");
  await page.click("#transformButton");
  await page.waitForSelector("#conversionProgress[data-state='complete']", { timeout: 15000 });
  const odtResult = await page.evaluate(() => ({
    editor: document.getElementById("outputEditor")?.value || "",
    preview: document.getElementById("textOutputPreview")?.textContent || "",
    errorHidden: document.getElementById("errorDetailsPanel")?.hidden,
  }));
  assert.equal(odtResult.errorHidden, true, "odt 上传转换不应报错");
  assert.ok((odtResult.editor + odtResult.preview).trim().length > 0, "odt->md 应有内容输出");

  // CI 环境不含本地 OCR vendor 资产，paddle-default-models 的 det.onnx HEAD 探测会
  // 产生一条通用 404 控制台消息（不含 URL/“favicon” 字样）——与 ui-conversion-e2e-test
  // 的既有约定一致，这类可选资产 404 属于预期噪音，不视为失败。
  const fatalErrors = consoleErrors.filter((text) => !/favicon|404 \(Not Found\)|net::ERR_ABORTED|Download the React DevTools/i.test(text));
  assert.deepEqual(fatalErrors, [], `浏览器控制台不应有错误: ${fatalErrors.join(" | ")}`);

  console.log("UI new-formats E2E passed: 下拉框可见、yaml/toml/latex 粘贴转换、GBK 上传、ODT 上传全部正常");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
