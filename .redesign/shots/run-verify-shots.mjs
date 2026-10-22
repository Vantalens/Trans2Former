// 补充验证截图：转换完成态、检验报告、独立预览页、安全中心弹窗
import puppeteer from "puppeteer";
import { startWebServer } from "../../src/web-server.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { server, port } = await startWebServer(0);
const baseUrl = `http://127.0.0.1:${port}`;
console.log(`server at ${baseUrl}`);

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text()); });

  await page.goto(baseUrl + "/#/workbench", { waitUntil: "networkidle0" });
  await page.waitForSelector("#loadSampleButton", { timeout: 15000 });
  await page.click("#loadSampleButton");
  await sleep(600);
  await page.click("#transformButton");
  await page.waitForSelector("#conversionProgress[data-state='complete']", { timeout: 30000 });
  await sleep(600);

  // 转换完成态（进度条满 + 下载可用）
  await page.screenshot({ path: ".redesign/shots/workbench-converted.png" });
  console.log("saved workbench-converted");

  // 结果 tab + 检验报告展开
  await page.click("#outputPreviewTab");
  await sleep(400);
  const vr = await page.$("#verificationReportPanel");
  if (vr) await page.evaluate((el) => { el.open = true; }, vr);
  await sleep(300);
  await page.screenshot({ path: ".redesign/shots/workbench-result.png" });
  console.log("saved workbench-result");

  // 安全中心弹窗（按钮在「更多」折叠菜单内，先展开）
  await page.evaluate(() => {
    const details = document.querySelector(".auxiliary-actions");
    if (details) details.open = true;
  });
  await sleep(200);
  await page.evaluate(() => document.getElementById("securityCenterButton")?.click());
  await sleep(700);
  await page.screenshot({ path: ".redesign/shots/security-dialog.png" });
  console.log("saved security-dialog");

  // 独立预览页
  const [previewPage] = await Promise.all([
    new Promise((resolve) => browser.once("targetcreated", async (t) => resolve(await t.page()))),
    page.evaluate(() => document.getElementById("openStandalonePreviewButton")?.click()),
  ]);
  await sleep(1500);
  if (previewPage) {
    await previewPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await sleep(800);
    await previewPage.screenshot({ path: ".redesign/shots/preview-standalone.png" });
    console.log("saved preview-standalone");
  }

  await page.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
}
console.log("done");
