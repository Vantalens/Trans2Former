// Redesign screenshot tool — landing dark console + workbench.
// 用法: node scripts/redesign-screenshot.mjs [outPrefix]
// 说明: .landing-view 是内部滚动容器（body overflow hidden），
//   先分段滚动触发全部 reveal，再临时展开容器做整页截图。
import puppeteer from "puppeteer";
import { startWebServer } from "../src/web-server.js";

const prefix = process.argv[2] || "redesign";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { server, port } = await startWebServer(0);
const baseUrl = `http://127.0.0.1:${port}`;
console.log(`server at ${baseUrl}`);

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
});

async function triggerAllReveals(page) {
  await page.evaluate(async () => {
    const scroller = document.querySelector(".landing-view");
    if (!scroller) return;
    const step = Math.max(200, Math.floor(scroller.clientHeight * 0.6));
    for (let y = 0; y <= scroller.scrollHeight; y += step) {
      scroller.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    scroller.scrollTo(0, 0);
  });
  await sleep(500);
}

async function scrollToSelector(page, selector, extraOffset = 0) {
  await page.evaluate(({ selector, extraOffset }) => {
    const scroller = document.querySelector(".landing-view");
    const el = document.querySelector(selector);
    if (!scroller || !el) return;
    const top = el.offsetTop + extraOffset;
    scroller.scrollTo(0, Math.max(0, top));
  }, { selector, extraOffset });
  await sleep(450);
}

try {
  // ---------- Desktop 1440x900 ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(baseUrl + "/", { waitUntil: "networkidle0" });
  await page.waitForSelector(".landing-hero-title", { timeout: 15000 });
  await sleep(600);

  await triggerAllReveals(page);

  // hero 首屏
  await scrollToSelector(page, ".landing-hero", -20);
  await page.screenshot({ path: `${prefix}-landing-hero.png` });
  console.log("saved hero");

  // 特性区（含扫描光束宽卡）
  await scrollToSelector(page, "#features", -30);
  await page.screenshot({ path: `${prefix}-landing-features.png` });
  console.log("saved features");

  // 格式矩阵
  await scrollToSelector(page, "#formats", -30);
  await page.screenshot({ path: `${prefix}-landing-matrix.png` });
  console.log("saved matrix");

  // 工作流 + CTA
  await scrollToSelector(page, "#workflow", -30);
  await page.screenshot({ path: `${prefix}-landing-workflow.png` });
  console.log("saved workflow");

  // 整页：临时展开内部滚动容器
  await page.evaluate(() => {
    const el = document.querySelector(".landing-view");
    el.style.overflow = "visible";
    el.style.height = "auto";
    document.body.style.overflow = "visible";
    const shell = document.querySelector(".app-shell");
    if (shell) { shell.style.height = "auto"; shell.style.minHeight = "0"; shell.style.display = "block"; }
  });
  await sleep(400);
  await page.screenshot({ path: `${prefix}-landing-full.png`, fullPage: true });
  console.log("saved full");
  await page.close();

  // ---------- Workbench 1440x900 ----------
  const wb = await browser.newPage();
  await wb.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await wb.goto(baseUrl + "/#/workbench", { waitUntil: "networkidle0" });
  await wb.waitForSelector("#transformButton", { timeout: 15000 });
  const sampleBtn = await wb.$("#loadSampleButton");
  if (sampleBtn) { await sampleBtn.click(); await sleep(800); }
  await wb.screenshot({ path: `${prefix}-workbench.png` });
  console.log("saved workbench");
  await wb.close();

  // ---------- Mobile 390x844 ----------
  const mob = await browser.newPage();
  await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.goto(baseUrl + "/", { waitUntil: "networkidle0" });
  await mob.waitForSelector(".landing-hero-title", { timeout: 15000 });
  await sleep(600);
  await triggerAllReveals(mob);
  await scrollToSelector(mob, ".landing-hero", -10);
  await mob.screenshot({ path: `${prefix}-mobile.png` });
  console.log("saved mobile");
  await mob.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
}
console.log("done");
