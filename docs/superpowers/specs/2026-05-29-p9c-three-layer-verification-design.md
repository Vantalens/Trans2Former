# P9-C 转换后检验三层架构总设计

状态：生效
日期：2026-05-29
前置基础：P9-A.1 → P9-A.4 OCR 链路 / P9-B OCR → FixedLayoutModel / S2 Repair Engine / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-D 高级 OCR / P7-B 跨平台发布

## 目标

DEVELOPMENT_TASKS.md 把「转换后检验」列为项目核心差异化能力之一：用户最关心的是「这次转换有没有丢东西」，而不是单一 writer 的程序化质量。P8-B 已经把 RoutePlanner 和路径分级说准，S2 Repair Engine 已经在做模型自审 + 同格式 round-trip，但当前 `metadata.qualityReport` 只有粗粒度的 `structureFidelity / tableFidelity / assetFidelity / warningCount / downgradeCount`，没有结构化的差异数据；视觉对比和 OCR 回读完全是占位。

P9-C 落地之后：

- 任何一次 `convertContent` / `convertContentAsync` 在 Repair Engine 自审之后再过一层「验证阶段」（verification stage），把可执行的三层检验结果合并写入 `metadata.qualityReport`。
- 三层检验之间是独立、可降级、共享同一份数据契约的子系统：

```
verification-stage
  ├ rule-diff          (P9-C.1)  → qualityReport.ruleDiff
  ├ ssim-visual        (P9-C.2)  → qualityReport.ssim
  └ ocr-readback       (P9-C.3)  → qualityReport.ocrReadback
```

- 每层都按"可证据 → 触发；不可证据 → eligible:false + reason"原则运行；不夸大覆盖、不夸大保真度。
- UI / Repair Engine / 任务表都从 `qualityReport.verification.layers` 读到当次实际跑过哪些层，避免 P8 之前那种「质量等级写得满，但路径根本没执行」的回潮。

## 三层结构与数据契约

### 公共 envelope `qualityReport.verification`

```js
qualityReport.verification = {
  eligible: boolean,            // 至少一层 eligible 则 true
  layers: ["rule-diff"],        // 当次跑过且 eligible 的层名列表
  skipped: [                    // 不 eligible 的层 + 原因
    { layer: "ssim",         reason: "writer-not-rasterizable" },
    { layer: "ocr-readback", reason: "ocr-engine-unavailable" },
  ],
  runtimeMs: number,            // 三层合计 wall-clock
}
```

### 层级具体字段

每层的详细结果挂在 `qualityReport.<layer-key>` 平面字段下，方便 UI 直接渲染、Repair Engine validator 直接消费、测试断言直接定位。

| 层 | qualityReport 字段 | 触发条件 | 主要字段（详见各子阶段 spec） |
| --- | --- | --- | --- |
| 规则 diff（P9-C.1） | `qualityReport.ruleDiff` | from/to ∈ text-canonical 集合（md/html/json/csv/txt/xml）且 `output.data` 为字符串 | `identical / blockCounts / changedBlocks / addedBlocks / removedBlocks / fidelity / overallScore` |
| SSIM 视觉对比（P9-C.2） | `qualityReport.ssim` | writer 是 PDF / PNG / OFD 等可栅格化输出，且 baseline 注入 ok | `score / threshold / changedPixels / baseline / passed` |
| OCR 回读（P9-C.3） | `qualityReport.ocrReadback` | OCR engine 已 ready（tesseract 或更高级）+ writer 产物可以渲染为图像 | `textRecall / textPrecision / driftedBlocks / engineId / runtimeMs` |

任意一层不 eligible 时对应字段为 `null`，且在 `verification.skipped` 中显式带 reason，前端不展示该层卡片。

### 与 Repair Engine 的关系

| 维度 | Repair Engine（S2） | Verification Stage（P9-C） |
| --- | --- | --- |
| 时机 | writer 之后立即跑 | Repair Engine cycle 完成之后跑 |
| 目的 | 自审 + 自动修复 + 可选 fallback | 多层独立证据采集 |
| 入口 | `defaultRepairEngine.runCycle({ model, output, ctx })` | `runVerificationStage({ model, output, ctx })` |
| 数据归宿 | `metadata.autoRepair` + `metadata.modelReview` + `qualityReport.repairStatus/finalDecision` | `qualityReport.verification` + `qualityReport.{ruleDiff,ssim,ocrReadback}` |
| 是否改 output | 可（fallback writer 切换） | 否（只读、只写 metadata + warnings） |
| 是否抛错 | 内部抓错落到 rejected actions | 内部抓错落到层级 warning，eligible 仍可为 true |

Repair Engine 的 `reverifyRoundTrip` 字段（`roundTripDelta`）保留，作为粗粒度兼容层；P9-C.1 ruleDiff 是它的字段级细化版本，并行存在。Repair Engine 后续可能会注册一个 `detectRuleDiffDrift` validator 来消费 ruleDiff 结果生成 `replaceTextRun` 等 RepairAction，但**不在 P9-C 阶段做**（避免循环依赖）。

### 与 P8 RoutePlanner 的关系

RoutePlanner 决定 reader → writer 经过哪些模型 mapper、温度和强制 warning；Verification Stage 只看最终 `output` 和最终 `model`，与路径分级正交。`routeClass: "generated" | "restricted"` 路径仍会跑 verification——只要 writer 可被 round-trip / 栅格化 / OCR，结果就有意义；只是 fidelity 低时 ruleDiff/ssim/ocrReadback 会自然反映出来。

## 子阶段顺序与里程碑

| 子阶段 | 落地内容 | 依赖外部资源 |
| --- | --- | --- |
| **P9-C.1 规则 diff** | `public/core/verification/` 三模块骨架 + `runVerificationStage` 编排 + 接入 `_wrapWithRepairCycle` + `qualityReport.ruleDiff` + `qualityReport.verification` envelope | 无 |
| **P9-C.2 SSIM 视觉对比** | `ssim.js`（自实现，不引第三方 npm） + 复用 P9-B `defaultPdfPageRasterizer` 渲染 PDF 第 1 页 + `tests/visual-baselines/pdf/` 初始基线（md→pdf / html→pdf） + `qualityReport.ssim` | 浏览器/Tauri runtime（PDF.js vendor 已就位）；Node 侧 stub |
| **P9-C.3 OCR 回读** | 复用 tesseract engine 对 writer 产物 OCR 文本与原始 SemanticDoc 文本对比；扫描 PDF / PNG / 渲染后 PDF 都可参与 + `qualityReport.ocrReadback` | tessdata 已下载到 IndexedDB（用户手动启用） |

P9-C.1 是无外部依赖的纯函数验证，应该最先落地，提供 envelope 数据契约 + 单测脚本，为 P9-C.2 / P9-C.3 提供接入位。

## 与历史 spec 的关系

| 历史 spec | 状态 | 处理 |
| --- | --- | --- |
| [2026-05-27 PDF Single-Page Visual Regression Design](2026-05-27-pdf-single-page-visual-regression-design.md) | 单层视觉对比设计稿；只覆盖 PDF。 | 在 P9-C.2 spec 中作为前置参考，不再单独执行。 |
| [docs/VISUAL_COMPARISON_PLAN.md](../../VISUAL_COMPARISON_PLAN.md) | 2026-05-12 框架文档；建议引入 sharp/ssim.js/pdf-to-png 等 npm 依赖。 | P9-C 方向调整后**不引入新 npm 依赖**；该文档在 P9-C.2 落地时同步收敛或归档。 |
| `scripts/visual-comparison-test.js` | 2026-05-12 占位 stub。 | P9-C.2 落地时拆为 `scripts/ssim-baseline-test.js`（或合并入 `scripts/visual-comparison-test.js` 实现）。P9-C.1 不动。 |

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 三层 envelope 字段一旦发布，未来反复改 schema 会让 UI / 测试断言碎裂 | P9-C.1 把 envelope 字段一次性钉死（`eligible / layers / skipped / runtimeMs`），未来子层只往 `qualityReport.<layer-key>` 加平面字段，不动 envelope。 |
| 三层都跑会显著延长 convert 耗时 | P9-C.1 是纯同步、可降级；P9-C.2 默认渲染 PDF 第 1 页一次（< 200ms）；P9-C.3 单页 OCR ~1s。每层都按 `eligible` 短路，且 `options.repair === false` 仍然跳过整个验证阶段。 |
| Repair Engine 与 Verification Stage 出现循环依赖（Repair Engine 想看 ruleDiff，Verification Stage 又跑在 Repair Engine 之后） | P9-C 阶段 Repair Engine 只消费 `metadata.warnings`，不消费 `qualityReport.ruleDiff`；若后续要让 Repair 消费 ruleDiff，再走单独的 P10 阶段把 Repair Engine 改造为可重入。 |
| 历史 `roundTripDelta` 与新 `ruleDiff` 字段含义重叠造成歧义 | 文档里显式标注：`roundTripDelta` 是粗粒度布尔（保留兼容），`ruleDiff` 是细粒度字段级（P9-C 标准字段）；UI / Repair Engine 推荐读 `ruleDiff`。 |

## 验收门槛

P9-C 视为通过的标准（每个子阶段独立验证）：

1. 任意一次 `convertContent` / `convertContentAsync` 在 `options.repair !== false` 时返回 `result.quality.qualityReport.verification.layers` 为非空数组（至少含一个已落地层）或返回 `verification.eligible: false` + 完整 `skipped` 列表。
2. `repair-engine` 现有契约（`autoRepair / modelReview / roundTripDelta / repairStatus / finalDecision`）一字段未动，老断言全过。
3. `qualityReport.verification.layers` 与 `qualityReport.<layer-key>` 字段对齐：列表里有 `"rule-diff"` 必然 `qualityReport.ruleDiff` 非 null，反之亦然。
4. 守门脚本（`local-security-test.js` / `local-model-direction-test.js`）覆盖三层骨架关键词；DEVELOPMENT_TASKS.md / docs/MULTI_MODEL_ARCHITECTURE.md / docs/PRODUCT_STRATEGY.md 与本 spec 一致。
