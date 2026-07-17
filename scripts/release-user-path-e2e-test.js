import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import puppeteer from "puppeteer";

import { convertContent } from "../public/browser-transformer.js";
import { startWebServer } from "../src/web-server.js";

const PORT_START = 49314;
const PORT_END = 49414;

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function findPort() {
  for (let port = PORT_START; port <= PORT_END; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No local port available for release user-path E2E test");
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/s);
  assert.ok(match, "binary fixture generation must return a base64 data URL");
  return Buffer.from(match[1], "base64");
}

async function writeGeneratedFixture(directory, fileName, conversion) {
  assert.equal(conversion.type, "binary", `${fileName} fixture must be binary`);
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, decodeDataUrl(conversion.data));
  return filePath;
}
async function uploadInput(page, filePath, expectedFormat) {
  await page.$eval("#fileInput", (element) => { element.value = ""; });
  const input = await page.$("#fileInput");
  await input.uploadFile(filePath);
  await page.waitForFunction(
    (format) => document.getElementById("fromFormatSelect")?.value === format,
    { timeout: 10000 },
    expectedFormat,
  );
}

async function runConversion(page, { to, expectedText = "", expectedExtension, allowExplicitOcrFailure = false }) {
  await page.select("#toFormatSelect", to);
  const previousHref = await page.$eval("#downloadOutputButton", (element) => element.getAttribute("href") || "");
  await page.click("#transformButton");
  await page.waitForFunction(
    (oldHref) => {
      const state = document.getElementById("conversionProgress")?.dataset.state;
      const href = document.getElementById("downloadOutputButton")?.getAttribute("href") || "";
      return state === "error" || (state === "complete" && href.startsWith("blob:") && href !== oldHref);
    },
    { timeout: 60000 },
    previousHref,
  );

  const result = await page.evaluate(() => ({
    state: document.getElementById("conversionProgress")?.dataset.state || "",
    href: document.getElementById("downloadOutputButton")?.getAttribute("href") || "",
    download: document.getElementById("downloadOutputButton")?.getAttribute("download") || "",
    output: document.getElementById("outputEditor")?.value
      || document.getElementById("textOutputPreview")?.textContent
      || "",
    errorHidden: document.getElementById("errorDetailsPanel")?.hidden,
    errorSummary: document.getElementById("errorSummary")?.textContent || "",
    errorDebug: document.getElementById("errorDebugText")?.textContent || "",
  }));
  const downloadText = result.href.startsWith("blob:")
    ? await page.evaluate(async (href) => await (await fetch(href)).text(), result.href)
    : "";
  const searchableOutput = `${result.output}\n${downloadText}`;


  if (result.state === "error" && allowExplicitOcrFailure) {
    assert.equal(result.errorHidden, false, "OCR failure must expose the error panel");
    assert.ok(
      `${result.errorSummary} ${result.errorDebug}`.trim().length > 0,
      "OCR failure must include actionable diagnostics",
    );
    return { ...result, explicitFailure: true };
  }

  assert.equal(result.state, "complete", `conversion to ${to} must complete`);
  assert.equal(result.href.startsWith("blob:"), true, `conversion to ${to} must expose a Blob download`);
  assert.equal(result.download.endsWith(expectedExtension), true, `download must end with ${expectedExtension}`);
  assert.equal(result.errorHidden, true, `conversion to ${to} must not expose an error panel`);
  if (expectedText) {
    assert.equal(
      searchableOutput.includes(expectedText),
      true,
      `conversion to ${to} must retain ${expectedText}; actual=${JSON.stringify(searchableOutput.match(/.{0,40}RELEASE.{0,80}/g) || searchableOutput.slice(-240))}`,
    );
  }
  return { ...result, downloadText };
}

const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "trans2former-release-e2e-"));
const marker = "RELEASE-MATRIX-MARKER";
const markdown = `# Release Matrix\n\n${marker}\n\n| Name | Score |\n| --- | --- |\n| Alpha | 10 |`;
const csv = `Name,Score\n${marker},10\n`;
const browser = await puppeteer.launch({
  headless: "new",
  ...(process.env.CI && process.platform === "linux"
    ? { args: ["--no-sandbox", "--disable-setuid-sandbox"] }
    : {}),
});
const { server, port } = await startWebServer(await findPort());

try {
  const markdownPath = path.join(tempDirectory, "matrix.md");
  const htmlPath = path.join(tempDirectory, "matrix.html");
  const csvPath = path.join(tempDirectory, "matrix.csv");
  await Promise.all([
    writeFile(markdownPath, markdown),
    writeFile(htmlPath, `<h1>Release Matrix</h1><p>${marker}</p>`),
    writeFile(csvPath, csv),
  ]);
  const fixtures = {
    md: markdownPath,
    html: htmlPath,
    csv: csvPath,
    docx: await writeGeneratedFixture(tempDirectory, "matrix.docx", convertContent({ content: markdown, from: "md", to: "docx", title: "matrix" })),
    xlsx: await writeGeneratedFixture(tempDirectory, "matrix.xlsx", convertContent({ content: csv, from: "csv", to: "xlsx", title: "matrix" })),
    pptx: await writeGeneratedFixture(tempDirectory, "matrix.pptx", convertContent({ content: markdown, from: "md", to: "pptx", title: "matrix" })),
    pdf: await writeGeneratedFixture(tempDirectory, "matrix.pdf", convertContent({ content: markdown, from: "md", to: "pdf", title: "matrix" })),
  };

  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle0" });
  await page.click("[data-nav-workbench]");
  // Exercise the same upload entrypoint used by end users for every fixture.

  await uploadInput(page, fixtures.md, "md");
  await runConversion(page, { to: "html", expectedText: marker, expectedExtension: ".html" });

  await uploadInput(page, fixtures.html, "html");
  await runConversion(page, { to: "md", expectedText: marker, expectedExtension: ".md" });

  await uploadInput(page, fixtures.csv, "csv");
  await runConversion(page, { to: "md", expectedText: marker, expectedExtension: ".md" });

  for (const format of ["xlsx", "docx", "pptx", "pdf"]) {
    await uploadInput(page, fixtures[format], format);
    await runConversion(page, {
      to: format === "pdf" ? "txt" : "md",
      expectedText: marker,
      expectedExtension: format === "pdf" ? ".txt" : ".md",
    });
  }

  await uploadInput(page, fixtures.md, "md");
  await runConversion(page, { to: "pdf", expectedExtension: ".pdf" });

  await uploadInput(page, path.resolve("samples/ocr/word-PAIN.png"), "png");
  const ocrResult = await runConversion(page, {
    to: "txt",
    expectedExtension: ".txt",
    allowExplicitOcrFailure: true,
  });
  if (!ocrResult.explicitFailure) {
    assert.ok(ocrResult.output.trim().length > 0, "successful OCR must produce non-empty text");
  }

  assert.deepEqual(pageErrors, [], `release user paths must not emit page errors:\n${pageErrors.join("\n")}`);
  console.log("Release user-path E2E passed: text, table, OOXML, PDF, download, and explicit OCR outcome verified.");
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(tempDirectory, { recursive: true, force: true });
}
