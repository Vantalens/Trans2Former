# Executable Cross-Model Routing Design

状态：待实施
日期：2026-05-27
依据：`多格式文档与媒体互转的可行路径与工程化方案.docx` 与当前仓库实现核对结果

## 目标

将现有“模型路径可见、降级 warning 可见”的 P8-A 基线推进为真实可执行的跨模型路由，同时避免把生成型或尚无质量证据的路径误报为保真互转。

本阶段以研究报告确定的三条主通路为边界：

- 语义文档链：`SemanticDoc` 为 Markdown、HTML、TXT、JSON、XML、DOCX、EPUB 的主模型。
- 表格链：`WorkbookModel` 为 CSV、XLSX 的主模型，与 `SemanticDoc.table` 之间允许明确降级映射。
- 定版终点链：PDF/PNG 等输出只有在专属模型与质量证据成立时才声明保真；反向恢复不因技术可达自动开放。

## 已确认问题

当前代码将 `inputModels` / `outputModels` 用作 RoutePlanner 依据，但 reader 与 writer 并未完全遵循这些声明：

| 格式 | 当前实现事实 | 路由影响 |
| --- | --- | --- |
| CSV | reader 附带 `workbook`，writer 仍从 `model.blocks` 写出 | 不能声称 writer 只消费 `WorkbookModel` |
| XLSX | writer 优先消费 `model.workbook`，缺失时回退 `blocks` | 属于双能力 writer，适合作为首批自动 mapper 目标 |
| PPTX | reader 附带 `slides`；writer 仍用纯文本重建单页输出 | `pptx -> pptx` 不是 hot 保真写回 |
| PDF | reader 附带 `fixedLayout`；writer 在 pages 存在时优先高保真输出 | 可保持双路，但语义反向映射需质量样例后启用 |
| OFD | reader 只挂空 `fixedLayout` 占位 | `ofd -> pdf` 不得被描述为现成的布局保持路径 |

此外，`public/core/models/mappers.js` 已有纯函数，但 `registerMapper()` 尚不保存或执行 `fn`；P8-A 仅根据拓扑写入 warning。

## 设计决策

### 1. 终态模型与兼容载体

终态继续采用研究报告定义的多域模型：`SemanticDoc`、`WorkbookModel`、`SlideModel`、`FixedLayoutModel` 和 `AssetGraph`。

迁移期间不全面重写 reader API。现有 `DocumentModel` 可作为兼容载体：

```js
{
  ...semanticDocumentFields,
  workbook,
  slides,
  fixedLayout,
  metadata
}
```

但注册表必须区分：

- `producesModels`: reader 实际可提供的模型。
- `primaryModel`: 该来源的原生信息域，用于决定无损起点。
- `acceptsModels`: writer 实际可直接消费的模型，按 writer 首选顺序排列；例如 XLSX 优先 `WorkbookModel`，仅在没有可执行映射时回退 `SemanticDoc`。
- `writerMode`: writer 自身属于 `native`、`generated` 或 `fallback` 输出模式。
- `readerMaturity`: reader 的专属模型属于 `native` 或 `placeholder`，用于 OFD 这类尚无真实页对象的来源。
- `routeClass`: 来源到目标组合的属性，为 `recommended`、`generated`、`degraded` 或 `restricted`，不能用单个格式属性代替。

兼容期可保留现有 `inputModels` / `outputModels` 输出字段作为别名，避免 UI 和外部测试一次性破坏；内部选路以新字段为准。

### 2. 可执行路由

`RoutePlanner` 返回的 mapper 节点必须携带 `fn`。转换流程为：

```text
产品路径校验
  -> reader 构建兼容载体
  -> 按 primaryModel 与 writer 首选 acceptsModels 规划路线
  -> 对路线逐段执行缺失的 mapper payload
  -> 写入 executedMappers / routeTemperature / warnings
  -> writer 消费其声明模型
```

只有实际执行的 mapper 才产生其 `forcedWarnings`。reader 在兼容期已生成的投影不能被静默当作“无损直达”；若转换仍使用该投影，注册表应将其描述为兼容投影并维持对应降级分类。对于拥有专属 writer payload 的目标，planner 应优先选择首选 payload 上可执行的路径，而不是因兼容 `SemanticDoc` 可直接写出就绕开 mapper。

### 3. 首批执行范围

第一批仅将证据充分且行为可控的表格链纳入自动执行：

| 路径 | 自动动作 | 分类 |
| --- | --- | --- |
| `md/html/json -> xlsx` | `semanticToWorkbook`，附加 workbook payload 后交给 XLSX writer | `generated` / warm |
| `csv/xlsx -> md/html/json/xml` | `workbookToSemantic`，保持表格结构并登记样式/公式损失 | `degraded` / warm |
| `csv -> xlsx` | 使用 reader 已有 workbook payload，由 XLSX writer 直接消费 | `recommended` / hot |
| `xlsx -> csv` | `workbookToSemantic` 后交给当前 CSV writer；若后续升级 CSV writer 再调整为直达 | `degraded` / warm |

表格映射不得无意改变用户已接受的单表 CSV 输出风格；转换快照和关键词质量测试必须覆盖这一约束。

### 4. 延后执行范围

以下路径先纠正产品分类与文档，不在首批自动执行中宣称保真：

| 路径 | 处理原则 |
| --- | --- |
| `pptx -> pptx` | 当前 writer 为单页生成器，标记为生成/降级路径，直到支持 `SlideModel` 多页写回 |
| `md/html/json -> pptx` | 允许作为生成型输出，不描述为保真 mapper 链 |
| `pptx -> md/html/json` | 可保留提纲抽取能力；自动 `slideToSemantic` 在 fixture 证明不劣于当前 reader 投影后接入 |
| `pdf -> md/html/docx` | 保持高损失提示；`fixedLayoutToSemantic` 在结构质量回归建立后才替代现有投影 |
| `pdf -> pdf` | 只有单次转换实际使用非空 `fixedLayout` 高保真 writer 时可报告直接布局路径；格式级 capability 不能预先承诺 |
| `ofd -> pdf` | 当前为受限/实验路径，等待真实页对象解析与渲染证据 |
| `png -> 可编辑文档` | 等待 OCR/layout 核心本地能力及质量基线 |

### 5. 路线温度与质量报告

温度反映实际转换执行，而非单纯图可达性：

- `hot`: writer 直接消费 reader 的原生 payload，且无生成式重排。
- `warm`: 执行一次低损失 mapper，例如 `WorkbookModel -> SemanticDoc`。
- `cold`: 执行 medium/high mapper、多段 mapper，或使用生成型输出。
- `restricted`: 技术占位或质量证据不足，不作为推荐路径。

质量模型新增或校正以下字段：

```js
metadata.conversion = {
  routeClass: "degraded",
  routeTemperature: "warm",
  routeModels: ["WorkbookModel", "SemanticDoc"],
  executedMappers: ["workbookToSemantic"]
};
```

### 6. 实施载体变化

研究报告于 2026-05-12 将 OCR、OFD 和外部引擎建议为插件/bridge；仓库在 2026-05-24 已决定取消产品插件安装路线。此处继承报告的能力分层和安全约束，但重能力实现形式改为核心本地按需模块或受控 sidecar，并继续满足处理阶段 no-network。

## 验收标准

1. Capability 注册内容不再把 `PPTX` 单页生成写成 `SlideModel` 保真消费，也不把空 OFD 布局占位写成可用直达路径。
2. 首批表格链转换产生的 `executedMappers` 与 warnings 与实际执行完全一致。
3. `SemanticDoc -> XLSX` 通过真实 `semanticToWorkbook` payload 写出，`XLSX` 自反转换继续保留 workbook 公式缓存和 merge。
4. 已允许产品路径仍受产品矩阵控制；技术可达不会自动扩展 UI 推荐范围。
5. `npm test` 与新增 capability/route tests 为变更提供回归证据。

## 非目标

- 本阶段不实现 `SlideModel` 多页 PPTX writer。
- 本阶段不实现 PDF/OFD/PNG 的 OCR 或高保真反向恢复。
- 本阶段不恢复插件安装产品路线，也不引入网络转换服务。
