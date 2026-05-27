# Conversion Routing

版本：v0.3.0
状态：P8-B 首批执行型 mapper 与路径校准已接入
最后更新：2026-05-27

[CONVERSION_PATHS.md](CONVERSION_PATHS.md) 仍然是当前生效的产品路径矩阵。本文记录已落地的模型路径、执行证据、温度与质量提示机制；产品是否开放某条转换路径继续由保守维护的产品矩阵控制。

## 痛点回顾

`public/core/format-registry.js` 现有的 `ALLOWED_OUTPUTS_BY_INPUT` 是手写表，每加一个格式都要在多处同步：reader 注册、`ALLOWED_OUTPUTS_BY_INPUT`、UI 矩阵、smoke 测试断言。手写表无法表达"质量等级"和"是否推荐"，UI 也只能用 boolean。

## 新机制：Capability Registry + Route Planner

### Capability 声明

每个 reader / writer 注册时声明：

```js
registry.registerFormat("pdf", {
  read: readPdf,
  producesModels: ["FixedLayoutModel", "SemanticDoc"],
  primaryModel: "FixedLayoutModel",
  acceptsModels: ["FixedLayoutModel", "SemanticDoc"],
  qualityGrade: "enhanced",
  warnings: ["PDF_TEXT_ORDER_APPROXIMATED"],
  ...
});

registry.registerFormat("md", {
  read: readMarkdown,
  write: writeMarkdown,
  producesModels: ["SemanticDoc"],
  acceptsModels: ["SemanticDoc"],
  qualityGrade: "ai-ready",
  ...
});
```

模型间的 mapper 单独注册：

```js
registry.registerMapper({
  from: "FixedLayoutModel",
  to: "SemanticDoc",
  fn: fixedLayoutToSemantic,
  lossLevel: "high",
  forcedWarnings: ["MODEL_VISUAL_FIDELITY_LOST", "MODEL_TEXT_ORDER_HEURISTIC"],
});
```

### Route Planner

`RoutePlanner` 计算模型可达路径，并由转换注册表执行已有证据支持的 mapper：

```
1. reader[from].inputModels 给出可达模型集合 M0
2. 从 M0 出发，走 mapper 图（BFS），扩展出可达模型集合 M*
3. 为产品矩阵允许的目标 writer 选择一条可达模型路径
4. 按"模型距离 + lossLevel"给路径打分（hot / warm / cold）
5. 执行具备 `fn` 的连续 mapper 段，将实际执行名称写入 `executedMappers`
6. 仅把已执行 mapper 的 `forcedWarnings` 写入转换模型的 `QualityReport`
7. 对 `generated` / `restricted` 路径注入 `PATH_NOT_RECOMMENDED`
```

**hot**：reader → writer 共享同一模型，无 mapper（如 `md → md`、`xlsx → xlsx`）。
**warm**：经过一次 low-loss mapper（如 `csv → md`：WorkbookModel → SemanticDoc.table）。
**cold**：经过中高损失规划边、多个 mapper，或属于生成型降级出口（如 `md → pptx`）。

工作台完成转换后展示带 `routeTemperature`、`routeClass`、`executedMappers` 与 warnings 的转换质量模型。格式选择仍以产品矩阵为准，不因模型技术可达而自动开放不推荐输出。Slide/FixedLayout 的规划边仍保留用于能力判断，但在未接入函数前不生成 mapper 已执行警告。

### 路径示例

| 用户请求 | Planner 推导路径 | 温度 |
|---|---|---|
| md → html | reader=md→SemanticDoc → writer=html | hot |
| md → docx | reader=md→SemanticDoc → writer=docx | hot |
| csv → md | reader=csv→Workbook → mapper.workbookToSemantic → writer=md | warm |
| md → xlsx | reader=md→SemanticDoc → mapper.semanticToWorkbook → writer=xlsx | warm |
| xlsx → csv | reader=xlsx→Workbook → mapper.workbookToSemantic → writer=csv | warm |
| pdf → docx | reader=pdf→FixedLayout → planned mapper.fixedLayoutToSemantic → writer=docx | cold（mapper 待证据） |
| pptx → md | reader=pptx→Slide → planned mapper.slideToSemantic → writer=md | cold（mapper 待证据） |
| md → pptx | writer 根据 SemanticDoc 重新生成基础 PPTX | cold / generated |
| pptx → pptx | writer 根据抽取后的语义内容重新生成 PPTX | cold / generated |
| ofd → pdf | OFD L0 语义占位 → PDF 程序化输出 | cold / restricted |

## 不推荐路径

部分已开放路径仅代表可生成输出，不代表保真互转：

- `md/html/json -> pptx` 与 `pptx -> pptx` 标记为 `routeClass=generated`。
- `ofd -> pdf` 标记为 `routeClass=restricted`。
- 转换模型附带 `PATH_NOT_RECOMMENDED`，提示输出不代表保真互转。

## External Engine Bridge

当前产品不提供插件化 External Engine Bridge。桌面环境如需接入 LibreOffice / Pandoc / Calibre / ofdrw，必须作为核心本地 sidecar 能力设计，显式声明本地二进制、权限、资源预算、fallback 和 no-network 约束。

## 与 CONVERSION_PATHS.md 的关系

| 文档 | 内容 |
|---|---|
| [CONVERSION_PATHS.md](CONVERSION_PATHS.md) | 当前生效的用户可选产品路径矩阵 |
| 本文档 | P8 模型可达性、路径温度与强制降级提示机制 |

## P8-B 执行边界校准结果

经研究报告与代码核对，注册表已按 writer 的实际消费方式校准：

- `XLSX` writer 具备 `WorkbookModel` 优先路径，作为首批真实执行链依据。
- `CSV` writer 当前仍消费 `SemanticDoc` table；因此 `xlsx -> csv` 需要经过 `WorkbookModel -> SemanticDoc`，不能视为同模型 hot 路径。
- `PPTX` writer 当前从语义文本生成单页输出，`pptx -> pptx` 不能表述为 `SlideModel` 保真写回。
- `OFD` reader 当前仅提供 `SemanticDoc` 占位读入，`ofd -> pdf` 不能表述为已具备稳定布局保持能力。

P8-B 已引入真实 mapper 执行证据字段 `executedMappers` 并接入 `SemanticDoc <-> WorkbookModel` 路径；Slide/FixedLayout 自动映射仍在 writer 和质量 fixture 具备证据后再启用。

## 程序层规则

当前规则：

- `getAllowedOutputFormats(from)` 继续维护产品推荐边界，避免只因技术可达而暴露低质量输出。
- `ConverterRegistry.prepareConversionModel()` 先校验产品路径，再由 Planner 选择模型路径、执行有实现的 mapper，并注入执行警告或路径分类警告。
- `ConverterRegistry.convert()` 使用上述转换模型执行 writer，UI 同步用该模型显示 QualityReport。
- 不支持的路径返回 `UNSUPPORTED_CONVERSION_PATH`，未注册 reader/writer 返回 `UNSUPPORTED_INPUT_FORMAT` / `UNSUPPORTED_OUTPUT_FORMAT`
- 新增格式时必须声明 reader/writer 的真实模型能力，并在新增推荐路径时同步产品矩阵与测试。
- [scripts/conversion-capability-audit-test.js](../scripts/conversion-capability-audit-test.js) 用 Planner 输出做矩阵稳定性断言

## 后续增强

P8-B 的首批执行链已闭环。后续由 P9 补齐 `slide` / `fixedLayout` 路径的 writer 能力、公开 fixture 与视觉质量证据；在证据成立前不将规划边提升为实际 mapper 执行。
