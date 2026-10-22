// 稿纸蓝图重构截图：landing（首屏/特性/矩阵/CTA）+ workbench（示例载入后）+ 390px 移动宽度
// 输出到 .redesign/shots/
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
  await sleep(900); // 等 reveal 动画与 count-up 终态
}

async function scrollToSelector(page, selector, extraOffset = 0) {
  await page.evaluate(({ selector, extraOffset }) => {
    const scroller = document.querySelector(".landing-view");
    const el = document.querySelector(selector);
    if (!scroller || !el) return;
    const top = el.offsetTop + extraOffset;
    scroller.scrollTo(0, Math.max(0, top));
  }, { selector, extraOffset });
  await sleep(600);
}

try {
  // ---------- Desktop 1440x900：Landing ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(baseUrl + "/", { waitUntil: "networkidle0" });
  await page.waitForSelector(".landing-hero-title", { timeout: 15000 });
  await sleep(600);
  await triggerAllReveals(page);

  await scrollToSelector(page, ".landing-hero", -20);
  await page.screenshot({ path: ".redesign/shots/landing-hero.png" });
  console.log("saved landing-hero");

  await scrollToSelector(page, "#features", -30);
  await sleep(400);
  await page.screenshot({ path: ".redesign/shots/landing-features.png" });
  console.log("saved landing-features");

  await scrollToSelector(page, "#formats", -30);
  await page.screenshot({ path: ".redesign/shots/landing-matrix.png" });
  console.log("saved landing-matrix");

  await scrollToSelector(page, "#cta", -40);
  await page.screenshot({ path: ".redesign/shots/landing-cta.png" });
  console.log("saved landing-cta");
  await page.close();

  // ---------- Workbench 1440x900（载入示例文档） ----------
  const wb = await browser.newPage();
  await wb.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await wb.goto(baseUrl + "/#/workbench", { waitUntil: "networkidle0" });
  await wb.waitForSelector("#transformButton", { timeout: 15000 });
  const sampleBtn = await wb.$("#loadSampleButton");
  if (sampleBtn) { await sampleBtn.click(); await sleep(1000); }
  await wb.screenshot({ path: ".redesign/shots/workbench.png" });
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
  await mob.screenshot({ path: ".redesign/shots/mobile-390.png" });
  console.log("saved mobile-390");
  await mob.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
}
console.log("done");
