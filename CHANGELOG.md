# Changelog

所有值得注意的项目变更将在此文件中记录。

## [Unreleased]

## [2.1.0] - 2026-05-25

### 新增

- **安全中心外部请求监控**：新增对外部网络请求的实时监控能力，提升本地优先的安全保障。

### 改进

- 增强文档格式处理逻辑，提升 PDF 输出质量与稳定性。
- 移除底部抽屉面板，简化界面布局。

### 重构

- 重构测试用例组织结构，移除已废弃的 plugin patch 功能。

## [2.0.0] - 2026-05-12

### 新增 (2026-05-12)

- **P8-M7 结构化 inline 节点**：DOCX/PDF/XLSX 格式支持结构化 inline 节点（strong/em/link/code/del），链接不再降级为 "文本 (URL)" 字符串。
- **P8-M7 公式和合并单元格保留**：XLSX writer 保留公式表达式和缓存值，保留合并单元格范围，xlsx → xlsx round-trip 完整保留。
- **P8-M4 高保真 PDF 输出**：新增 FixedLayoutModel → PDF 高保真路径，精确保留原始坐标、字体、尺寸和 annotations。
- **PDF 输出双路智能路由**：优先使用高保真路径（FixedLayoutModel），回落到程序化路径（SemanticDoc），Producer 标记区分。
- **跨模型 Mapper**：新增 `public/core/models/mappers.js`，实现 workbook/slide/fixedLayout ↔ semantic 双向转换。
- **界面优化**：修复转换开始时标签页状态不正确的问题，转换中自动切换到预览标签页，完成后切换到结果标签页。

### 修复 (2026-05-12)

- 修复高保真 PDF 输出的坐标计算错误（dx 计算错误导致文本重叠）。
- 修复转换开始时标签页不切换的问题（用户看到空白结果页面）。

### 改进 (2026-05-12)

- DOCX reader 识别 hyperlink、bold、italic、strike、code 属性，输出结构化 inline 节点。
- PDF reader 基于 fontName 识别 bold/italic（Times-Bold、Helvetica-Oblique 等）。
- XLSX writer 从 WorkbookModel.formulas 回写 `<f>expression</f><v>cachedValue</v>`。
- XLSX writer 从 WorkbookModel.merges 回写 `<mergeCells>` 节点。
- 移除生产环境的调试日志，保持代码简洁。

### 新增 (2026-05-09 之前)

- 新增本地 PDF.js 文本抽取引擎：PDF 上传阶段优先使用 optional `pdfjs-dist` / `/vendor/pdfjs/` 的 `getTextContent()`，失败时才回落到轻量核心解析器。
- 新增文本输出编辑器、实时预览、undo / redo 和 checkpoint 基线，输出草稿可在工作台内直接编辑并回写下载链接。
- 新增 Markdown output profile、version diff（文本 + block id）、warnings resolved 状态和关闭后持久版本历史 opt-in。
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
- 新增用户端前端工作台 v2：响应式输入/预览/输出布局，移除主界面冗长说明，强化编辑、查看和下载路径。
- 新增 P0 基础格式质量说明 `docs/BASIC_FORMAT_QUALITY.md`，覆盖 before/after、保真范围和降级说明。
- 新增 warnings 工具，统一 `info / lossy / unsupported / security / performance` 分级。
- 新增 P1 DocumentModel 审计层：block id、source span、block-level warnings、asset provenance、conversion metadata 和 quality report。
- 新增动态分块基础工具和 direct vs chunked equivalence smoke test。
- 新增结构化编辑状态模型文档 `docs/STRUCTURED_EDITING_MODEL.md` 和 AI-ready Markdown 准则 `docs/AI_READY_MARKDOWN.md`。
- 新增项目评估文档 `docs/PROJECT_ASSESSMENT_2026-04-30.md`。
- 新增 release 准备文档 `docs/RELEASE_PREP.md`、`scripts/prepare-release.js` 和 release readiness test。
- 新增 P2 插件安全模型 `docs/PLUGIN_SECURITY_MODEL.md` 和机器可读 `docs/plugin-manifest.schema.json`。
- 新增 `public/core/plugin-policy.js`，覆盖插件 manifest 校验、权限模式隔离、processing no-network、SHA-256 完整性校验和资源预算分层。
- 新增 `scripts/plugin-security-test.js`。
- 新增 P3 ZIP/OOXML 容器基础设施 `public/core/zip-container.js`。
- 新增 DOCX input MVP `public/formats/docx.js`，支持标题、段落、表格、链接和图片引用提取。
- 新增 XLSX input MVP `public/formats/xlsx.js`，支持工作表和共享字符串到表格。
- 新增 EPUB input MVP `public/formats/epub.js`，支持 OPF spine 和 XHTML 结构提取。
- 新增 PDF text extraction MVP `public/formats/pdf.js`，支持简单 literal text operators。
- 新增 PDF ToUnicode CMap + hex text operator 抽取，覆盖常见中文 PDF 的 CID 映射文本流，并按字体绑定 CMap，避免多字体 PDF 串用映射导致错误识别。
- 新增 PPTX input MVP `public/formats/pptx.js`，支持幻灯片标题和文本框提取。
- 新增 `docs/OOXML_CONTAINER.md`、`docs/DOCX_INPUT_MVP.md`、`docs/XLSX_INPUT_MVP.md`、`docs/EPUB_INPUT_MVP.md`、`docs/PDF_TEXT_EXTRACTION_MVP.md` 和 `docs/PPTX_INPUT_MVP.md`。
- 新增 ZIP deflate 解压、central directory 校验、路径穿越防护、entry 数量/展开体积/压缩比预算。
- 新增 DOCX P3 增强：列表、页眉页脚、脚注、批注、合并单元格 warning 和图片 alt text。
- 新增 XLSX P3 增强：公式保留、基础日期格式、合并单元格 warning 和公式单元格 metadata。
- 新增 PPTX P3 增强：图片 assets、基础表格、speaker notes、母版引用计数和 alt text。
- 新增 P4 DOCX output：由 DocumentModel 生成基础 OOXML `.docx` 包。
- 新增 P4 程序化 PDF output：生成本地 `.pdf` 二进制 data URL，不再以打印 HTML 作为主要 PDF 输出。
- 新增 P4 PNG/JPEG output：建立本地图像二进制输出通道。
- 新增二进制输出下载路径，DOCX/PDF/PNG/JPEG 不再按文本 Blob 下载。
- 新增 `docs/P4_OUTPUTS.md`。
- OFD 样例、能力、降级和插件准入边界已合并到 `docs/OFD_RESEARCH.md`。
- 本地 OCR、layout、table model 插件研究规则已合并到 `docs/PLUGIN_SECURITY_MODEL.md`。
- 用户端前端工作台设计边界已合并到 `docs/DESKTOP_APP_ARCHITECTURE.md`。
- 新增 `docs/DESKTOP_APP_ARCHITECTURE.md`，确定 Tauri 桌面壳 + Web-GUI + TypeScript core + Worker/WASM + 本地插件系统路线。
- Tauri + Web-GUI 选择判断、现代桌面体验目标和当前不足已合并到 `docs/DESKTOP_APP_ARCHITECTURE.md`。
- 新增 `samples/ofd/README.md`，作为 OFD-L0 公开样例登记入口。
- 新增 `docs/PLUGIN_DISTRIBUTION.md`，确定插件下载默认跳转 GitHub Releases，并要求浏览器端和桌面端保留下载板块与更新板块。
- 新增 P0 桌面 Web-GUI 工作台 MVP：文件队列、批量选择、失败重试、输出目录提示、导出命名策略、Input / DocumentModel / Output 三栏、窄屏 tabs、底部 Warnings / Quality Report / Diff / Versions 面板、Plugin Manager / Security Center 入口。
- 新增 Tauri v2 桌面壳 scaffold：`src-tauri/`、CSP、主窗口配置和最小 dialog/fs 权限边界。
- 新增 `public/core/workbench-state.js` 和 `scripts/desktop-shell-test.js`，覆盖工作台状态复用与桌面壳配置检查。
- 新增现代化简洁工作台布局：高级队列、导出设置、质量报告和插件信息默认折叠，右侧预览区改为单视图 tabs，减少首屏信息噪音。
- P0 桌面启动验收通过：Rust/Cargo 与 Visual Studio Build Tools 环境下，`npm run desktop:dev` 可编译并运行到 `target\debug\trans2former.exe`。
- 新增 P7 桌面发布计划 `docs/DESKTOP_RELEASE_PLAN.md`，覆盖安装包命名、checksum、平台 smoke、文件关联、自动更新和插件补丁包发布规则。
- 新增 release 插件补丁包：`public/plugin-patches/*.t2f-plugin.json`，格式增强能力随 release 打包，用户按需下载导入。
- 新增 `scripts/plugin-patch-release-test.js` 和 `scripts/p7-release-productization-test.js`，覆盖插件补丁包完整性和 P7 发布产品化门禁。

### 变更

- 插件下载面板中的 release patch 按钮改为一键导入：本地读取 `.t2f-plugin.json`、校验 manifest/hash、导入并启用，已安装插件和能力列表即时刷新。
- 产品方向从纯浏览器 Web 应用调整为 Trans2Former Desktop：Tauri 桌面 Web-GUI 专业格式转换工作台，当前 Web 应用作为核心验证底座保留。
- OFD 从“远期研究/不进近期路线”升级为 P5 战略攻坚格式，目标是本地高保真、质量报告和可解释降级。
- `DEVELOPMENT_TASKS.md` 已重排为 Desktop P0-P5：桌面工作台、编辑体验、低内存响应、插件隔离、重格式插件和 OFD/高保真攻坚。
- 插件分发路线调整为 GitHub Releases 优先：应用内只做下载/更新展示、跳转、导入、校验和回滚，不自建插件分发后端。
- 精简开发文档入口：删除重复专题页，将桌面体验、前端边界、本地模型插件和 OFD capability 内容并入主文档。
- 确定开发方向为模块化插件设计：基础热门格式免下载，重格式和可选能力按用户需求下载或加载对应模块插件。
- 安全路线收紧为零云端文档处理：不提供远程转换、云端 OCR、云端转写或云端 AI 增强。
- 格式路线删除 URL / YouTube / Audio transcription 主线，ZIP 降级为容器基础设施。
- 浏览器主界面从 demo 风格调整为专业转换工作台风格。
- 浏览器主界面从三栏说明型工作台重建为响应式用户端工具界面。
- 浏览器主界面升级为桌面工作台骨架，转换核心继续通过 `DocumentModel` 和 Worker 复用，保持浏览器 smoke test 可运行。
- 浏览器主界面从密集工程面板调整为更简洁的两栏工作流，默认聚焦文件、转换、预览和导出。
- 前端字体栈调整为 Claude 风格优先级，保持现有配色不变。
- Markdown 解析增强：支持有序列表、嵌套层级提示、表格对齐、脚注引用和脚注降级 warning。
- CSV 解析增强：支持 BOM、引号内逗号、引号内换行、空单元格、CRLF/LF 混合换行。
- XML 解析增强：支持命名空间、属性提取、嵌套结构摘要和 Node 环境 parsererror。
- 浏览器预览改为 idle callback 调度，文本文件入口改为分片读取，大文件默认进入手动预览。
- JSON 输出现在包含 `metadata`，用于保留转换审计和质量报告。
- PNG asset fallback 命名避免重复 `.png` 扩展名，并由审计层补齐 provenance。
- 输入格式矩阵新增 DOCX、XLSX、EPUB、PDF、PPTX input MVP。
- P3 状态从 MVP 推进为完成，后续真实样例扩展和高保真输出进入 P4。
- P4 状态推进为完成，后续进入 P4+ 真实样例、视觉质量和专业格式插件实现。
- `npm test` 现在运行核心 smoke、转换快照、浏览器自检静态服务检查、本地安全 smoke test、资源预算 smoke test、插件安全 smoke test 和 release readiness test。
- `DEVELOPMENT_TASKS.md` 已整理为任务看板，长期原则和格式矩阵移入 `docs/` 专题文档。
- Worker 错误现在透传结构化错误字段，便于 UI 渲染。

### 修复

- 修复 HTML / XML / 纯文本转换乱码：HTML reader 重写为 Node + 浏览器统一的轻量 tokenizer，识别 block 与 inline 标签（strong / em / a / code / img / br / del），不再依赖 `DOMParser` 也不再用 `textContent` 吞掉内联格式；XML / JSON 等 raw block 在 markdown writer 包成 fenced code、在 HTML writer 输出 pre/code，避免 XML → MD / HTML 输出空白；XML reader 不再额外塞残缺 summary paragraph；`getPlainText` 给列表加 `-` / `1.` 标记，TXT 输出保留列表语义。
- 修复 PDF 抽取性能与安全：`extractPdfObjects` 一次扫描复用，O(N²) → O(N)；`inflatePdfStream` 加单流 64MB / 总量 128MB 上限避免 zip-bomb；嵌入 PDF 数据 URL 加 4MB 上限避免 HTML 输出体积炸弹；PDFJS payload 哨兵中改用 `base64:` 包 JSON 避免抽出文本含哨兵字面量截断；`bytesToLatin1` 分块替代 spread；`useSystemFonts:false` 避免 Tauri 主线程卡 OS 字体枚举。
- 修复 PDF 输入预览和 PDF -> HTML 输出可能把 PDF 二进制对象噪声误判为正文的问题；上传 PDF 时会本地解压常见 `/FlateDecode` 文本流以提取可编辑文本，无法提取时保留原 PDF 嵌入式预览/HTML 输出，并显示明确降级说明和 warning，不再输出乱码正文。
- 修复 PDF 工作台前端体验：插件/安全入口和插件报告模块默认可见，二进制输入摘要采用紧凑布局，转换成功后自动切换到结果视图并启用下载。
- 重构工作台布局为双栏主区 + 底部抽屉：原右侧 utility-pane（9 张高低不平的 report-card）整体并入底部 `<details>` 抽屉，内部三个 tab（质量 / 插件 / 版本）以 `auto-fill minmax(260px,1fr)` 控宽度；顶栏并入紧凑进度组件，独立进度条行删除；插件 / 安全入口统一走顶栏"更多"，自动展开抽屉并切到对应 tab。

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
