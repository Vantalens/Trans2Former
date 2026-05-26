# Trans2Former 开发历史归档

本文件归档 `DEVELOPMENT_TASKS.md` 中已完成阶段的详细任务清单与历史验收记录。当前活跃看板见 [../../DEVELOPMENT_TASKS.md](../../DEVELOPMENT_TASKS.md)，逐次发布的变更见 [../../CHANGELOG.md](../../CHANGELOG.md)。

归档原则：

- 任务看板只承载“当前阶段、下一步、未完成项”。
- 已完成阶段保留状态行 + 验收门槛即可，详细子任务清单归档到本文件。
- 验收修复记录滚动归档：超过 4 周或下一个里程碑发布后从看板挪到这里。
- 单次发布的变更细节走 CHANGELOG，不再在本文件重复展开。

---

## 历史验收修复

### 2026-05-12

- P8-M6 fixtures 扩展 + SSIM 视觉对比框架。扩展 samples 到 50+ 个程序化生成样例，覆盖中英文、RTL 文本、复杂表格、代码示例等场景。新增 `scripts/visual-comparison-test.js` 框架和 `docs/VISUAL_COMPARISON_PLAN.md` 实现计划。修复 PDF 高保真输出坐标计算错误（dx 计算）和转换开始时标签页状态问题。生成 release 包（5.1MB）。所有 44 个测试组通过。
- P8-M4 高保真 PDF 输出双路实现。新增 `public/formats/pdf-output-high-fidelity.js`，直接消费 FixedLayoutModel，按 textRun.bbox 精确定位每个文本片段。`pdf-output.js` 升级为智能路由：优先高保真路径，回落程序化路径。Producer 标记区分 High-Fidelity vs 普通 Trans2Former。
- P8-M7 结构化 inline 节点 + 公式/合并单元格保留。DOCX reader 识别 hyperlink/bold/italic/del/code，输出 strong/em/del/code/link inline 节点；PDF reader 从 textContent.items 提取 fontName 识别 bold/italic；XLSX writer 回写 `<f>expression</f><v>cachedValue</v>` 和 `<mergeCells>`。新增 `public/core/models/mappers.js` 实现跨模型 mapper（workbook/slide/fixedLayout ↔ semantic）。
- 工作台 UI 重构为双栏主区 + 底部抽屉。原右侧 utility-pane 9 张 report-card 整体并入底部 `<details>` 抽屉，内部三个 tab（质量/插件/版本）。顶栏新增紧凑进度组件，独立进度条行删除。插件/安全入口统一走顶栏"更多"菜单。
- 修复 HTML / XML / 纯文本转换乱码。HTML reader 重写为 Node + 浏览器统一的轻量 tokenizer，识别 block 与 inline 标签，不再依赖 `DOMParser` 也不再用 `textContent` 吞掉内联格式。Markdown writer 把非 markdown raw block 包成 fenced code、HTML writer 输出 `pre/code`。`getPlainText` 给列表加 -/1. 标记。新增 `scripts/real-sample-conversion-probe.js`。
- PDF 抽取加固与审查问题修复。`extractPdfObjects` 一次扫描复用避免 N×M 重复；`inflatePdfStream` 加 64MB/128MB 上限避免 zip-bomb；嵌入 PDF 数据 URL 加 4MB 上限；PDFJS payload 哨兵改用 `base64:` 包 JSON；`bytesToLatin1` 分块替代 spread；`useSystemFonts:false` 避免 Tauri 主线程卡 OS 字体枚举。`local-security-test` 的 fetch 白名单改为正则白名单。

### 2026-05-09

- 接入本地 PDF.js 文本抽取引擎；PDF 上传阶段优先走 optional `pdfjs-dist` / `/vendor/pdfjs/` 的 `getTextContent()`，失败时才回落到核心解析器。
- 修复 PDF ToUnicode 识别串用问题；CMap 按当前 `/F... Tf` 字体绑定对应 `/ToUnicode`，多 CMap 无法绑定时拒绝输出猜测文本。
- 修复插件补丁包入口只下载/打开但不进入已安装状态的问题；可信 catalog 中随 release 提供的 `.t2f-plugin.json` 可一键读取、校验、导入并启用。
- 增强 PDF 文本抽取：解压 `/FlateDecode` 流后保留 ToUnicode CMap，支持 `<hex> Tj/TJ` 文本操作符解码，覆盖中文 PDF 的 CID → Unicode 映射。
- 修复 PDF 输入预览/HTML 输出误判二进制对象为正文的问题；无法提取可编辑正文时保留嵌入式预览/HTML 输出，返回 `PDF_NO_CREDIBLE_TEXT` warning。
- 修复 PDF 工作台前端体验：插件/安全入口默认可见，二进制 PDF 输入摘要不再撑出大块空白，转换成功后自动切到结果页。
- 重构工作台信息架构：主界面拆成输入、预览/结果、插件与质量信息三块。

---

## 已完成阶段详细清单

### P0：桌面 Web-GUI 工作台 MVP

状态：已完成。

目标：把浏览器转换核心升级为桌面专业工作台底座。

- [x] 建立 Tauri 桌面壳，明确最小文件系统权限和禁用远程文档处理边界。
- [x] 明确 Tauri + Web-GUI 选择判断、体验目标和当前不足（`docs/DESKTOP_APP_ARCHITECTURE.md`）。
- [x] 将当前转换核心迁移为桌面 GUI 可复用模块，保持浏览器 smoke test 可运行。
- [x] 文件拖拽、文件队列、任务状态、批量选择和失败重试。
- [x] 输出目录选择和导出命名策略。
- [x] Worker 转换任务基础链路。
- [x] 任务进度、取消、失败状态和 Blob URL 清理浏览器基线。
- [x] local-only 安全状态前端展示。
- [x] Input / DocumentModel / Output 三栏专业预览，窄屏切换为 tabs。
- [x] 底部 Warnings / Quality Report / Diff / Versions 面板。
- [x] Plugin Manager / Security Center 桌面入口。
- [x] 插件下载/更新板块入口（浏览器端和桌面端都可访问）。
- [x] 优化默认工作台信息架构：队列、导出设置、报告默认折叠。

验收门槛全部通过：`npm run desktop:dev` 完成 Tauri 编译并运行；浏览器 Web-GUI 可选文件、可转换、可导出；无需联网即可完成基础格式转换；文件系统权限只覆盖用户明确选择的文件。

### P1：转换质量与编辑体验

状态：已完成。

目标：从"生成结果"升级为"可编辑、可预览、可解释修复"的专业工作台。

- [x] Markdown / HTML / TXT / JSON / CSV / XML 基础格式质量补齐。
- [x] warnings 分级：info / lossy / unsupported / security / performance。
- [x] QualityReport、block id、source span、asset provenance、conversion metadata。
- [x] Markdown output profile：AI-ready、human-readable、archive、strict round-trip。
- [x] 输出文本编辑器（大文本不阻塞输入）。
- [x] 编辑后实时预览，预览失败时保留可编辑内容和错误解释。
- [x] session undo / redo。
- [x] session checkpoint：v0 初始转换结果、v1+ 用户修正。
- [x] version diff（按文本和 block id）。
- [x] warnings resolved 状态。
- [x] 关闭后持久版本历史 opt-in，默认不落盘。

### P2：低内存与高响应优化

状态：核心完成，Asset lazy-load 并入 P4。

- [x] 文本文件分片读取基线。
- [x] 预览 idle callback 调度。
- [x] active Worker、旧 Blob URL 和旧输出在取消后清理。
- [x] 动态分块合并设计和 direct vs chunked equivalence 基线。
- [x] Worker Transferable：大块 ArrayBuffer 传递避免复制。
- [x] 虚拟滚动：输入、输出、warnings 和质量报告列表必须适配大文档。
- [x] 渐进预览：50MB+ 文件先展示结构摘要和前 N 个块。
- [x] 大文件降级预览：100MB+ 文件可切换抽样、结构和全文模式。
- [x] Blob URL / Worker / ObjectURL 生命周期加入专项测试。
- [x] 建立性能 smoke test：冷启动、首个反馈、10MB 文本、50MB+ 渐进预览。

### P3：插件隔离与资源治理（已取消，2026-05-24）

原状态：核心运行时完成，真实插件沙箱加载器并入 P5。

2026-05-24 决策：取消产品插件系统和 release 插件补丁包路线。OFD、PNG/image OCR、PDF scan/OCR layout、table recovery 等增强能力改为核心内置本地能力。移除：插件管理 UI、catalog/runtime/policy、`.t2f-plugin.json` 补丁包、插件测试链和 release 复制逻辑。安全/资源预算/发布文档同步改为"不提供插件安装、文档处理全程在核心包内执行"。

### P4：架构收敛与质量基线

状态：已完成。

- [x] 拆分 `public/app.js`：工作台状态 → `public/core/workbench-state.js`，插件 catalog → `public/plugin-catalog.js`，插件管理 UI → `public/core/plugin-workbench-ui.js`。
- [x] 补 Node 可执行单元测试：`scripts/p4-p5-p6-test.js` 覆盖 lazy asset、capability、插件加载和高保真输出。
- [x] Asset lazy-load：`AssetStore.addLazy()` 延迟到预览或导出时加载并缓存。
- [x] 重格式 capability note：`docs/HEAVY_FORMAT_CAPABILITY_NOTES.md` 和 `getFormatCapabilities()`。
- [x] 公开样例库索引和 fixture 分层：basic / edge / large / lossy / security（`samples/fixtures/README.md`）。
- [x] 重格式公开样例和回归快照（仓库内公开样例、程序化 OOXML/PDF/PPTX fixture）。
- [x] Office/EPUB/PDF 复杂样式、图片、表格、链接和 metadata 质量回归。
- [x] ZIP64 和超大 OOXML 容器专项（stored/deflated/central directory/unsafe path）。
- [x] format registry 输出 `qualityGrade` / `warnings` / `resourceBudget` / `degradation`。

### P5：真实插件加载器（已取消，2026-05-24）

同 P3，路线取消。原计划承载 OFD/本地 OCR/高保真增强的真实插件系统已合并到"核心内置本地能力"路线。

### P6：高保真输出、本地模型与 OFD 攻坚

状态：已完成。

- [x] DOCX output MVP：段落、标题、列表、表格、图片占位 OOXML 包。
- [x] 程序化 PDF output：本地 `.pdf` 二进制 data URL。
- [x] PNG/JPEG rendering output 已降级隐藏（未达到内容保真前不进入输出矩阵）。
- [x] OFD-L0 样例登记入口：`samples/ofd/README.md`。
- [x] DOCX 高保真增强：样式、图片尺寸占位、表格宽度、列表编号、页面设置。
- [x] PDF 高保真增强：分页、字体基线、链接 annotation、表格文本、多页布局。
- [x] 本地 OCR/版面分析/表格恢复 capability/fallback 入口登记。
- [x] OFD L0-L4：容器/manifest/metadata → 页面树/文本/图片/附件 → 本地渲染 → 高保真 → 公开回归。

### P7：桌面发布与产品化

状态：核心完成，发布卫生和平台安装包仍在收尾。

目标：把当前 Web-GUI preview release 逐步升级为可分发、可安装、可更新的成熟桌面产品。

- [x] 明确当前 `release/trans2former-2.0.0/` 是 Web-GUI preview 包，不是 Tauri 安装包：见 `docs/DESKTOP_RELEASE_PLAN.md`。
- [x] 建立 Tauri build/release plan：Windows MSI/NSIS、macOS app/dmg、Linux AppImage/deb。
- [x] 建立签名、公证、校验和 release artifact 命名规则。
- [x] 建立平台 smoke test：Windows WebView2、macOS WKWebView、Linux WebKitGTK。
- [x] 建立桌面文件关联、最近文件、项目保存和导出目录权限策略。
- [x] 建立自动更新策略，但不得与文档处理阶段并发访问网络。
- [x] 发布文档区分 Web preview、desktop dev build、desktop installer、plugin release。
- [x] 新增 release 插件补丁包机制：格式增强能力以 `.t2f-plugin.json` 放入 `plugin-patches/`，用户按需下载导入。
- [x] `npm test` 增加 `plugin-patch-release-test` 和 `p7-release-productization-test`。
- [x] 清理 release 文档 trailing whitespace，保证 `git diff --check v2.0.0..HEAD` 通过。
- [x] 移除已跟踪的 `.claude/settings.local.json`，并在 `.gitignore` 中明确忽略本地 Claude/Codex 权限配置。
- [x] 修正 `RELEASE_GUIDE.md`：区分仓库路径 `public/plugin-patches/`、生成包内路径 `plugin-patches/` 和 GitHub Release asset 上传路径；补 Windows PowerShell 可执行的压缩与 SHA-256 命令。
- [x] 收敛发布说明中的质量断言：把"100% 测试覆盖率 / 代码质量 5/5 / 生产就绪"改为可核验的命令结果、测试组数量和已知限制。
- [x] 扩展 `scripts/release-readiness-test.js`，覆盖本地配置不得入库、release 指南 asset 路径存在、checksum 文件生成说明和 `git diff --check` 卫生门槛。

平台安装包真实产出、签名/公证和跨平台 smoke 仍需在对应 Windows/macOS/Linux 构建环境中完成；当前任务看板继续跟踪这部分。

### P8：多模型架构与转换路由

状态：S0 + M1-M6 全部完成。

#### P8-S0：PDF 坐标启发式版面分析

- [x] PDF reader 利用 textContent 坐标按字号聚类识别 heading 层级。
- [x] 按 y 间距识别段落分行、按 x 坐标聚类识别 list / multi-column。
- [x] 新增 `scripts/real-sample-conversion-probe.js` 对至少 3 份真 PDF 回归。

#### P8-M1：Capability Registry 重构

- [x] `format-registry.js` 新增 `inputModels[]` / `outputModels[]`。
- [x] `RoutePlanner.getAllowedOutputs(from)` 基于模型自动派生，与旧硬编码双跑对比。
- [x] 删除 `ALLOWED_OUTPUTS_BY_INPUT`，`docs/CONVERSION_PATHS.md` 引用 Planner 输出。

#### P8-M2：SemanticDoc + AssetGraph 拆分

- [x] `public/core/models/semantic-doc.js`：9 种 block + inline 节点（strong / em / link / code-inline / del / sup / sub）。
- [x] `public/core/models/asset-graph.js`：`model.assets[]` 抽到顶层共享。
- [x] HTML reader 输出 inline 节点；markdown writer 序列化回 markdown 标记。
- [x] 老 API 保留兼容。

#### P8-M3：WorkbookModel + SlideModel

- [x] `public/core/models/workbook-model.js`：sheets / cells / merges / formula cache。
- [x] `public/core/models/slide-model.js`：slides / shapes / notes / layout。
- [x] csv/xlsx → WorkbookModel；pptx → SlideModel。
- [x] 跨模型 mapper：`workbookToSemantic` / `semanticToWorkbook` / `slideToSemantic` / `semanticToSlide`。
- [x] xlsx writer 消费 WorkbookModel；pptx writer 消费 SlideModel。

#### P8-M4：FixedLayoutModel + PDF/OFD 升级

- [x] `public/core/models/fixed-layout.js`：pages / textRuns / annotations / signatures / bbox。
- [x] PDF reader 升级输出 FixedLayoutModel。
- [x] FixedLayoutModel ↔ SemanticDoc mapper（强制 `MODEL_VISUAL_FIDELITY_LOST`）。
- [x] OFD reader 升级到 L1。
- [x] PDF 输出双路：程序化 + 高保真。

#### P8-M5：External Engine Bridge Plugin

- [x] `engine-bridge` 插件类型登记。
- [x] Tauri sidecar 调用 LibreOffice/Pandoc/Calibre/ofdrw 占位。
- [x] Route Planner 优先 bridge 路径（hot），失败自动回落核心 mapper。
- [x] bridge 调用全程 local-only。

#### P8-M6：fixture corpus + 视觉回归

- [x] `samples/fixtures/` 扩到 50+ 真样例。
- [x] `scripts/conversion-quality-test.js`：文本/结构/表格/元数据保留率。
- [x] PDF/PNG SSIM 视觉对比基线框架（`docs/VISUAL_COMPARISON_PLAN.md`）。
- [x] `real-sample-conversion-probe.js` 升级为 Quality Report，跑 14×11 全矩阵 hot/warm/cold 打分。

---

## 路线删除/降级记录

- URL / YouTube URL：删除（不是文件格式，必然联网）。
- Audio / Transcription：从主路线删除。
- ZIP：降级为容器基础设施。
- 云端 OCR / 云端 AI / 云端转写：删除，不提供。
- 自动缓存恢复格式：不作为主线，改为 GUI 手动编辑 + 本地会话版本控制。
- 产品插件系统（2026-05-24）：取消，改为核心内置本地能力。

## 基础盘归档

- 浏览器 Web 应用基线已建立，Express 仅保留静态资源托管和 `/api/health`。
- Electron / Playwright / CLI / 服务端转换 API 已移除。
- `input -> DocumentModel -> output` 转换链路已建立。
- 可用输入：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX、XLSX、EPUB、PDF、PPTX。
- 可用输出：Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、EPUB、PPTX、PDF。
- 转换路径按文档/表格/演示/图片类型收敛，无意义路径在程序层拒绝。
- 主界面默认收敛为上传/格式选择/预览/转换/下载，维护视图默认隐藏。
- 用户端前端重建为响应式工作台 v3。
- Worker transferable 输入回归：大文本中文按声明 UTF-8 解码，二进制 data URL 不被误解码。
- 上传文本解码回归：UTF-8/ASCII Markdown 不再被误判为 UTF-16LE。
- 根目录文档整理：历史格式合规审计归档到 `docs/archive/format-compliance/`。
- `npm test` 覆盖核心转换、快照、格式能力、浏览器静态入口、队列状态、桌面壳、本地安全、资源预算、P2 响应、release readiness。
- 本地 release 包可通过 `npm run release:prepare` 生成。
- 文档入口精简：桌面体验、前端工作台、本地模型插件、OFD 能力合并入主架构文档。
