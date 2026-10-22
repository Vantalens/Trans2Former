# Trans2Former 前端重构设计规范 —「稿纸蓝图」

> 本文件是重构执行的工作规范。实现者必须逐条遵守「红线契约」章节。

## 1. 设计概念

**稿纸蓝图（Paper Blueprint）**：文档转换工具的「工程感」用制图稿纸语言表达——暖色稿纸底色、油墨正文、发丝线（hairline）制图网格、朱砂红印章色作为唯一强调色。编辑衬线（serif）标题传递「文档」气质，等宽字体（mono）传递「仪器/工程」气质。两个视图（Landing / Workbench）统一为同一套浅色稿纸主题，消除现状 Landing 深色 / Workbench 浅色的割裂。

禁止：蓝紫渐变、玻璃拟态、彩色圆角图标容器、卡片套卡片、无意义的缩放/浮动动画、pill 按钮堆叠。

## 2. 设计令牌（styles.css `:root` 全量替换值，token 名保持不变）

```css
:root {
  color-scheme: light;

  /* 稿纸底色与纸面 */
  --bg: #f4f1e8;              /* 暖稿纸 */
  --surface: #fdfcf7;         /* 纸面 */
  --surface-raised: #ffffff;  /* 输出文档「白纸」 */
  --surface-soft: #f8f5ec;    /* 凹陷区 */

  /* 油墨阶梯 */
  --text: #201d17;            /* 主油墨 */
  --muted: #6e685a;           /* 淡油墨 */
  --muted-strong: #4a453a;

  /* 发丝线 */
  --border: #e0dac5;
  --border-strong: #c8c0a4;

  /* 朱砂印章红 —— 唯一强调色 */
  --accent: #c72c41;
  --accent-strong: #a82133;
  --accent-soft: rgba(199, 44, 65, 0.08);
  --accent-warm: #b56b16;

  /* 语义色（由纸墨调色板同温导出） */
  --color-success: #2f7a57;
  --color-success-soft: rgba(47, 122, 87, 0.10);
  --color-success-strong: #256347;
  --color-warning: #a16a0b;
  --color-warning-soft: rgba(161, 106, 11, 0.10);
  --color-warning-strong: #7d5408;
  --danger: #a32c2c;
  --danger-soft: rgba(163, 44, 44, 0.09);
  --danger-error-soft: rgba(163, 44, 44, 0.12);
  --danger-strong: #7f2222;
  --danger-border: rgba(163, 44, 44, 0.35);

  /* 焦点与阴影（纸面浮起，克制） */
  --focus: rgba(199, 44, 65, 0.18);
  --shadow: 0 1px 0 rgba(32, 29, 23, 0.04), 0 16px 40px -24px rgba(32, 29, 23, 0.28);
  --shadow-soft: 0 1px 0 rgba(32, 29, 23, 0.05);

  /* 字体：本地优先，零网络字体 */
  --font-ui: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-display: Georgia, "Times New Roman", "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, monospace;

  /* 圆角（制图工具感：偏小、克制） */
  --radius: 8px;
  --radius-sm: 5px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 999px;

  /* 间距刻度（保持 4px 基数不变） */
  --space-1..8: 不变

  /* 字号梯度（不变，另加展示级） */
  --text-xs..--text-3xl: 不变
  --text-display: clamp(2.5rem, 5.2vw, 4rem);

  /* 动效 */
  --duration-fast: 0.15s;
  --duration-base: 0.2s;
  --duration-slow: 0.35s;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
}
```

注意：styles.css 中**不得出现**字符串 `var(--sans)`（测试负面断言）。`@supports (font-variation-settings: normal)` 的 Inter var 覆盖块删除（Inter 未打包，本地优先不加载网络字体）。

## 3. 按钮系统（替换渐变体系）

- `.primary-button`：朱砂实色（`background: var(--accent)`，文字 `#fffdf6`），`border-radius: var(--radius-sm)`，1px `var(--accent-strong)` 描边，hover 时 `background: var(--accent-strong)` + `translateY(-1px)`，active 回 0，过渡 `var(--duration-fast)`。`focus-visible`：`outline: 2px solid var(--accent); outline-offset: 2px`。
- `.primary-button[data-loading="true"]`（规则必须存在，测试锁）：45° 斜纹加载动画——`background-image: linear-gradient(45deg, rgba(255,255,255,.14) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.14) 50%, rgba(255,255,255,.14) 75%, transparent 75%)`，`background-size: 16px 16px`，`animation: btn-stripes 0.8s linear infinite`（`@keyframes btn-stripes { to { background-position: 16px 0 } }`），reduced-motion 下关闭动画。
- `.ghost-button`：透明底 + 1px `var(--border-strong)` + 油墨文字；hover `background: rgba(32,29,23,0.04)` + `border-color: var(--muted)`。
- `.mini-button`：mono 字体小一号，发丝线描边；块内必须含 `min-height: 44px`（测试锁，下同 `.tab-button`、`.toggle-label`）。
- 尺寸变体：`btn-lg`（padding 14px 28px，font-size var(--text-base)）、`btn-md`（padding 10px 20px）。
- **类名替换**：`btn-gradient` → `btn-stamp`（语义：印章实色）。涉及 landing-view.js（2 处 `class="primary-button btn-gradient btn-lg"` → `class="primary-button btn-stamp btn-lg"`）、preview.html（`preview-tool-button primary-button btn-gradient` → `preview-tool-button primary-button btn-stamp`；`primary-button btn-gradient btn-md` → `primary-button btn-stamp btn-md`）。
- 删除 `--btn-gradient-primary` token，并在三个非 CI 测试中同步更新（见 §9）。

## 4. 顶栏（统一浅色，删除深色切换）

- 删除 `body[data-active-view="landing"] .topbar` 整块深色覆盖（约 styles.css:177-200），替换为：landing 态顶栏同样纸面 —— `background: rgba(244, 241, 232, 0.88)` + `backdrop-filter: blur(8px)` + 底部发丝线。工作台态 `background: var(--surface)`。landing 态隐藏中间列的规则（`.topbar-center`/`.topbar-progress` 等 display:none）**必须保留**。
- 品牌标记 `.brand-mark`（T2F）：改为朱砂方块印章 —— 朱砂底、纸色字、radius-sm、mono 粗体，hover 轻微 rotate(-2deg)。
- 进度区 `.topbar-progress`：进度轨道 3px 高发丝线色，填充朱砂，`transition: width var(--duration-slow) var(--ease-out)`；`data-state="error"` 填充转 `--danger`，`complete` 转 `--color-success`。状态 chip 按 `data-type`（info/success/warning/error）淡底描边。阶段/百分比用 mono。
- 格式选择器：纸面 + 发丝线 + radius-sm，focus 时朱砂描边。

## 5. Landing 重设计（landing.css 全量重写 + landing-view.js 小幅调整）

`.landing-view` 作用域变量改为稿纸系：`--l-bg: var(--bg)`、文字用油墨阶梯、发丝线 `rgba(32,29,23,0.10)`、强调 `var(--accent)`、`color-scheme: light`。保留现有 `--l-*` 变量名映射到新值即可减少改动面，但视觉按下面执行：

- **图纸网格**：`.landing-hero-grid` 改为浅色版——双层 background-image（56px 主线 `rgba(32,29,23,0.055)` + 14px 虚线副线 `rgba(32,29,23,0.035)`，副线用 `background-image: repeating-linear-gradient` 配合 dashed 效果可用 `linear-gradient` 细线即可），四周用 `mask-image: radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 75%)` 淡出。Hero 四角加「十」字规标（`.landing-hero::before/::after` + 内层两个，或用一个背景 SVG data-uri 四角定位）。
- **Meta 行**：mono 11px、大写、字距 0.14em，上下各一条发丝线；`is-live` 前置朱砂圆点 + 脉动动画（`@keyframes l-pulse`，reduced-motion 关闭）。
- **标题**：`font-family: var(--font-display)`，`font-size: var(--text-display)`，weight 700，行距 1.12，字距 -0.01em，油墨色；`.landing-hero-accent` 朱砂色 + 底部朱砂短下划线（`box-shadow: inset 0 -0.12em 0 var(--accent-soft)` 或伪元素划线动画）。**中文不用斜体**。
- **副标题**：mono 14px，淡油墨，`//` 分隔符朱砂。
- **特性卡**：纸面平卡 + 1px 发丝线 + radius（8px），无阴影；hover 时边框转 `--border-strong` + translateY(-2px) + 顶部 2px 朱砂刻度线滑入（伪元素 scaleX 0→1）。图标朱砂描边。tag（F.01）mono 淡油墨。
- **扫描带**：文档图标改为油墨线稿（stroke currentColor 淡油墨），光束 `.landing-scan-beam` 改为 1.5px 朱砂竖线 + 左右羽化（gradient mask），扫过动画保留 `is-revealed` 门控契约。
- **Registry 快照面板**：仪器读数面板——mono，行间虚线 leader 保留；**新增数字滚动**：landing-view.js 中给 `.landing-readout-value` 加 count-up（rAF，900ms，ease-out，从 0 到目标值；非数字值如 "OFF"、"2/7" 直接显示；`prefers-reduced-motion` 时直接终值；只在 `is-revealed` 后触发一次）。
- **格式矩阵**：发丝线表格行；route chip 重绘：推荐=松绿描边淡底、降级=琥珀、生成=蓝图蓝（`#37649d`，呼应蓝图主题）、受限=朱砂。图例同步。
- **工作流**：5 步横向轨，mono 序号 01–05 大号淡油墨，当前/悬停步序号转朱砂；步骤间 1px 发丝连接线。
- **CTA + 页脚**：**反转为油墨黑带**（全 Landing 唯一深色区块）——`background: #201d17`，纸色文字，朱砂主按钮；页脚 mono 微字并入该带底部发丝线之上。这是全页的「视觉句点」。
- **动效编排**：reveal 三态门控（`reveal-on-scroll` / `reveal-armed` / `is-revealed`）**原样保留**。revealed 过渡改为 `opacity 0→1, translateY(14px)→0, filter: blur(6px)→0`，`0.7s var(--ease-out)`；网格内兄弟元素阶梯延迟 `.landing-feature-grid > *:nth-child(n)` / `.landing-workflow-track > *:nth-child(n)`（60ms 递增，最多 6 级）。`@media (prefers-reduced-motion: reduce)` 与 `@media print` 的强制可见规则保留（landing.css 必须含字面量 `prefers-reduced-motion`）。
- landing-view.js 结构微调允许（加 wrapper/span 可，删 locked class 不可）：保留全部 `landing-*` class、id（hero/features/formats/workflow/cta）、`data-landing-cta`、文案字符串（repair-engine-placeholder-test 锁定的 4 句：「当前实现：replaceTextRun + selectFallbackRoute」「insertTextRun / reorderBlocks / restoreTableGrid / adjustBoundingBox / regeneratePageLayout 为占位」「Repair Engine（2/7 动作已实现）」「Repair Engine 提议、应用（当前 2/7 动作）、复核」）。

## 6. Workbench 重设计（styles.css 相关段落重写）

- **整体**：`body` 纸底；`.workspace-primary` 双栏网格，栏间距 16px，面板为纸面 + 发丝线 + radius，不用投影堆叠。
- **源码面板**：`.drop-zone` 虚线发丝（`border: 1.5px dashed var(--border-strong)`），拖拽态 `.is-active`：朱砂虚线 + `--accent-soft` 底 + 图标缩放。`#inputContent` textarea：纸面、mono 13px、行距 1.7、内边距 20px，focus 朱砂细描边；字数/行数 mono 微字。二进制态 `.source-pane.is-binary-input` 规则保留（测试锁）。
- **流程步骤条**：mono 序号 + 名称，`.is-current` 朱砂 + 底部 2px 朱砂刻度；步骤间发丝连接。
- **结果面板**：tab 为下划线式——active 油墨加粗 + 底部 2px 朱砂指示（border-bottom 过渡），inactive 淡油墨。预览区 `#htmlPreview`/`#textOutputPreview`：`--surface-raised` 白纸 + 克制投影（「输出文档是一张白纸」隐喻）+ radius。空态 `data-empty-hint` 提示 mono 淡油墨居中。
- **`.preview-markdown` 排版**（转换预览内容）：标题衬线、正文 sans 15px/1.75、hr 发丝线、代码块暖墨底 `#26221c` + 纸色文字 + radius-sm、表格发丝线。
- **输出编辑器 / 错误面板 / 检验报告**：发丝线分区；检验行按 `data-state`（ok/drift/skip/warning）着色圆点 + mono 值；错误面板 danger 淡底 + 左侧 3px danger 条。
- **队列行**：`.queue-item` 发丝线行间分隔；`.queue-item:hover`、`.queue-item:focus-visible` 规则必须存在（测试锁）；状态点按 `data-status` 着色。
- **安全中心 dialog**：纸面 + 发丝线卡片分区，pill 按 `data-state`/`data-mode` 着色，朱砂用于「已拦截」标记。
- **滚动条**：`::-webkit-scrollbar` 8px 宽、透明轨、thumb `rgba(32,29,23,0.22)` radius-full，hover 0.34。
- 全局交互：所有可交互元素 `transition: color/background/border-color/transform var(--duration-fast) var(--ease-out)`；`focus-visible` 统一朱砂 outline。

## 7. preview.html / preview.css

- preview.css 重绘为稿纸系：顶栏纸面 + 发丝线 + backdrop blur；`.preview-stage` 纸底；`.preview-canvas`（测试锁，类名保留）白纸 + 投影 + radius；缩放控件发丝线 chip 组；`preview-tool-button` ghost 风格。`preview-empty` 居中 mono 提示。
- preview.html 按钮类串按 §3 更新。

## 8. 性能优化

1. **KaTeX 懒加载**：index.html 与 preview.html 移除 `<link rel="stylesheet" href="/vendor/katex/katex.min.css">` 与 `<script defer src="/vendor/katex/katex.min.js">`（先 grep scripts/ 确认无测试断言这两行存在）。改写 `public/katex-render.js`：`renderMathIn(root)` 保持导出签名；内部先查 `.t2f-math` 节点，无则直接返回；有而 `globalThis.katex` 未加载时，动态注入上述 link + script（`document.head.appendChild`，script onload 后再渲染；注入用单例 Promise 防重复），加载完成后渲染全部节点。渲染失败兜底逻辑保留。grep 确认调用方（app.js / preview.js / formats/）不依赖同步完成；latex-math-test.js 若断言渲染结果，确认其为异步等待型，必要时适配。
2. **动画合规**：所有位移动画只用 transform/opacity/filter（blur ≤6px）；marquee 保持 `transform: translate3d`；`will-change` 仅用于 scan-beam 与进度条。
3. **滚动性能**：长列表容器（`.queue-list`、预览滚动区）加 `overscroll-behavior: contain`。
4. **CSS 整理**：重写时删除无匹配选择器的死规则（先 grep 确认），按 §令牌/基础/顶栏/工作台/面板/弹窗/工具 分节注释。

## 9. 非 CI 设计守护测试同步更新（它们当前 PASS，重构后要更新断言并继续 PASS）

- `scripts/design-token-test.js`：更新为断言 §2 新值（含 `--font-display`、`--text-display`、`--ease-out`、`--ease-spring` 新增 token；删除 `--btn-gradient-primary` 断言）。
- `scripts/unified-button-test.js`、`scripts/ui-button-consistency-test.js`：渐变断言改为 §3 实色体系断言（`btn-stamp`、hover translateY(-1px)、`data-loading` 斜纹、preview.html 新类串、landing-view.js 新类串）。
- `scripts/repair-engine-placeholder-test.js`：不改（当前基线 FAIL，保持 landing 文案使其 Test 1/2 不进一步退化）。

## 10. 红线契约（CI 测试锁定，逐条核对）

styles.css 必须满足（browser-smoke-test.js:199-207、ui-accessibility-test.js:27-33 硬断言）：
1. 含 `.source-pane.is-binary-input` 规则。
2. 不含 `var(--sans)`；不含两空格缩进的 `height: 100vh;`；不含 `min-height: 620px;`。
3. 含 `align-items: stretch;`。
4. 含精确块（两个空格缩进、逐字节）：`.source-pane {\n  align-self: stretch;`（即 `.source-pane` 规则的第一条声明必须是 `align-self: stretch;`）。
5. 含精确块：`.pdf-frame {\n  display: none;\n  width: 100%;\n  height: 100%;`。
6. `.mini-button`/`.tab-button`/`.toggle-label` 规则块内各含 `min-height: 44px`；`.toggle-label input` 块含 `width: 20px; height: 20px`。
7. 含 `.queue-item:hover`、`.queue-item:focus-visible`、`.primary-button[data-loading="true"]` 规则。
8. landing.css 含 `.landing-hero` 与字面量 `prefers-reduced-motion`；preview.css 含 `.preview-canvas`。

index.html 结构红线：
- 76 个静态 id 全部保留（清单见探索结论，重点：fileInput、dropZone、transformButton、conversionProgress、workbenchTabs、inputContent、htmlPreview、pdfPreview、textOutputPreview、errorDetailsPanel、verification* 系列、securityCenterDialog 及其内部 data-sec-*/data-model-cache-* 作用域）。
- `<details id="fileQueuePanel" class="queue-panel" aria-label="文件队列" hidden>` 逐字节不动。
- `class="viewer-grid single-view"`、`class="auxiliary-actions"`（无 hidden）、`class="output-settings"`（无 hidden）、`class="topbar-progress"`、`data-view="landing"/"workbench"`、`data-nav-*`、`data-tab-target`、`data-workflow-step`、`role="tablist"` 及 tab 的 aria 属性顺序（ui-accessibility:9-16 正则逐字节锁定 inputPreviewTab/outputPreviewTab/inputPreviewPanel/outputPreviewPanel/retryConversionButton/dropZone/workbenchTabs/downloadOutputButton 的开标签）。
- `.app-shell > [data-view]` 直接子代结构不变；`#inputContent` 在 `.source-pane` 内；`#paperFormatSelect` 在 `.paper-field` 内；`#largePreviewModeSelect` 在 `.large-preview-field` 内。
- index.html 必须继续 link `/styles/landing.css`，引用 `/router.js`、`/landing-view.js`、`/security-center.js`。
- 负面清单不得复活：bottomReportPanel、warningsPanel、qualityReportPanel、diffPanel、versionsPanel、pluginManagerButton、pluginDownloadPanel、importPluginInput、bottom-drawer、data-drawer-tab、openPdfPreviewButton、iframe#pdfPreview、landing-cta-primary、preview-tool-primary、preview-back-cta。
- app.js / security-center.js / preview.js / file-queue-ui.js **不改逻辑**；仅 katex-render.js 与 landing-view.js（含 count-up）允许 JS 改动。若确需改 app.js 源码字符串，先 grep browser-smoke-test.js:134-194 与 ui-accessibility-test.js:18-23 的断言串。

## 11. 验收

按顺序执行并全部通过：
```bash
node scripts/browser-smoke-test.js
node scripts/ui-accessibility-test.js
node scripts/design-token-test.js
node scripts/unified-button-test.js
node scripts/ui-button-consistency-test.js
node scripts/smoke-test.js
node scripts/workbench-queue-test.js
node scripts/ui-conversion-e2e-test.js   # puppeteer，最重要
```
然后用 `node scripts/redesign-screenshot.mjs`（先读它确认用法与输出路径）或自写 puppeteer 脚本截图 landing（首屏/特性/矩阵/CTA）与 workbench（加载示例后），自检视觉。
