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
    title: "本地优先",
    body: "文档处理、预览、编辑、导出全部在浏览器或 Tauri 壳内完成。零云端依赖、零数据上传，处理阶段禁联网。",
  },
  {
    icon: "graph",
    title: "五模型路由",
    body: "SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel / AssetGraph 五个并列规范模型，Capability Registry + Route Planner 计算路径温度与降级。",
  },
  {
    icon: "wand",
    title: "Repair Engine 自动修复",
    body: "结构化修复动作 + 规则驱动 validator + post-repair 复核，转换缺陷自动检测、自动应用、复核失败回退。",
  },
  {
    icon: "scope",
    title: "三层转换检验",
    body: "规则 diff + SSIM 视觉对比 + OCR 回读三层组合写入 QualityReport，提供可解释的转换质量证据。",
  },
];

const WORKFLOW_STEPS = [
  { step: "1", title: "导入", body: "拖入或选择文件，自动识别格式" },
  { step: "2", title: "路由", body: "Planner 计算最佳路径与温度等级" },
  { step: "3", title: "Repair", body: "Repair Engine 提议、应用、复核修复动作" },
  { step: "4", title: "质检", body: "规则 + SSIM + OCR 回读三层证据" },
  { step: "5", title: "输出", body: "高质量目标格式，可下载、可独立预览" },
];

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

function buildHero(host, stats) {
  const wrapper = document.createElement("section");
  wrapper.id = "hero";
  wrapper.className = "landing-hero reveal-on-scroll";
  wrapper.innerHTML = `
    <div class="landing-hero-glow" aria-hidden="true"></div>
    <div class="landing-hero-inner">
      <span class="landing-hero-eyebrow">v2.2 · local-first 多格式转换工作台</span>
      <h2 class="landing-hero-title">把文档跨格式转换变成<br/><span class="landing-hero-accent">可验证、可修复、可解释</span>的工程</h2>
      <p class="landing-hero-sub">${stats.inputFormats} 种输入 × ${stats.outputFormats} 种输出 · ${stats.recommendedRoutes} 条推荐路径 · Repair Engine 自动修复 · 处理阶段禁联网</p>
      <div class="landing-hero-actions">
        <button type="button" class="landing-cta-primary" data-landing-cta>立即体验 ${svgIcon("arrow")}</button>
        <a href="#formats" class="landing-cta-ghost">查看路径矩阵</a>
      </div>
      <ul class="landing-hero-badges">
        <li>零上传</li><li>零云端 OCR/AI</li><li>30–80 MB 默认安装包</li><li>OCR 模型按需下载</li>
      </ul>
    </div>
  `;
  host.appendChild(wrapper);
}

function buildFeatures(host) {
  const wrapper = document.createElement("section");
  wrapper.id = "features";
  wrapper.className = "landing-section landing-features";
  wrapper.innerHTML = `
    <div class="landing-section-heading reveal-on-scroll">
      <span class="landing-section-eyebrow">核心特性</span>
      <h3>用工程方法保住跨格式转换的真实质量</h3>
    </div>
    <div class="landing-feature-grid">
      ${FEATURE_CARDS.map((card) => `
        <article class="landing-feature-card reveal-on-scroll">
          <span class="landing-feature-icon">${svgIcon(card.icon)}</span>
          <h4>${card.title}</h4>
          <p>${card.body}</p>
        </article>
      `).join("")}
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
          <span class="landing-format-name">${formatNameOf(from)}</span>
          <span class="landing-format-key">${String(from).toUpperCase()}</span>
        </div>
        <ul class="landing-route-chips">${chips}</ul>
      </article>
    `;
  }).join("");
  wrapper.innerHTML = `
    <div class="landing-section-heading reveal-on-scroll">
      <span class="landing-section-eyebrow">格式矩阵</span>
      <h3>${inputs.length} 种输入 × 推荐输出</h3>
      <p class="landing-section-sub">每条路径的徽章颜色映射到 Capability Registry 的 routeClass：推荐 / 降级 / 生成 / 受限。</p>
    </div>
    <div class="landing-format-grid">${rows}</div>
    <div class="landing-format-legend">
      <span class="landing-route-chip is-recommended">推荐</span>
      <span class="landing-route-chip is-degraded">降级</span>
      <span class="landing-route-chip is-generated">生成</span>
      <span class="landing-route-chip is-restricted">受限</span>
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
      <span class="landing-section-eyebrow">工作流</span>
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
    <h3>现在就开始一次本地优先的转换</h3>
    <p>无需注册、无云端依赖、无插件安装。打开工作台，拖入文件，立刻看到结构化质量报告。</p>
    <button type="button" class="landing-cta-primary" data-landing-cta>打开工作台 ${svgIcon("arrow")}</button>
  `;
  host.appendChild(wrapper);
}

function attachRevealObserver(root) {
  const targets = root.querySelectorAll(".reveal-on-scroll");
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach((el) => el.classList.add("is-revealed"));
    return;
  }
  if (typeof IntersectionObserver === "undefined") {
    targets.forEach((el) => el.classList.add("is-revealed"));
    return;
  }
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
  buildFeatures(root);
  buildFormats(root);
  buildWorkflow(root);
  buildCta(root);
  attachCtas(root);
  attachRevealObserver(root);
}
