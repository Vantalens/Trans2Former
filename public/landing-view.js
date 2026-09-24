import {
  getFormatCapabilities,
  getKnownInputFormats,
  getAllowedOutputFormats,
  getRouteDetails,
} from "./browser-transformer.js";
import { navigate } from "./router.js";

const FORMAT_LABELS = {
  md: "Markdown",
  html: "HTML",
  txt: "TXT",
  json: "JSON",
  xml: "XML",
  csv: "CSV",
  xlsx: "XLSX",
  doc: "DOC",
  docx: "DOCX",
  epub: "EPUB",
  pdf: "PDF",
  pptx: "PPTX",
  png: "PNG",
  ofd: "OFD",
};

const ROUTE_CLASS_BADGES = {
  recommended: { label: "推荐", className: "is-recommended" },
  degraded: { label: "降级", className: "is-degraded" },
  generated: { label: "生成", className: "is-generated" },
  restricted: { label: "受限", className: "is-restricted" },
};

const FEATURE_CARDS = [
  {
    icon: "shield",
    tag: "F.01",
    title: "本地优先",
    body: "文档处理、预览、编辑、导出全部在浏览器或 Tauri 壳内完成。零云端依赖、零数据上传，处理阶段禁联网。",
  },
  {
    icon: "graph",
    tag: "F.02",
    title: "五模型路由",
    body: "SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel / AssetGraph 五个并列规范模型，Capability Registry + Route Planner 计算路径温度与降级。",
  },
  {
    icon: "wand",
    tag: "F.03",
    title: "Repair Engine 自动修复",
    body: "结构化修复动作 + 规则驱动 validator + post-repair 复核。当前实现：replaceTextRun + selectFallbackRoute 自动应用；insertTextRun / reorderBlocks / restoreTableGrid / adjustBoundingBox / regeneratePageLayout 为占位（S3/S4 路线图）。",
    wide: true,
    scan: true,
  },
  {
    icon: "scope",
    tag: "F.04",
    title: "三层转换检验",
    body: "规则 diff + SSIM 视觉对比 + OCR 回读三层组合写入 QualityReport，提供可解释的转换质量证据。",
  },
];

const WORKFLOW_STEPS = [
  { step: "01", title: "导入", body: "拖入或选择文件，自动识别格式" },
  { step: "02", title: "路由", body: "Planner 计算最佳路径与温度等级" },
  { step: "03", title: "Repair", body: "Repair Engine 提议、应用（当前 2/7 动作）、复核" },
  { step: "04", title: "质检", body: "规则 + SSIM + OCR 回读三层证据" },
  { step: "05", title: "输出", body: "高质量目标格式，可下载、可独立预览" },
];

// 扫描带里循环滚动的格式文档图标（两份副本实现无缝 marquee）
const SCAN_STRIP_FORMATS = ["md", "html", "txt", "json", "xml", "csv", "docx", "xlsx", "epub", "pdf", "pptx", "png"];

function formatNameOf(format) {
  return FORMAT_LABELS[format] || String(format || "").toUpperCase();
}

function svgIcon(name) {
  const paths = {
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    graph: '<path d="M4 18V8m6 10V4m6 14v-8m4 8H4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    wand: '<path d="M5 19l8-8m3-3l3-3M9 5h.01M19 9h.01M19 15h.01" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    scope: '<circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    arrow: '<path d="M5 12h14m-4-4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const inner = paths[name] || paths.shield;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="landing-icon">${inner}</svg>`;
}

function scanDocIcon(format) {
  const key = String(format || "").toUpperCase();
  return `
    <svg class="landing-scan-doc" viewBox="0 0 44 56" aria-hidden="true" focusable="false">
      <path d="M7 3h22l8 8v42H7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M29 3v8h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M13 17h18M13 22h18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>
      <text x="22" y="40" text-anchor="middle" class="landing-scan-doc-label">${key}</text>
    </svg>
  `;
}

function buildScanStrip() {
  const set = SCAN_STRIP_FORMATS.map(scanDocIcon).join("");
  return `
    <div class="landing-scan" aria-hidden="true">
      <div class="landing-scan-track">
        <div class="landing-scan-set">${set}</div>
        <div class="landing-scan-set">${set}</div>
      </div>
      <div class="landing-scan-beam"></div>
    </div>
  `;
}

function buildHero(host, stats) {
  const wrapper = document.createElement("section");
  wrapper.id = "hero";
  // 注意：meta 行中的版本号需与 package.json 的 version 保持一致（当前 2.4.0）
  wrapper.className = "landing-hero reveal-on-scroll";
  wrapper.innerHTML = `
    <div class="landing-hero-grid" aria-hidden="true"></div>
    <div class="landing-hero-meta">
      <span class="landing-hero-meta-item is-live">TRANS2FORMER</span>
      <span class="landing-hero-meta-item">V2.4.0</span>
      <span class="landing-hero-meta-item">LOCAL-FIRST</span>
      <span class="landing-hero-meta-item">${stats.inputFormats} IN × ${stats.outputFormats} OUT</span>
    </div>
    <div class="landing-hero-inner">
      <h2 class="landing-hero-title">把文档跨格式转换变成<br/><span class="landing-hero-accent">可验证、可修复、<wbr/>可解释</span>的工程</h2>
      <p class="landing-hero-sub"><span class="keep-together">${stats.inputFormats} 种输入 × ${stats.outputFormats} 种输出</span><span class="landing-hero-sep">//</span><span class="keep-together">${stats.recommendedRoutes} 条推荐路径</span><span class="landing-hero-sep">//</span><span class="keep-together">Repair Engine 2/7 动作已实现</span><span class="landing-hero-sep">//</span><span class="keep-together">处理阶段禁联网</span></p>
      <div class="landing-hero-actions">
        <button type="button" class="primary-button btn-gradient btn-lg" data-landing-cta>立即体验 ${svgIcon("arrow")}</button>
        <a href="#formats" class="landing-cta-ghost">查看路径矩阵</a>
      </div>
    </div>
    <ul class="landing-hero-badges">
      <li>零上传</li><li>零云端 OCR/AI</li><li>30–80 MB 默认安装包</li><li>PP-OCRv5 随包本地 OCR</li>
    </ul>
  `;
  host.appendChild(wrapper);
}

function buildReadoutPanel(stats) {
  const rows = [
    ["INPUTS", String(stats.inputFormats)],
    ["OUTPUTS", String(stats.outputFormats)],
    ["RECOMMENDED", String(stats.recommendedRoutes)],
    ["REPAIR ACTIONS", "2/7"],
    ["NETWORK", "OFF"],
  ];
  return `
    <aside class="landing-feature-readout reveal-on-scroll" aria-label="Capability Registry 快照">
      <span class="landing-readout-title">REGISTRY SNAPSHOT</span>
      ${rows.map(([key, value]) => `
        <div class="landing-readout-row">
          <span class="landing-readout-key">${key}</span>
          <i class="landing-readout-leader" aria-hidden="true"></i>
          <span class="landing-readout-value">${value}</span>
        </div>
      `).join("")}
    </aside>
  `;
}

function buildFeatures(host, stats) {
  const wrapper = document.createElement("section");
  wrapper.id = "features";
  wrapper.className = "landing-section landing-features";
  const cards = FEATURE_CARDS.map((card) => `
    <article class="landing-feature-card${card.wide ? " is-wide" : ""} reveal-on-scroll">
      <span class="landing-feature-tag" aria-hidden="true">${card.tag}</span>
      <span class="landing-feature-icon">${svgIcon(card.icon)}</span>
      <h4>${card.title}</h4>
      <p>${card.body}</p>
      ${card.scan ? buildScanStrip() : ""}
    </article>
  `);
  // 宽卡（Repair Engine）与 Registry 快照面板占据第一行，其余卡片第二行
  const [localFirst, routing, repair, verification] = cards;
  wrapper.innerHTML = `
    <div class="landing-section-heading reveal-on-scroll">
      <span class="landing-section-eyebrow">CORE CAPABILITIES / 核心特性</span>
      <h3>用工程方法保住跨格式转换的真实质量</h3>
    </div>
    <div class="landing-feature-grid">
      ${repair}
      ${buildReadoutPanel(stats)}
      ${localFirst}
      ${routing}
      ${verification}
    </div>
  `;
  host.appendChild(wrapper);
}

function buildFormats(host) {
  const inputs = getKnownInputFormats();
  const wrapper = document.createElement("section");
  wrapper.id = "formats";
  wrapper.className = "landing-section landing-formats";
  const rows = inputs.map((from) => {
    const outputs = getAllowedOutputFormats(from);
    const chips = outputs.map((to) => {
      const details = getRouteDetails(from, to) || {};
      const badge = ROUTE_CLASS_BADGES[details.routeClass] || ROUTE_CLASS_BADGES.recommended;
      return `<li class="landing-route-chip ${badge.className}" title="${badge.label}">${formatNameOf(to)}</li>`;
    }).join("");
    return `
      <article class="landing-format-row reveal-on-scroll">
        <div class="landing-format-input">
          <span class="landing-format-key">${String(from).toUpperCase()}</span>
          <span class="landing-format-name">${formatNameOf(from)}</span>
        </div>
        <ul class="landing-route-chips">${chips}</ul>
      </article>
    `;
  }).join("");
  wrapper.innerHTML = `
    <div class="landing-section-heading reveal-on-scroll">
      <span class="landing-section-eyebrow">ROUTE MATRIX / 格式矩阵</span>
      <h3>${inputs.length} 种输入 × 推荐输出</h3>
      <p class="landing-section-sub">每条路径的徽章颜色映射到 Capability Registry 的 routeClass：推荐 / 降级 / 生成 / 受限。</p>
    </div>
    <div class="landing-format-table reveal-on-scroll">
      <div class="landing-format-head" aria-hidden="true">
        <span>INPUT</span>
        <span>OUTPUT ROUTES</span>
      </div>
      <div class="landing-format-grid">${rows}</div>
      <div class="landing-format-legend">
        <span class="landing-format-legend-label">ROUTECLASS</span>
        <span class="landing-route-chip is-recommended">推荐</span>
        <span class="landing-route-chip is-degraded">降级</span>
        <span class="landing-route-chip is-generated">生成</span>
        <span class="landing-route-chip is-restricted">受限</span>
      </div>
    </div>
  `;
  host.appendChild(wrapper);
}

function buildWorkflow(host) {
  const wrapper = document.createElement("section");
  wrapper.id = "workflow";
  wrapper.className = "landing-section landing-workflow";
  wrapper.innerHTML = `
    <div class="landing-section-heading reveal-on-scroll">
      <span class="landing-section-eyebrow">PIPELINE / 工作流</span>
      <h3>从导入到输出，每一步都有可观察的质量证据</h3>
    </div>
    <ol class="landing-workflow-track">
      ${WORKFLOW_STEPS.map((item) => `
        <li class="landing-workflow-step reveal-on-scroll">
          <span class="landing-workflow-index">${item.step}</span>
          <div>
            <strong>${item.title}</strong>
            <p>${item.body}</p>
          </div>
        </li>
      `).join("")}
    </ol>
  `;
  host.appendChild(wrapper);
}

function buildCta(host) {
  const wrapper = document.createElement("section");
  wrapper.id = "cta";
  wrapper.className = "landing-section landing-cta reveal-on-scroll";
  wrapper.innerHTML = `
    <span class="landing-cta-eyebrow">READY / 开始</span>
    <h3>现在就开始一次<span class="landing-cta-accent">本地优先</span>的转换</h3>
    <p>无需注册、无云端依赖、无插件安装。打开工作台，拖入文件，立刻看到结构化质量报告。</p>
    <button type="button" class="primary-button btn-gradient btn-lg" data-landing-cta>打开工作台 ${svgIcon("arrow")}</button>
  `;
  host.appendChild(wrapper);
}

function buildFooter(host) {
  const footer = document.createElement("footer");
  footer.className = "landing-footer";
  footer.innerHTML = `
    <div class="landing-footer-inner">
      <span>TRANS2FORMER · V2.4.0</span>
      <span>LOCAL-FIRST · NO CLOUD · NO UPLOAD</span>
    </div>
  `;
  host.appendChild(footer);
}

function attachRevealObserver(root) {
  const targets = root.querySelectorAll(".reveal-on-scroll");
  const revealAll = () => targets.forEach((el) => el.classList.add("is-revealed"));
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealAll();
    return;
  }
  if (typeof IntersectionObserver === "undefined") {
    revealAll();
    return;
  }
  // reveal-armed 门控：只有 observer 真正武装成功后，CSS 才允许隐藏未 reveal 的区块。
  // 这样 fullPage 截图、打印或 JS 未执行的嵌入环境下，内容始终保持可见。
  root.classList.add("reveal-armed");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  targets.forEach((el) => observer.observe(el));
}

function attachCtas(root) {
  const buttons = root.querySelectorAll("[data-landing-cta]");
  for (const btn of buttons) {
    btn.addEventListener("click", () => navigate("workbench"));
  }
}

function computeStats(capabilities) {
  const inputs = getKnownInputFormats();
  const outputSet = new Set();
  let recommended = 0;
  for (const from of inputs) {
    for (const to of getAllowedOutputFormats(from)) {
      outputSet.add(to);
      const details = getRouteDetails(from, to);
      if (details?.routeClass === "recommended" || !details?.routeClass) recommended += 1;
    }
  }
  return {
    inputFormats: inputs.length,
    outputFormats: outputSet.size,
    recommendedRoutes: recommended,
    totalFormats: capabilities.length,
  };
}

let mounted = false;

export function mountLanding(root) {
  if (!root) return;
  if (mounted) {
    attachRevealObserver(root);
    return;
  }
  mounted = true;
  const capabilities = getFormatCapabilities();
  const stats = computeStats(capabilities);
  root.innerHTML = "";
  buildHero(root, stats);
  buildFeatures(root, stats);
  buildFormats(root);
  buildWorkflow(root);
  buildCta(root);
  buildFooter(root);
  attachCtas(root);
  attachRevealObserver(root);
}
