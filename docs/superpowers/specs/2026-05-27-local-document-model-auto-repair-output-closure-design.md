# Local Document Model Auto-Repair And Output Closure Design

状态：待实施
日期：2026-05-27
适用阶段：P9 质量证据升级之后的本地模型与输出闭环主线
前置基础：P7-A Windows 安装包构建基线、P8-B 可执行 Workbook/Semantic 路由与高风险路径分级

## 目标

将 Trans2Former 从“可转换并展示降级提示”的本地桌面工作台推进为“可自动识别转换缺陷、自动修复并复核输出质量”的专业桌面软件，同时补齐当前已纳入产品范围的关键输出缺口。

本设计固定以下产品结论：

- 正式产品采用 `Tauri + Web-GUI + TypeScript conversion core + local model runtime`。
- 本地模型随桌面安装包内置，用户安装后无需单独下载模型或执行命令行配置。
- 文档处理、识别、修复、复核与导出阶段均在本地执行，不联网、不上传文档内容或诊断数据。
- 模型使用针对文档图像、文字、版面和表格处理的专用模型，不以内置通用聊天大模型替代转换内核。
- 用户不承担质量修复操作；软件必须自动完成修复与修复后复核。
- 首阶段输出闭环聚焦当前产品范围中的 `PNG 输出`、`OFD 输出`、`PDF 高保真路径` 与 `PPTX 高保真路径`，新增格式另行准入。

## 已确认现状与缺口

### 已有基础

| 能力 | 当前事实 |
| --- | --- |
| 桌面承载 | Tauri v2 壳和 Windows MSI/NSIS 构建基线已存在。 |
| 路由模型 | `SemanticDoc`、`WorkbookModel`、`SlideModel`、`FixedLayoutModel` 的路线已经定义。 |
| 可执行 mapper | `SemanticDoc <-> WorkbookModel` 已有执行证据，并写入 `executedMappers`。 |
| 质量载体 | `QualityReport`、block-level `warnings`、`sourceSpan`、diff/checkpoint 界面基础已存在。 |
| 安全边界 | 产品已明确 processing no-network、no-upload 和最小桌面文件权限。 |

### 当前缺口

| 缺口 | 当前表现 | 本设计要求 |
| --- | --- | --- |
| 路径文档漂移 | 代码已开放多条 `-> XML` 路径，`docs/CONVERSION_PATHS.md` 未完全同步 | 实施第一批先建立单一真值矩阵并由测试约束 |
| PNG 输出 | 仅有输入能力，无真实页面图像 writer | 建立 FixedLayout 渲染写出和视觉质量证据后开放 |
| OFD 输出 | 仅有 L0 输入占位，无 writer | 建立 OFD 固定版式 writer 与样例复核 |
| PDF 恢复 | 有读写基线，但扫描件、复杂版面和表格恢复不足 | 接入 OCR/layout/table 与自动修复闭环 |
| PPTX 保真 | 当前写出偏生成型，非 SlideModel 原稿级写回 | 建立 SlideModel 写出和页面级复核 |
| 自动修复 | 现有质量报告主要用于提示 | 增加结构化 repair action、执行器与二次复核 |
| 模型发布 | 文档仍包含“手动安装模型”与“不依赖 OCR/AI”等旧表述 | 实施时更新为安装包内置、本地按需加载的专用模型能力 |

## 设计边界

### “支持所有格式”的含义

本设计中的全格式模型支持，是指**所有已进入产品矩阵的格式路径都能够接入统一的本地质量审核与自动修复机制**，而不是由同一个模型直接解析并生成所有文件容器。

- reader/writer 继续负责 Markdown、OOXML、PDF、OFD、EPUB、图像等真实文件结构的读取与写出。
- 规范模型继续承载语义文档、工作簿、幻灯片和固定版面数据。
- 本地专用模型负责 OCR、版面分析、表格识别、视觉/文字质量审核和结构化修复建议生成。
- Repair Engine 负责将经过许可的修复动作确定性地应用到规范模型或目标渲染步骤。
- 修复后必须重新写出并复核，未达门槛时不得将输出报告为高保真成功。

### 首阶段格式范围

本设计首阶段只补当前产品范围的关键闭环：

| 能力 | 首阶段范围 |
| --- | --- |
| PNG 输出 | 文档或固定版面到真实 PNG 页面渲染输出，支持质量比对 |
| OFD 输出 | 基础固定版式写出、文字/图像对象写入与本地验收样例 |
| PDF 高保真 | 文本型与扫描型 PDF 的 OCR/layout/table 增强及复核 |
| PPTX 高保真 | SlideModel 驱动的多页写出、基础位置保持及渲染复核 |
| 现有语义/表格格式 | 接入统一审核与自动修复接口，不扩大不合理跨类型推荐路径 |

以下格式不属于首阶段交付范围：`RTF`、`ODT`、`JPEG`、`WebP`、`SVG` 以及其他尚未进入现有产品矩阵的新增格式。它们后续必须独立完成 reader/writer、质量样例、安全预算与路径准入评审。

## 方案选择

### 采用方案：格式内核 + 专用模型 + 受控自动修复闭环

```text
Input File
  -> Format Reader
  -> Canonical Model / Renderable Page Representation
  -> Format Writer Candidate Output
  -> Deterministic Validators + Visual Comparison
  -> Local Document Model Reviewer
  -> Structured Repair Actions
  -> Repair Engine
  -> Regenerated Output
  -> Post-Repair Validation
  -> Final Output Or Controlled Failure
```

该方案保留现有可验证转换内核，同时把模型能力放在传统解析难以覆盖的 OCR、布局和异常识别位置。自动修复由软件承担，但只执行可追踪、可复核的结构化动作。

### 未采用方案

| 方案 | 不采用原因 |
| --- | --- |
| 仅给用户提示，由用户修复 | 不满足产品责任边界，也不适合面向普通用户的安装软件体验。 |
| 通用语言模型直接读写全部格式 | 对容器正确性、版面保真和资源体积不利，且结果难以复核。 |
| 一次性开放所有新增格式与所有跨格式输出 | 会把当前高保真缺口、模型闭环和格式扩张混在同一阶段，无法建立可信验收证据。 |

## 架构

### 1. 模型职责分层

模型运行时按任务加载，不进入应用启动路径。允许一个共享运行时承载多个专用子模型，但能力接口必须分离。

| 模块 | 职责 | 典型输入 | 典型输出 |
| --- | --- | --- | --- |
| `recognizer` | 图像文字识别 | 扫描 PDF、PNG、OFD 页面图像 | text runs、置信度、bbox |
| `layoutAnalyzer` | 版面区域与阅读顺序识别 | 页面渲染图、固定版面对象 | region tree、reading order |
| `tableRecoverer` | 表格网格和单元格恢复 | 页面区域、文字框 | table model、merge 信息 |
| `qualityReviewer` | 源与候选输出质量审核 | 规范模型、渲染页面、确定性检查结果 | issue list、repair actions、confidence |

模型必须使用适合文档视觉/文字任务的专用推理资源。模型训练、标注、校准与高精度实验资源由开发侧维护；用户安装包只包含发布所需的推理资源。

### 2. Repair Engine

`Repair Engine` 是模型与 writer 之间的确定性执行边界。模型不得返回任意脚本或直接替换文件字节，只能提出已注册的修复动作。

首批动作类别：

| 动作 | 适用问题 |
| --- | --- |
| `replaceTextRun` | OCR 高置信度错字、乱码与缺字 |
| `insertTextRun` | 已识别但输出遗漏的文字块 |
| `reorderBlocks` | 阅读顺序错误 |
| `restoreTableGrid` | 表格行列、合并区域或内容错位 |
| `adjustBoundingBox` | 页面对象明显偏移、裁切或重叠 |
| `regeneratePageLayout` | 固定版面页面局部重新布局 |
| `selectFallbackRoute` | 当前输出无法达到门槛时切换更保守输出策略 |

每个动作必须包含：

```js
{
  actionType,
  targetId,
  before,
  after,
  confidence,
  evidence,
  modelVersion,
  sourcePage,
  sourceSpan
}
```

### 3. 自动修复策略

用户不负责决定修复是否应用，但软件仍需控制误修风险：

1. 确定性检查发现问题，或模型识别出问题。
2. 模型生成结构化 repair actions。
3. Repair Engine 仅执行已注册动作，并保留执行前后快照。
4. writer 重新生成目标输出。
5. 复核层重新执行结构检查、渲染差异、模型审核和质量评分。
6. 满足目标格式门槛后输出最终文件。
7. 不满足门槛时自动选择保守 fallback，或给出“未达到高保真输出门槛”的失败结果，不要求用户手工排错。

修复历史对用户可以只表现为“已自动优化”及质量报告摘要；内部仍必须保留审计数据，便于回归、论文实验和问题定位。

### 4. 全格式接入方式

| 格式域 | 规范模型主线 | 自动修复重点 |
| --- | --- | --- |
| `md/html/txt/json/xml/docx/epub` | `SemanticDoc` | 文本缺失、层级、行内结构、资产引用 |
| `csv/xlsx` | `WorkbookModel` | 网格、合并单元格、表头、公式值/显示值损失 |
| `pptx` | `SlideModel` | 多页、文本框、图像位置、版式保持 |
| `pdf/ofd/png` | `FixedLayoutModel` | OCR、阅读顺序、坐标、表格、页面视觉一致性 |

对于跨模型输出，RoutePlanner 仍决定路径和损耗等级。模型审核与 Repair Engine 不得把高损失路径静默升级为推荐路径；只有相应 fixture 与质量门禁通过后，产品矩阵才能提升等级或新增可选输出。

## 质量报告与审计数据

现有 `QualityReport / Warnings / Diff` 继续作为用户与测试的共同接口。实施时扩展质量数据，区分确定性证据、模型证据与修复结果：

```js
metadata: {
  modelReview: {
    engine,
    modelVersion,
    checksum,
    quantization,
    tasks,
    runtimeMs,
    device,
    inferenceMode: "local"
  },
  autoRepair: {
    attempted,
    appliedActions,
    rejectedActions,
    fallbackUsed,
    postRepairVerified
  },
  qualityReport: {
    structureFidelity,
    textFidelity,
    tableFidelity,
    assetFidelity,
    layoutFidelity,
    visualFidelity,
    deterministicChecks,
    modelChecks,
    repairStatus,
    finalDecision
  }
}
```

最终决策至少区分：

- `verified`: 已达到当前格式门槛并完成复核。
- `degraded`: 可输出但存在明确不可修复损耗。
- `failed-quality-gate`: 软件无法生成达到门槛的结果，禁止伪装为高质量成功。

## 本地发布与资源治理

### 内置交付

模型不再采用用户手动安装策略。正式桌面安装包包含：

```text
Trans2Former installer
  app shell and web assets
  deterministic conversion core
  local inference runtime
  document recognition and review model assets
  model manifest and checksums
```

运行时规则：

- 启动工作台不得加载大模型。
- 仅当任务需要 OCR、layout、table 或自动质量修复时加载模型。
- 基础轻格式转换在模型异常或关闭时仍可执行，但必须披露没有增强修复能力。
- 模型资源可随应用升级替换，并应允许用户在设置中禁用增强能力以控制资源消耗。

### 体积与性能原则

用户已确认不需要以非常严格的小安装包为目标，但总包不得无约束膨胀。实施阶段应先测量再设正式门槛：

- 交付模型优先使用推理导出版本，排除训练检查点、优化器和无关资源。
- 比较 `FP16` 与 `INT8` 版本在 OCR、布局、表格和审核准确率上的差异，优先采用达到质量门槛的最小版本。
- OCR/layout/table/reviewer 共享的 tokenizer、字典、字体、运行库和视觉 backbone 应去重。
- manifest 记录每个模型资产的体积、checksum、量化方式、任务、最低内存和 fallback。
- Windows 安装包构建后必须报告应用本体、运行时、模型资产与压缩后总包的分项体积。

当前不将 `500 MB` 作为硬上限；首个可运行模型构建完成后，以实际质量与硬件测试结果确定正式发布预算。

## 输出矩阵闭环路线

### 1. 先建立真实矩阵门禁

当前代码产品矩阵、文档矩阵和能力声明已有漂移。实施前先统一：

- `public/core/format-registry.js` 中的产品矩阵。
- `docs/CONVERSION_PATHS.md` 和 `docs/FORMAT_ROADMAP.md`。
- UI 输出选项和 capability 展示。
- `scripts/conversion-capability-audit-test.js` 等矩阵测试。

矩阵条目应标记为 `recommended`、`generated`、`degraded` 或 `restricted`，而非仅给出“支持/不支持”。

### 2. 首批补齐能力

| 输出方向 | 需要建设的能力 | 开放条件 |
| --- | --- | --- |
| `* -> PNG` | FixedLayout 页面渲染器、分页图像导出、视觉回归 | 真实图像 writer 和稳定基线通过 |
| `* -> OFD` | OFD writer、页面对象、字体/图像引用、容器校验 | 固定版式样例和本地校验通过 |
| `PDF -> PDF/DOCX/PNG` | OCR/layout/table、FixedLayout 修复、渲染比对 | 扫描与复杂版面样例达到门槛 |
| `PPTX -> PPTX/PDF/PNG` | SlideModel 多页 writer、元素位置保留、页面比对 | 不再依赖基础重生成路径 |

`*` 只表示产品矩阵中语义上合理且被明确开放的来源，不意味着无条件开放所有 N x N 组合。

### 3. 新增格式后置

只有上述闭环稳定后，才评估 `JPEG/WebP/SVG` 输出和 `RTF/ODT` 等新办公格式，避免新增格式掩盖现有路径质量不足。

## 错误处理与降级

| 情况 | 产品处理 |
| --- | --- |
| 模型资源缺失或校验失败 | 增强路径不可用；基础可执行路径继续工作并记录明确 warning |
| 推理运行时加载失败 | 不读取或上传用户内容；返回本地能力失败状态和 fallback 结果 |
| 自动修复低置信度 | 不执行该动作，改用保守输出或返回质量门禁失败 |
| 修复后二次复核失败 | 丢弃修复结果，选择 fallback 或失败，不返回“高保真成功” |
| 当前格式没有高保真 writer | 矩阵继续维持 generated/restricted，不以模型审核替代 writer 实现 |

## 测试与验收

### 模型和修复门禁

- 每种模型任务具有固定公开样例集和可重复的离线推理记录。
- OCR 记录字符准确率与关键字段错误；layout 记录区域/阅读顺序质量；table 记录结构恢复准确率。
- 自动修复记录动作正确率、误修率、修复后质量提升和失败 fallback 成功率。
- 所有修复必须证明修复后二次复核真实执行，而不是仅生成建议。

### 格式和视觉门禁

- 当前 P9-A PDF 视觉门禁作为视觉证据起点，后续扩展至扫描 PDF、PNG、OFD 和 PPTX 页面。
- 每条提升为 recommended 的高风险路径必须有格式 fixture、渲染对比、质量报告和路由分类断言。
- 产品矩阵、UI 选项、writer 注册和文档必须通过自动测试保持同步。

### 桌面和发布门禁

- 桌面安装包实际包含模型 manifest、资源文件与校验值。
- Windows 安装后在断网状态完成至少一个基础转换、一个 OCR/layout 修复场景和一个质量复核输出。
- 测试处理阶段不发生网络访问，不保存用户文档内容到模型资产或诊断资源。
- 构建报告显示安装包总体积与模型/运行时的分项体积，并在模型更换时可比较。

## 与现有文档的实施同步点

本规格批准后，实施计划必须安排以下现有文档更新；在能力真正实现前，不提前把未完成路径描述为可用：

| 文档 | 需要调整的内容 |
| --- | --- |
| `DEVELOPMENT_TASKS.md` | 将本地模型、自动修复和输出闭环登记为后续阶段；修正“不依赖 OCR/AI”的表述 |
| `docs/DESKTOP_APP_ARCHITECTURE.md` | 将模型交付由手动安装改为正式包内置、运行按需加载 |
| `docs/DESKTOP_RELEASE_PLAN.md` | 增加内置模型 manifest、安装包体积报告与离线修复 smoke |
| `docs/RESOURCE_BUDGET.md` | 区分轻量核心预算与模型增强桌面包预算 |
| `docs/PRODUCT_STRATEGY.md` | 明确专用本地模型和软件自动修复职责 |
| `docs/CONVERSION_PATHS.md` / `docs/FORMAT_ROADMAP.md` | 与真实代码矩阵、PNG/OFD/PDF/PPTX 闭环阶段同步 |
| `docs/MULTI_MODEL_ARCHITECTURE.md` | 将旧的插件/external engine 表述替换为核心本地内置模型与 Repair Engine |

## 分阶段实施顺序

1. **S1 设计同步与矩阵真值校准**：修正文档冲突，统一产品矩阵、路由分类、UI 与测试真值。
2. **S2 Repair Engine 与审核数据契约**：实现结构化修复动作、质量报告扩展、修复后二次复核和 fallback 机制。
3. **S3 本地模型运行容器与交付治理**：接入内置模型目录、manifest、checksum、按需加载、资源报告和离线安全门禁。
4. **S4 FixedLayout 闭环**：优先实现 PDF/PNG/OFD 的 OCR、layout、table、渲染输出与自动修复质量证据。
5. **S5 SlideModel 闭环**：实现 PPTX 多页保真写出、PDF/PNG 渲染出口与视觉复核。
6. **S6 发布验收与后续格式准入**：验证断网安装包和模型体积/性能，再决定新增图片与办公格式范围。

## 论文与专利可表达的技术主线

本设计可以形成稳定技术命题：

> 一种面向多格式文档转换的本地高保真自动修复方法及系统，通过格式解析器构建规范中间模型，利用专用文档视觉文字模型生成结构化质量缺陷与修复动作，由受控修复引擎自动执行修复，并通过结构检查和渲染质量复核决定最终输出或降级策略，从而在无云端处理和无用户修复介入条件下提高跨格式转换保真度。

可量化实验维度包括：

- 不同格式路径的转换成功率与质量分级准确性。
- 自动修复前后的 OCR 字符准确率、表格结构准确率、页面视觉相似度和误修率。
- 模型量化前后的质量、速度、内存与安装包体积变化。
- 无模型基础路径、模型审核路径与模型自动修复路径的对照结果。

## 非目标

- 不让用户承担修复判断或手工修正流程。
- 不使用云端 OCR、云端 AI、云端转换或后台遥测。
- 不以内置通用对话模型替代格式解析器、writer 或 Repair Engine。
- 不在本阶段一次性增加全部候选格式或开放无质量证据的 N x N 转换矩阵。
- 不因为模型能够发现缺陷，就将尚无真实 writer 的输出路径描述为已完成。
