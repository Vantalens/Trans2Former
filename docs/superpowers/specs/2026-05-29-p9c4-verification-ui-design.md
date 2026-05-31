# P9-C.4 转换检验结果 UI

状态：生效
日期：2026-05-29
前置基础：P9-C.1 规则 diff / P9-C.2 SSIM / P9-C.3 OCR 回读（三层均已写入 `qualityReport`）/ UI-A 三视图重构
后续阶段：P9-D 高级 OCR

## 目标

P9-C.1/2/3 把三层检验结果算进了 `convert()` / `convertAsync()` 返回值的 `result.quality`（`qualityReport.{ ruleDiff, ssim, ocrReadback }` + `verification` envelope + `autoRepair`），但 `public/app.js` 在转换后**丢弃了 `result.quality`**（只用 `toConversionDocumentModel` 重建 model 渲染基础信息），底部抽屉面板又已在 UI-A 前被移除——核心差异化能力「转换后检验」对用户完全不可见。

本子阶段把它呈现出来：转换完成后，在「转换结果」面板内展示一个紧凑、可折叠的**转换检验报告**，显示自动修复结论 + 三层检验（规则 diff / SSIM / OCR 回读）的命中状态与关键指标，未命中层显式给出原因。纯展示，不改转换核心。

## 范围

### 纳入
- `public/index.html`：在 `#outputPreviewPanel` 内新增 `#verificationReportPanel`（`<details>` 折叠面板，默认 hidden，转换后显示）。
- `public/app.js`：
  - `transformContent` 捕获 `result.quality` 存入 `currentConversionQuality`。
  - 新增 `renderVerificationReport(quality)` 渲染面板；文本与二进制结果路径都调用。
  - `resetGeneratedOutput` / 新转换开始时清空面板。
- `public/styles.css`：`.verification-report` 视觉规则（沿用 slate+teal + mini 风格）。
- `scripts/browser-smoke-test.js`：断言 `#verificationReportPanel` 存在。
- docs / DEVELOPMENT_TASKS 同步。

### 排除
- **不复活** 已移除的底部抽屉（`bottomReportPanel`/`warningsPanel`/`qualityReportPanel`/`diffPanel`/`versionsPanel` 保持移除，smoke-test 负断言不破坏）。
- **不改** 转换核心 / verification-stage / format-registry。
- **不做** 真实渲染 fixture 入库（SSIM/OCR 在浏览器真实跑，但样例验证仍手动）。
- **不引入** 新依赖。

## 展示内容（来自 `result.quality`）

```
转换检验报告
├ 自动修复：<repairStatus> · 结论 <finalDecision>（来自 autoRepair）
├ 规则 diff：<命中? fidelity + score : 跳过 reason>
├ SSIM 视觉对比：<命中? score(threshold) + passed : 跳过 reason>
├ OCR 回读：<命中? f1/recall(threshold) + passed : 跳过 reason>
└ warnings：<按 severity 计数>
```

- 三层逐行；每行用 `data-layer` 标记，命中显示指标，未命中显示 `verification.skipped[].reason`（如 `writer-not-text-canonical` / `image-source-unavailable` / `ocr-engine-unavailable`）。
- 文案诚实：明确「检验仅在可证据路径触发」，未触发不代表失败。
- `result.quality` 缺失（`options.repair === false` 或旧路径）→ 面板隐藏。

## 渲染函数契约

`renderVerificationReport(quality)`：
- `quality == null` → 面板 `hidden = true`，return。
- 否则填充各行（读 `quality.qualityReport.ruleDiff/ssim/ocrReadback/verification` + `quality.autoRepair`），`hidden = false`。
- 纯 DOM 文本写入，无 innerHTML 注入用户内容（防 XSS：用 textContent）。

## 验收

1. `npm test` 全 24 个脚本通过；`browser-smoke-test` 断言 `#verificationReportPanel` 存在且旧抽屉负断言仍成立。
2. `git diff --check` / `npm run release:prepare` 通过。
3. 浏览器手动：`md → md` 转换后面板显示规则 diff 命中（fidelity exact）、SSIM/OCR 跳过并给原因。
4. 不破坏现有结果面板、PDF 预览、输出编辑器、错误面板。
