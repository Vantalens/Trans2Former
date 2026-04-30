# Changelog

所有值得注意的项目变更将在此文件中记录。

## [Unreleased]

### 新增

- 新增 `samples/` 样例集，覆盖 Markdown、HTML、TXT、JSON、CSV、XML、PNG 当前输入格式。
- 新增机器可读 `docs/document-model.schema.json`。
- 新增转换快照测试和 `tests/snapshots/conversions/`。
- 新增浏览器自检页 `/smoke-test.html`。
- 新增本地安全策略 `docs/SECURITY_POLICY.md` 和 local security test。
- 新增结构化 `ConversionError`，覆盖 parse / validate / convert / render / download 分类。
- 新增错误详情面板和脱敏诊断复制能力。
- 新增转换阶段进度条，Worker 会透传 read / parse / validate / convert / render / package 进度事件。
- 新增取消转换后的输出清理：终止 active Worker、撤销旧 Blob URL、清空旧输出并禁用旧下载入口。
- 新增市场调研文档 `docs/MARKET_RESEARCH_2026-04-26.md`。
- 新增产品亮点规划：上传文件大小不设置人为固定上限，后续通过分片/流式/Worker/渐进预览支撑超大文件。
- 新增动态分块与结构化合并规划：单个超大文件可按语义子模块转换后合并，目标是与直接转换结果语义等价。
- 调整水平拆分描述：代码模块拆分是工程手段，不能替代单文件动态分块转换，也不能破坏转换效果。
- 新增资源预算文档 `docs/RESOURCE_BUDGET.md` 和 resource budget test，防止重依赖进入默认核心路径。
- 新增开发文档总目录 `docs/README.md`、产品策略文档 `docs/PRODUCT_STRATEGY.md` 和格式路线文档 `docs/FORMAT_ROADMAP.md`。
- 新增 `docs/development-standards/` 开发规范体系，覆盖文档规则、开发流程、AI 协作、质量门禁、安全和模块插件治理。
- 新增热门基础格式免下载原则：`format-basic` 必须保持小而可用，覆盖高频轻量格式。
- 新增 OFD 远期研究文档 `docs/OFD_RESEARCH.md`，定位为 P4+ 政务格式和本地插件研究。
- 新增专业工作台 v1 前端界面：local-only 顶部工具栏、三栏生产面板、基础格式 chips、专业上传区和输出空态。
- 新增 P0 基础格式质量说明 `docs/BASIC_FORMAT_QUALITY.md`，覆盖 before/after、保真范围和降级说明。
- 新增 warnings 工具，统一 `info / lossy / unsupported / security / performance` 分级。
- 新增 P1 DocumentModel 审计层：block id、source span、block-level warnings、asset provenance、conversion metadata 和 quality report。
- 新增动态分块基础工具和 direct vs chunked equivalence smoke test。
- 新增结构化编辑状态模型文档 `docs/STRUCTURED_EDITING_MODEL.md` 和 AI-ready Markdown 准则 `docs/AI_READY_MARKDOWN.md`。
- 新增项目评估文档 `docs/PROJECT_ASSESSMENT_2026-04-30.md`。
- 新增 release 准备文档 `docs/RELEASE_PREP.md`、`scripts/prepare-release.js` 和 release readiness test。

### 变更

- 确定开发方向为模块化插件设计：基础热门格式免下载，重格式和可选能力按用户需求下载或加载对应模块插件。
- 安全路线收紧为零云端文档处理：不提供远程转换、云端 OCR、云端转写或云端 AI 增强。
- 格式路线删除 URL / YouTube / Audio transcription 主线，ZIP 降级为容器基础设施。
- 浏览器主界面从 demo 风格调整为专业转换工作台风格。
- 前端字体栈调整为 Claude 风格优先级，保持现有配色不变。
- Markdown 解析增强：支持有序列表、嵌套层级提示、表格对齐、脚注引用和脚注降级 warning。
- CSV 解析增强：支持 BOM、引号内逗号、引号内换行、空单元格、CRLF/LF 混合换行。
- XML 解析增强：支持命名空间、属性提取、嵌套结构摘要和 Node 环境 parsererror。
- 浏览器预览改为 idle callback 调度，文本文件入口改为分片读取，大文件默认进入手动预览。
- JSON 输出现在包含 `metadata`，用于保留转换审计和质量报告。
- PNG asset fallback 命名避免重复 `.png` 扩展名，并由审计层补齐 provenance。
- `npm test` 现在运行核心 smoke、转换快照、浏览器自检静态服务检查、本地安全 smoke test、资源预算 smoke test 和 release readiness test。
- `DEVELOPMENT_TASKS.md` 已整理为任务看板，长期原则和格式矩阵移入 `docs/` 专题文档。
- Worker 错误现在透传结构化错误字段，便于 UI 渲染。

### 安全

- 明确默认 `local-only`，核心转换不上传用户文件、不遥测、不留存文档内容。
- 本地安全测试会阻止默认前端引入上传、遥测、WebSocket、持久化用户内容等路径。

## [2.1.0] - 2026-04-25

### 新增

- 新增浏览器端 `DocumentModel`，将转换链路调整为 `input -> DocumentModel -> output`。
- 新增 `ConverterRegistry`，统一注册输入/输出格式能力。
- 新增 `AssetStore`，为图片、字体、附件等资源提供统一模型。
- 新增 PNG 输入能力，可作为图片资源导入并输出到 HTML / Markdown / JSON / TXT / PDF-print。
- 新增 `npm test` smoke test，覆盖基础浏览器端转换链路。

### 变更

- 项目正式收敛为浏览器 Web 应用路线。
- Express 仅作为静态资源容器和 `/api/health` 健康检查。
- README、安装说明、贡献规范和任务清单已同步为浏览器优先路线。

### 移除

- 移除 Electron 桌面入口和桌面打包流程。
- 移除 Playwright 运行依赖和服务端 PDF 转换 API。
- 移除 CLI 入口，当前运行形态聚焦浏览器 Web 应用。

## [2.0.0] - 2026-04-20

### 新增

- 品牌升级：项目正式更名为 Trans2Former。
- 增加多格式转换工作台雏形。
- 增加浏览器端转换方向规划。

## [1.0.0] - 2026-04-16

### 新增

- 初始 Markdown 转换工具版本。
- 提供基础 Web 页面、预览区和输出区。
