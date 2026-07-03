import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";

import puppeteer from "puppeteer";

import { startWebServer } from "../src/web-server.js";

const PORT_START = 49233;
const PORT_END = 49313;
const SAMPLE_MARKDOWN_PATH = path.resolve("samples/md/chinese.md");

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findPort() {
  for (let port = PORT_START; port <= PORT_END; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No local port available for UI conversion E2E test");
}

const { server, port } = await startWebServer(await findPort());
const baseUrl = `http://127.0.0.1:${port}`;
const browser = await puppeteer.launch({ headless: "new" });

try {
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack || error.message);
  });

  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.click("[data-nav-workbench]");
  await page.click("#loadSampleButton");
  await page.select("#fromFormatSelect", "md");
  await page.select("#toFormatSelect", "html");
  await page.click("#transformButton");

  await page.waitForSelector("#conversionProgress[data-state='complete']", { timeout: 10000 });

  const result = await page.evaluate(() => ({
    progressState: document.getElementById("conversionProgress")?.dataset.state,
    outputMeta: document.getElementById("outputMeta")?.textContent || "",
    textPreview: document.getElementById("textOutputPreview")?.textContent || "",
    downloadHref: document.getElementById("downloadOutputButton")?.getAttribute("href") || "",
    downloadName: document.getElementById("downloadOutputButton")?.getAttribute("download") || "",
    errorPanelHidden: document.getElementById("errorDetailsPanel")?.hidden,
  }));

  assert.equal(result.progressState, "complete", "UI conversion should finish with complete progress state");
  assert.match(result.outputMeta, /HTML|text\/html|输出已生成/, "UI output metadata should describe generated HTML");
  assert.match(result.textPreview, /示例文档|Trans2Former|转换/, "UI output preview should contain converted sample content");
  assert.equal(result.downloadHref.startsWith("blob:"), true, "UI download link should point to a generated Blob URL");
  assert.equal(result.downloadName.endsWith(".html"), true, "UI download filename should use target extension");
  assert.equal(result.errorPanelHidden, true, "UI error panel should remain hidden after a successful conversion");
  await page.$eval("#fileInput", (input) => { input.value = ""; });
  const fileInput = await page.$("#fileInput");
  await fileInput.uploadFile(SAMPLE_MARKDOWN_PATH);
  await page.waitForFunction(() => document.getElementById("inputContent")?.value.includes("中文样例"), { timeout: 10000 });
  await page.select("#toFormatSelect", "html");
  await page.click("#transformButton");
  await page.waitForFunction(
    () => document.getElementById("downloadOutputButton")?.getAttribute("download") === "chinese.html",
    { timeout: 10000 },
  );

  const uploadResult = await page.evaluate(() => ({
    progressState: document.getElementById("conversionProgress")?.dataset.state,
    from: document.getElementById("fromFormatSelect")?.value || "",
    to: document.getElementById("toFormatSelect")?.value || "",
    textPreview: document.getElementById("textOutputPreview")?.textContent || "",
    downloadHref: document.getElementById("downloadOutputButton")?.getAttribute("href") || "",
    downloadName: document.getElementById("downloadOutputButton")?.getAttribute("download") || "",
    errorPanelHidden: document.getElementById("errorDetailsPanel")?.hidden,
  }));

  assert.equal(uploadResult.progressState, "complete", "uploaded-file conversion should finish with complete progress state");
  assert.equal(uploadResult.from, "md", "uploaded Markdown file should select Markdown input format");
  assert.equal(uploadResult.to, "html", "uploaded Markdown file should keep HTML output format");
  assert.match(uploadResult.textPreview, /中文样例/, "uploaded-file output preview should contain converted sample content");
  assert.equal(uploadResult.downloadHref.startsWith("blob:"), true, "uploaded-file download link should point to a Blob URL");
  assert.equal(uploadResult.downloadName, "chinese.html", "uploaded-file download filename should use the source base name and target extension");
  assert.equal(uploadResult.errorPanelHidden, true, "UI error panel should remain hidden after uploaded-file conversion");
  assert.deepEqual(pageErrors, [], `UI should not emit page errors:\n${pageErrors.join("\n")}`);
  assert.deepEqual(
    consoleErrors.filter((entry) => !entry.includes("404 (Not Found)")),
    [],
    `UI should not emit console errors/warnings:\n${consoleErrors.join("\n")}`,
  );

  console.log("UI conversion E2E passed: sample Markdown converts through the real workbench path.");
} finally {
  await browser.close();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
