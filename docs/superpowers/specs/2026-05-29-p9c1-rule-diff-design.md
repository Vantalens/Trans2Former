# P9-C.1 规则 diff 验证阶段

状态：生效
日期：2026-05-29
前置基础：[2026-05-29-p9c-three-layer-verification-design.md](2026-05-29-p9c-three-layer-verification-design.md) / S2 Repair Engine（`reverifyRoundTrip` / `roundTripDelta`） / P8-B 执行型路由
后续阶段：P9-C.2 SSIM 视觉对比 / P9-C.3 OCR 回读

## 目标

P9-C 总 spec 钉好了 envelope；本子阶段交付**第一层可执行验证**——规则 diff，并把 `runVerificationStage` 接入 `_wrapWithRepairCycle`，让 envelope 字段在每次转换中真实出现。

落地后：

- `convertContent({ from: "md", to: "md", content: "# Hi" })` 返回 `result.quality.qualityReport.ruleDiff = { identical: true, fidelity: "exact", overallScore: 1, ... }` + `verification.layers = ["rule-diff"]`。
- `convertContent({ from: "md", to: "html", content })` 跨格式回环 (md→html→md→read-back) 落地 ruleDiff，结构差异以 `changedBlocks / addedBlocks / removedBlocks` 暴露。
- `convertContent({ from: "md", to: "pdf", content })` 显示 `verification.eligible: false, skipped: [{ layer: "rule-diff", reason: "writer-not-text-canonical" }]`，不阻塞。
- `repair-engine.js` 的 `blockFingerprint` / `modelFingerprint` 抽到共享模块；行为字节级不变。

## 数据流

```
ConverterRegistry.convert / convertAsync
  → prepareConversionModel (P8-B 路由 + mapper)
  → write (writer 同步)
  → _wrapWithRepairCycle
      ├ defaultRepairEngine.runCycle  (S2 自审 / fallback / roundTripDelta)
      └ runVerificationStage({ model: finalModel, output: cycle.output, ctx })
          ├ 资格判断 ROUND_TRIP_FORMATS + output.data 为字符串
          ├ 同格式 (from === to) 路径：ctx.read(output.data, from = ctx.to) → diffSemanticDocs(originalModel, readBack)
          ├ 跨格式回环 (md ↔ html)：ctx.read(output.data, from = ctx.to) → 反向写回 ctx.from → ctx.read(...) → diffSemanticDocs(originalModel, readBack2)
          ├ 失败兜底：read 抛 → ruleDiff = null + warning RULE_DIFF_READBACK_FAILED
          └ 输出 { eligible, layers, ruleDiff, warnings, runtimeMs }
      → 合并到 quality.qualityReport.{ruleDiff, verification}
      → 合并 warnings 到 metadata
```

## 新增 / 改造模块

| 文件 | 职责 |
| --- | --- |
| [`public/core/verification/block-fingerprint.js`](../../../public/core/verification/block-fingerprint.js) | 共享指纹模块：`blockFingerprint(block)` / `modelFingerprint(model)`（从 `repair-engine.js` 提取，行为不变）+ `getBlockKey(block, index)`（稳定对齐键）+ `extractBlockFields(block)`（字段子集）+ `BLOCK_FIELDS_BY_TYPE` 常量 + `ROUND_TRIP_FORMATS` 单一来源。 |
| [`public/core/verification/rule-diff.js`](../../../public/core/verification/rule-diff.js) | 结构化 diff：`diffSemanticDocs(original, readBack)` → `{ identical, blockCounts, changedBlocks, addedBlocks, removedBlocks, fidelity, overallScore }`；常量 `MINOR_WEIGHT`、`MAJOR_WEIGHT`、`STRUCTURAL_PENALTY` 暴露。 |
| [`public/core/verification/verification-stage.js`](../../../public/core/verification/verification-stage.js) | 编排：`runVerificationStage({ model, output, ctx })` → envelope；处理同格式 / 跨格式回环 / 不 eligible / 失败兜底；warning code 常量 `RULE_DIFF_DRIFT` / `RULE_DIFF_READBACK_FAILED`。 |
| [`public/core/repair-engine.js`](../../../public/core/repair-engine.js) | 改 import 共享指纹；删本地 `blockFingerprint` / `modelFingerprint` / `ROUND_TRIP_FORMATS` 副本，行为不变。 |
| [`public/core/format-registry.js`](../../../public/core/format-registry.js) | `_wrapWithRepairCycle` 末尾接入 `runVerificationStage`；`quality.qualityReport` 增加 `ruleDiff` / `verification` 字段；warnings 合并到 `metadata`。 |
| [`public/browser-transformer.js`](../../../public/browser-transformer.js) | 顶层 export `runVerificationStage` / `diffSemanticDocs` / `blockFingerprint` / `modelFingerprint` / `ROUND_TRIP_FORMATS` / `RULE_DIFF_DRIFT` / `RULE_DIFF_READBACK_FAILED`。 |
| [`scripts/rule-diff-test.js`](../../../scripts/rule-diff-test.js) | 10 组断言：单元（diffSemanticDocs / runVerificationStage 各场景）+ 端到端（md→md、md→html、md→pdf）+ 指纹抽取等价性。 |
| `package.json` | `scripts.test` 链插入 `&& node scripts/rule-diff-test.js`，位置：`repair-engine-test.js` 之后、`model-cache-test.js` 之前。 |
| [`scripts/local-security-test.js`](../../../scripts/local-security-test.js) | `ALLOWED_PUBLIC_FILES` + `STRICT_LOCAL_ONLY_FILES` 加三个新模块路径。 |
| [`scripts/local-model-direction-test.js`](../../../scripts/local-model-direction-test.js) | `assertIncludes("multiModel", ...)` 加 `runVerificationStage` / `diffSemanticDocs` / `RULE_DIFF_DRIFT`；`assertIncludes("tasks", ...)` 加 `qualityReport.ruleDiff`。 |
| [`docs/MULTI_MODEL_ARCHITECTURE.md`](../../MULTI_MODEL_ARCHITECTURE.md) | 增章节简介验证阶段架构，关键词与守门同步。 |
| [`DEVELOPMENT_TASKS.md`](../../../DEVELOPMENT_TASKS.md) | 阶段状态表新增 P9-C.1 行（已完成）；`最近验收修复` 顶部追加详细条目；脚本计数 "20 个" → "21 个"。 |

## 关键设计点

### ROUND_TRIP_FORMATS 单一来源

`repair-engine.js:10` 定义的 `const ROUND_TRIP_FORMATS = new Set(["md", "html", "json", "csv", "txt", "xml"])` 搬到 `verification/block-fingerprint.js` 作为唯一来源，`repair-engine.js` import 而非重复定义。

### 跨格式回环：本批仅开 md ↔ html

`md → html → md` / `html → md → html` 是仓库里 reader/writer 双向都已实现、`inline-tokens.js` + `semantic-inlines.js` 提供统一 inline pipeline 的路径。2026-05-26 已通过跨格式回归确认这条链不产生不可逆漂移（强弱嵌套、task list、code 块、列表都被 fixture 锁定）。其它 text-canonical 跨格式回环（如 md ↔ json、html ↔ xml）由于 reader 损失模型差异较大，留给后续阶段单独评估，本批显式不开。

### diff 对齐策略

`diffSemanticDocs(original, readBack)`：

1. 用 `getBlockKey(block, index)` 给每个 block 算稳定 key：优先 `block.id`，否则 `${block.type}-${index}-${hash(JSON.stringify(extractBlockFields(block)))}`。
2. 按 key 直接匹配；命中的进 `changedBlocks` 候选池。
3. 未匹配的走 LCS-lite：按 `(type, firstWords(8))` 启发对齐剩余块；命中加入 `changedBlocks`，否则进 `addedBlocks` / `removedBlocks`。
4. 字段级比较用 `extractBlockFields(block)` 子集做 deep equal；不一致字段进 `fieldsDiffered`，每个差异分类 severity：
   - **minor**：纯空白 / 标点 / 大小写差异，或仅 `text` 字段的非语义变化。
   - **major**：`level / ordered / headers / rows.length / code / language / src / assetId / format` 等结构字段。
5. `fidelity` 推导：
   - `identical: true` → `exact`
   - `addedBlocks.length + removedBlocks.length > 0` 且 `(added + removed) / max(1, original.length) > 0.3` → `broken`
   - 有任意 major → `major-drift`
   - 仅 minor → `minor-drift`
   - 全空 → `exact`
6. `overallScore`：
   ```
   const penalty = (
     MAJOR_WEIGHT * majorFieldCount
     + MINOR_WEIGHT * minorFieldCount
     + STRUCTURAL_PENALTY * (addedBlocks.length + removedBlocks.length)
   );
   const score = clamp(1 - penalty / Math.max(1, original.blocks.length), 0, 1);
   ```
   常量值：`MAJOR_WEIGHT = 0.4`, `MINOR_WEIGHT = 0.05`, `STRUCTURAL_PENALTY = 0.5`，作为模块顶层 export 暴露。

### Warning 策略

- `RULE_DIFF_DRIFT`（info 级）：当 `fidelity !== "exact"` 时发；`details` 含 `{ from, to, fidelity, score, addedCount, removedCount, changedCount }`。
- `RULE_DIFF_READBACK_FAILED`（info 级）：当 ctx.read 抛错时发；`details` 含 `{ from, to, cause: errorCode }`。
- 两条都走 `createWarning("info", code, message, details)`，不修改 `warnings.js` 本体。

### envelope 写入

`format-registry.js` `_wrapWithRepairCycle` 末尾：

```js
const verification = runVerificationStage({ model: finalModel, output: cycle.output, ctx });
const finalModelWithVerification = ensureDocumentAudit({
  ...finalModel,
  metadata: withWarnings(finalModel.metadata, verification.warnings),
}, { content, reader: fromFormat, writer: ..., targetFormat: ..., fileName, options });

const baseQualityReport = finalModelWithVerification.metadata?.qualityReport || {};
const qualityReport = {
  ...baseQualityReport,
  repairStatus: cycle.autoRepair?.attempted ? "verified" : "not-attempted",
  finalDecision: cycle.autoRepair?.finalDecision || "pending",
  ruleDiff: verification.ruleDiff,
  verification: {
    eligible: verification.eligible,
    layers: verification.layers,
    skipped: verification.skipped,
    runtimeMs: verification.runtimeMs,
  },
};
```

`roundTripDelta` 字段保留在 `cycle.autoRepair` 内，**字段未动**。

## 测试覆盖

`scripts/rule-diff-test.js` 10 组断言：

1. `diffSemanticDocs`：相同模型 → `identical: true / fidelity: "exact" / overallScore: 1`。
2. `diffSemanticDocs`：单 paragraph 大小写变化（`Hello` → `hello`）→ `fidelity: "minor-drift" / changedBlocks.length === 1 / fieldsDiffered === ["text"] / severity === "minor"`。
3. `diffSemanticDocs`：heading level 改变（h1 → h2）→ `fidelity: "major-drift"`。
4. `diffSemanticDocs`：缺一个 block + 多一个 block → `addedBlocks.length === 1 / removedBlocks.length === 1`；超 30% 块数差 → `fidelity: "broken"`。
5. `runVerificationStage`：mock ctx.read 返回相同模型 → `ruleDiff.identical: true / warnings.length === 0 / eligible: true / layers === ["rule-diff"]`。
6. `runVerificationStage`：mock ctx.read 抛错 → 不抛异常 + `RULE_DIFF_READBACK_FAILED` warning + `ruleDiff: null / eligible: true`。
7. `runVerificationStage`：`from = "md"`、`to = "pptx"` → `eligible: false / reason 含 "writer-not-text-canonical" / layers === [] / ruleDiff: null / skipped[0].layer === "rule-diff"`。
8. 端到端 `convertContent({ from: "md", to: "md", content: "# Title\n\nBody" })` → `result.quality.qualityReport.ruleDiff.identical === true / verification.layers === ["rule-diff"] / verification.eligible === true`。
9. 端到端 `convertContent({ from: "md", to: "html", content: "# A\n\nB" })` → 跨格式回环走通；`ruleDiff !== null / verification.eligible === true`（不断言 identical，避免回环 noise 假阳性）。
10. 端到端 `convertContent({ from: "md", to: "pdf", content: "# Hi" })` → `ruleDiff === null / verification.eligible === false / verification.skipped[0].reason === "writer-not-text-canonical"`。

外加双跑指纹断言（在第 1 组旁边）：用同一 model 调 `blockFingerprint`（共享版）+ inline 复用旧 repair-engine 算法（直接抄 lines 16-34 的等价实现）→ 字节级相等。

## 验收门槛

1. `npm test` 全 21 个脚本通过；`repair-engine-test.js`（10 个断言）不漂移。
2. `git diff --check` 无 trailing whitespace。
3. `npm run release:prepare` 不抛错。
4. 守门关键词全过：`runVerificationStage` / `diffSemanticDocs` / `RULE_DIFF_DRIFT` 出现在 MULTI_MODEL_ARCHITECTURE.md；`qualityReport.ruleDiff` 出现在 DEVELOPMENT_TASKS.md。
5. 三模块（block-fingerprint / rule-diff / verification-stage）进入 ALLOWED + STRICT 白名单。

## 本轮不做

- **不做** SSIM 视觉对比（P9-C.2）。
- **不做** OCR 回读（P9-C.3）。
- **不让** Repair Engine 消费 ruleDiff 来生成 RepairAction（避免循环依赖，留给后续阶段）。
- **不动** writer/reader 输出语义。
- **不动** UI（landing/workbench/preview/security-center），UI 渲染 verification 卡片留给 P9-C.2 落地后统一做。
- **不引入** 新 npm 依赖。
- **不开** 除 md ↔ html 之外的跨格式回环。
