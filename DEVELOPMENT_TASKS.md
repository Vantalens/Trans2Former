# Trans2Former Development Tasks

最后更新：2026-04-30

维护规则：

- 每次开发结束必须更新本文件。
- 本文件只放阶段状态、任务拆分和下一步执行顺序。
- 长期原则、格式矩阵、架构说明放入 `docs/` 专题文档，不继续堆在任务看板里。
- 修改定位、安全边界、支持格式、测试命令或运行方式时，同步更新 README、CONTRIBUTING、INSTALL、COMMIT_CHECKLIST、CHANGELOG 和相关 docs。

## 当前状态

Trans2Former 当前定位为：

> 专业级、本地优先、零上传、多格式、高质量、可解释的格式转换处理器。

已完成基线：

- [x] 浏览器 Web 应用路线已确立，Electron、Playwright、CLI 和服务端转换 API 已移除。
- [x] Express 仅保留静态资源托管和 `/api/health`。
- [x] 转换链路统一为 `input -> DocumentModel -> output`。
- [x] 当前免下载基础格式：Markdown、HTML、TXT、JSON、CSV、XML、PNG input、PDF-print。
- [x] P0 专业转换基础盘已完成：基础格式质量、warnings、预览调度、大文件入口和质量文档已落地。
- [x] P1 DocumentModel 与质量审计层已完成：block id、source span、block warnings、asset provenance、conversion metadata、quality report 和 chunked equivalence 已落地。
- [x] 前端已升级为专业三栏工作台 v1，字体栈调整为 Claude 风格优先级且未改变既有配色。
- [x] `npm test` 覆盖核心转换、快照、浏览器静态入口、本地安全、资源预算和 release readiness。
- [x] 本地 release 包已可通过 `npm run release:prepare` 生成到 `release/trans2former-2.0.0/`。
- [x] 开发文档已分层，`docs/development-standards/` 已建立。

## 下一步执行顺序

1. P2-A：设计 plugin manifest schema 和 permission model。
2. P2-B：实现插件安装模式 / 文档处理模式隔离，以及 processing mode no-network policy。
3. P2-C：建立插件资源预算测试和基础格式晋升评审。
4. P3-A：建立 ZIP/OOXML 容器基础设施，再进入 DOCX input MVP。
5. P3-B：DOCX input MVP。
6. P3-C：XLSX / EPUB input MVP。

当前建议优先级：P1 已完成，下一步先 P2，再 P3。原因是 Office/EPUB/PDF 等重格式进入前，必须先把插件安全边界固定下来。

## 文档入口

- 产品定位和零上传原则：[docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)
- 格式路线：[docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)
- 基础格式质量：[docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)
- DocumentModel：[docs/DOCUMENT_MODEL_SCHEMA.md](docs/DOCUMENT_MODEL_SCHEMA.md)
- 转换降级策略：[docs/CONVERSION_POLICY.md](docs/CONVERSION_POLICY.md)
- 安全策略：[docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)
- 资源预算：[docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)
- 动态分块合并：[docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md](docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md)
- OFD 研究：[docs/OFD_RESEARCH.md](docs/OFD_RESEARCH.md)
- 项目评估：[docs/PROJECT_ASSESSMENT_2026-04-30.md](docs/PROJECT_ASSESSMENT_2026-04-30.md)
- 发布准备：[docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)
- 开发规范：[docs/development-standards/00_README.md](docs/development-standards/00_README.md)

## P0：专业转换基础盘

状态：已完成。

目标：稳定当前基础格式质量、错误体验、warnings、资源生命周期和可解释输出。

- [x] 建立 `samples/` 样例集，覆盖当前基础输入格式。
- [x] 建立核心转换 smoke test、转换快照、浏览器自检、本地安全和资源预算测试。
- [x] 定义统一 `ConversionError`，覆盖 parse / validate / convert / render / download 分类。
- [x] 错误详情面板不默认展示 stack、raw snippet 或用户内容。
- [x] 取消转换后清理 active worker、旧 Blob URL、旧输出状态。
- [x] 优化浏览器前端页面：从 demo 毛坯布局升级为专业三栏工作台视觉。
- [x] 调整前端字体栈为 Claude 风格优先级，不改变现有配色。
- [x] 完善 Markdown 脚注、链接、图片、表格对齐、嵌套列表和高级内联语法支持。
- [x] 强化 CSV 解析：引号、换行、逗号、空单元格、BOM、不同换行符。
- [x] 强化 XML 解析：命名空间、属性、嵌套结构、parsererror。
- [x] 建立 warnings 分级：info / lossy / unsupported / security / performance。
- [x] 为每个基础格式补 before/after 对比样例和降级说明。
- [x] 预览迁移到 idle callback，避免大文档输入卡顿。
- [x] 大文件入口策略：文本文件分片读取、手动预览降载、资源不足通过结构化错误和状态提示解释。

验收证据：

- [x] `npm test` 通过。
- [x] `git diff --check` 通过。
- [x] 基础格式质量说明已写入 `docs/BASIC_FORMAT_QUALITY.md`。

## P1：DocumentModel 与质量审计层

状态：已完成。

目标：让 `DocumentModel` 成为统一格式中间层、质量审计层和可解释转换层。

### P1-A：稳定结构标识

- [x] `docs/document-model.schema.json` 已建立。
- [x] 增加稳定 block id。
- [x] 增加 source span，记录块来源范围。
- [x] 增加 asset provenance，记录图片、附件、字体等来源。
- [x] 更新 runtime validator、JSON Schema、schema 文档和 smoke tests。

### P1-B：质量审计结构

- [x] 将 P0 `metadata.warnings` 升级为 schema 级质量审计结构。
- [x] 增加 block-level warnings。
- [x] 增加 conversion metadata：reader、writer、版本、选项、warnings 汇总。
- [x] 增加 quality report：结构保真、表格保真、资源保真、降级原因、可读性。
- [x] 将质量摘要接入 JSON 输出和 release/test 验收；UI 详情面板后续在 P2/P3 前端迭代中展示 quality report。

### P1-C：超大文件质量基线

- [x] 建立 direct vs chunked equivalence tests。
- [x] 定义 partial DocumentModel merge contract。
- [x] 设计 merge 后 blocks、assets、warnings、metadata 的等价性比较规则。
- [x] 为 Markdown 先建立小规模 chunked fixture。
- [x] 为 CSV / XML 增加 chunked fixture。

### P1-D：结构化编辑准备

- [x] 设计网页端结构化编辑状态模型：P1 先固定 block id / source span / warnings 作为编辑状态基础。
- [x] 设计 block selection / block edit / preview sync 基础接口：见 `docs/STRUCTURED_EDITING_MODEL.md`。
- [x] 建立 AI-ready Markdown 输出准则：见 `docs/AI_READY_MARKDOWN.md`。

## P2：安全插件系统与资源治理

状态：P1 之后进入实现。

目标：建立可下载但不可上传、安装和处理隔离的插件系统。

### P2-A：插件声明与权限模型

- [x] 开发方向确定为模块化插件设计：热门基础格式免下载，重格式和可选能力按需下载或加载。
- [x] 安全策略收紧为零云端文档处理。
- [x] 明确插件安装模式 / 文档处理模式隔离。
- [x] 资源预算 smoke test 已加入 `npm test`。
- [ ] 设计 plugin manifest schema：权限、格式能力、依赖、体积、完整性、安全模式、失败降级。
- [ ] 设计 permission model：install-network、process-document、read-assets、write-output、cache-plugin。
- [ ] 建立插件 capability note 展示规则。

### P2-B：隔离与完整性

- [ ] 实现 install mode / processing mode 隔离。
- [ ] 实现 no-network processing policy。
- [ ] 增加 hash / integrity 校验。
- [ ] 插件处理文档时禁止联网，安装插件时禁止接触用户文档。
- [ ] 错误详情和诊断复制不得泄漏插件处理过的文档片段。

### P2-C：资源预算与格式晋升

- [ ] 建立插件资源预算测试：验证 `format-plugin` / `optional-plugin` 不进入默认核心包。
- [ ] 建立基础格式晋升评审：体积、安全、质量、使用频率、免下载体验收益。
- [ ] 本地模型插件规则：手动安装、手动启用、可删除、不得上传数据、不得进入核心包。

## P3：Office / EPUB / PDF 文本提取

状态：P1/P2 稳定后进入。

目标：优先做主战场格式到 Markdown/HTML/JSON 的本地提取能力。

建议执行顺序：

1. ZIP/OOXML 容器基础设施。
2. DOCX input MVP。
3. XLSX input MVP。
4. EPUB input MVP。
5. PDF text extraction MVP。
6. PPTX input MVP。

任务：

- [ ] 建立 ZIP/OOXML 容器基础设施：解包、读取 entry、资源索引、打包，不作为用户-facing ZIP 转换格式。
- [ ] DOCX input MVP：段落、标题、列表、表格、图片引用、链接，输出 Markdown/HTML/JSON。
- [ ] XLSX input MVP：多工作表、单元格文本、基础表格映射，输出 Markdown/CSV/JSON。
- [ ] EPUB input MVP：ZIP + OPF + XHTML 解析，输出 Markdown/HTML/JSON。
- [ ] PDF text extraction MVP：仅文本型 PDF，输出 Markdown/HTML，不承诺高保真 PDF -> Office。
- [ ] PPTX input MVP：幻灯片标题、文本框、表格、图片 alt/占位、备注，输出 Markdown/HTML/JSON。
- [ ] 为每个重格式插件建立样例、快照、warnings 和性能预算。

## P4：高保真输出与远期专业格式

状态：远期。

目标：在 P0-P3 稳定后，再进入高保真输出和专业格式研究。

- [ ] DOCX output MVP：由 DocumentModel 生成基础段落、标题、列表、表格、图片。
- [ ] 程序化 PDF output：不依赖浏览器打印，先评估本地生成路线。
- [ ] PNG/JPEG rendering output：Canvas 渲染、多页/长图策略。
- [ ] OFD research：政务格式、P4+、本地插件研究，不进近期核心包。
- [ ] OFD 样例收集和 capability note。
- [ ] OFD -> DocumentModel 文本/页面/图片/metadata 提取实验。
- [ ] OFD -> PDF/PNG 高保真渲染风险评估。
- [ ] 本地 OCR / layout / table model plugin 研究：远期、手动安装、可删除、不得上传数据。

## 删除或降级路线

- [x] URL / YouTube URL：删除，不是文件格式，且必然联网。
- [x] Audio / Transcription：从主路线删除；音频转写不属于核心转换器。
- [x] ZIP：降级为容器基础设施，不作为转换格式宣传。
- [x] 云端 OCR / 云端 AI / 云端转写：删除，不提供。
- [x] OCR：只保留本地插件接口，不承诺近期实现。

## 已完成归档

- [x] README、INSTALL、CONTRIBUTING、CHANGELOG、COMMIT_CHECKLIST 已同步浏览器优先路线。
- [x] `docs/CONVERSION_POLICY.md` 已定义不可逆信息和降级策略。
- [x] `docs/DOCUMENT_MODEL_SCHEMA.md` 已文档化 DocumentModel。
- [x] `docs/RESOURCE_BUDGET.md` 已建立资源预算。
- [x] `docs/development-standards/` 已建立开发规范体系。
- [x] `docs/OFD_RESEARCH.md` 已建立 OFD 远期研究入口。
