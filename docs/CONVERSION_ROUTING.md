# Conversion Routing

版本：v0.2.0
状态：P8-A 路径与质量提示已接入；P8-B 执行型 mapper 与路径校准待开发
最后更新：2026-05-27

[CONVERSION_PATHS.md](CONVERSION_PATHS.md) 仍然是当前生效的产品路径矩阵。本文记录 P8-A 已落地的模型路径、温度与质量提示机制，以及 P8-B 需要纠正的执行边界；产品是否推荐某条转换路径继续由保守维护的产品矩阵控制。

## 痛点回顾

`public/core/format-registry.js` 现有的 `ALLOWED_OUTPUTS_BY_INPUT` 是手写表，每加一个格式都要在多处同步：reader 注册、`ALLOWED_OUTPUTS_BY_INPUT`、UI 矩阵、smoke 测试断言。手写表无法表达"质量等级"和"是否推荐"，UI 也只能用 boolean。

## 新机制：Capability Registry + Route Planner

### Capability 声明

每个 reader / writer 注册时声明：

```js
registry.registerReader("pdf", {
  read: readPdf,
  inputModels: ["FixedLayoutModel"],   // 这个 reader 能产出哪些规范模型
  qualityGrade: "enhanced",
  warnings: ["PDF_TEXT_ORDER_APPROXIMATED"],
  ...
});

registry.registerWriter("md", {
  write: writeMarkdown,
  acceptModels: ["SemanticDoc"],        // 这个 writer 接受哪些规范模型
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

P8-A 中，`RoutePlanner` 计算模型可达路径和损失提示：

```
1. reader[from].inputModels 给出可达模型集合 M0
2. 从 M0 出发，走 mapper 图（BFS），扩展出可达模型集合 M*
3. 为产品矩阵允许的目标 writer 选择一条可达模型路径
4. 按"模型距离 + lossLevel"给路径打分（hot / warm / cold）
5. 把路径携带的 `forcedWarnings` 写入转换模型的 `QualityReport`
```

**hot**：reader → writer 共享同一模型，无 mapper（如 `md → md`、`xlsx → xlsx`）。
**warm**：经过一次 low-loss mapper（如 `csv → md`：WorkbookModel → SemanticDoc.table）。
**cold**：经过一次 high-loss mapper 或多次 mapper 链（如 `pdf → docx`：FixedLayoutModel → SemanticDoc → DOCX）。

工作台完成转换后展示带 `routeTemperature` 与 `forcedWarnings` 的转换质量模型。格式选择仍以产品矩阵为准，不因模型技术可达而自动开放不推荐输出。当前 warnings 基于规划路径写入，不代表对应 mapper 已实际改写转换 payload。

### 路径示例

| 用户请求 | Planner 推导路径 | 温度 |
|---|---|---|
| md → html | reader=md→SemanticDoc → writer=html | hot |
| md → docx | reader=md→SemanticDoc → writer=docx | hot |
| csv → md | reader=csv→Workbook → mapper.workbookToSemantic → writer=md | warm |
| pdf → md | reader=pdf→FixedLayout → mapper.fixedLayoutToSemantic → writer=md | cold |
| pdf → docx | reader=pdf→FixedLayout → mapper.fixedLayoutToSemantic → writer=docx | cold |
| xlsx → docx | reader=xlsx→Workbook → mapper.workbookToSemantic → writer=docx | warm |
| pptx → md | reader=pptx→Slide → mapper.slideToSemantic → writer=md | warm |
| pptx → docx | reader=pptx→Slide → mapper.slideToSemantic → writer=docx | warm |
| pptx → xlsx | reader=pptx→Slide → mapper.slideToSemantic → mapper.semanticToWorkbook → writer=xlsx | cold |
| png → md | reader=png→FixedLayout（核心 OCR 增强）→ mapper.fixedLayoutToSemantic → writer=md | cold（依赖后续核心增强） |
| ofd → pdf | reader=ofd→FixedLayout → writer=pdf | warm |

## 不推荐路径

某些路径技术上可达但语义勉强（如 `pptx → xlsx`、`xlsx → pptx`、`pdf → epub`），Capability Registry 标记为 `not-recommended: true`：

- UI 仍然显示，但默认不在快捷选项里
- 转换时强制弹一条 `policy` 级 warning：`PATH_NOT_RECOMMENDED`
- qualityReport 注明"非推荐路径，输出仅供查看"

## External Engine Bridge

当前产品不提供插件化 External Engine Bridge。桌面环境如需接入 LibreOffice / Pandoc / Calibre / ofdrw，必须作为核心本地 sidecar 能力设计，显式声明本地二进制、权限、资源预算、fallback 和 no-network 约束。

## 与 CONVERSION_PATHS.md 的关系

| 文档 | 内容 |
|---|---|
| [CONVERSION_PATHS.md](CONVERSION_PATHS.md) | 当前生效的用户可选产品路径矩阵 |
| 本文档 | P8 模型可达性、路径温度与强制降级提示机制 |

## P8-B 执行边界校准

经研究报告与代码核对，当前注册的专属模型声明尚未全部对应 writer 的实际消费方式：

- `XLSX` 和 `PDF` writer 已具备专属模型优先路径，适合作为真实执行链依据。
- `CSV` writer 当前仍消费 `SemanticDoc` table；因此 `xlsx -> csv` 需要经过 `WorkbookModel -> SemanticDoc`，不能视为同模型 hot 路径。
- `PPTX` writer 当前从语义文本生成单页输出，`pptx -> pptx` 不能表述为 `SlideModel` 保真写回。
- `OFD` reader 当前仅有空 `FixedLayoutModel` 占位，`ofd -> pdf` 不能表述为已具备稳定布局保持能力。

P8-B 将引入真实 mapper 执行证据字段 `executedMappers`，优先接入 `SemanticDoc <-> WorkbookModel` 路径；Slide/FixedLayout 自动映射在 writer 和质量 fixture 具备证据后再启用。

## 程序层规则

当前规则：

- `getAllowedOutputFormats(from)` 继续维护产品推荐边界，避免只因技术可达而暴露低质量输出。
- `ConverterRegistry.prepareConversionModel()` 先校验产品路径，再由 Planner 选择模型路径并注入 route warnings。
- `ConverterRegistry.convert()` 使用上述转换模型执行 writer，UI 同步用该模型显示 QualityReport。
- 不支持的路径返回 `UNSUPPORTED_CONVERSION_PATH`，未注册 reader/writer 返回 `UNSUPPORTED_INPUT_FORMAT` / `UNSUPPORTED_OUTPUT_FORMAT`
- 新增格式时必须声明 reader/writer 的真实模型能力，并在新增推荐路径时同步产品矩阵与测试。
- [scripts/conversion-capability-audit-test.js](../scripts/conversion-capability-audit-test.js) 用 Planner 输出做矩阵稳定性断言

## 后续增强

P8-A 的路径可见性已闭环。P8-B 将在 `prepareConversionModel()` 中把现有 reader 附带的 `workbook` 数据显式交给可执行 mapper；`slide` / `fixedLayout` 路径继续等待 writer 能力与质量证据，不仅增加格式列表或静态可达声明。
