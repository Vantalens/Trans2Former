# Trans2Former Development Tasks

最后更新：2026-05-01

维护规则：

- 每次开发结束必须更新本文件。
- 每次开发结束后需进行代码审查和验收。
- 本文件只放阶段状态、任务拆分和下一步执行顺序。
- 长期原则、格式矩阵、架构说明放入 `docs/` 专题文档，不继续堆在任务看板里。
- 修改定位、安全边界、支持格式、测试命令或运行方式时，同步更新 README、CONTRIBUTING、INSTALL、COMMIT_CHECKLIST、CHANGELOG 和相关 docs。

## 当前方向决策

Trans2Former 当前产品方向正式收敛为：

> Trans2Former Desktop：基于 Tauri + Web-GUI 的专业级、本地优先、零上传、多格式、高质量桌面格式转换工作台。

关键判断：

- 当前 Web 应用继续作为转换核心和 GUI 验证底座，但最终用户产品不再定义为纯网页工具。
- 桌面形态采用 Tauri，不回到 Electron，不依赖 Microsoft Office、LibreOffice、Pandoc、云端转换 API 或云端 OCR/AI。
- Tauri + Web-GUI 路线合理，但不能只做套壳；体验目标必须按成熟现代 PC 桌面软件标准推进。
- 转换核心继续围绕 `input -> DocumentModel -> QualityReport / Warnings -> output`，避免 `N * N` 私有转换路线。
- DocumentModel 升级为统一格式中间层、质量审计层、GUI 编辑层和本地版本控制基础。
- OFD 不再只作为保守研究项处理；OFD 是政务、公文、票据场景的战略攻坚格式，目标是本地高保真和可解释降级。
- 插件系统必须隔离插件安装和文档处理：安装/更新可联网但不可接触用户文档，处理/编辑/导出可接触文档但必须禁联网。
- 插件下载服务采用 GitHub Releases，不自建分发后端；浏览器端和桌面端都必须保留下载板块和更新板块。
- 当前优先级从“继续堆格式”调整为“桌面工作台、编辑预览、版本控制、低内存高响应、插件隔离和高保真攻坚”。

## 下一步执行顺序

1. P0：建立 Tauri 桌面壳和专业 Web-GUI 工作台骨架，复用当前浏览器转换核心。
2. P1：补强转换质量、输出编辑、实时预览、本地会话版本和 warnings resolved 状态。
3. P2：补齐低内存与高响应能力，包括分片读取、Worker Transferable、虚拟滚动、渐进预览和清理策略。
4. P3：把现有插件安全策略推进为可用插件系统：安装、禁用、卸载、回滚、完整性校验和 processing no-network enforcement。
5. P4：把当前内置重格式能力整理为基础体验 + 可升级插件路线，补真实样例和质量回归。
6. P5：推进高保真输出、本地 OCR/layout/table 插件和 OFD 高保真攻坚。

## 文档入口

- 产品定位和零上传原则：[docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)
- 桌面 Web-GUI 架构：[docs/DESKTOP_APP_ARCHITECTURE.md](docs/DESKTOP_APP_ARCHITECTURE.md)
- 格式路线：[docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)
- 基础格式质量：[docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)
- DocumentModel：[docs/DOCUMENT_MODEL_SCHEMA.md](docs/DOCUMENT_MODEL_SCHEMA.md)
- 转换降级策略：[docs/CONVERSION_POLICY.md](docs/CONVERSION_POLICY.md)
- 安全策略：[docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)
- 插件安全模型：[docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md)
- 插件分发规则：[docs/PLUGIN_DISTRIBUTION.md](docs/PLUGIN_DISTRIBUTION.md)
- 资源预算：[docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)
- 动态分块合并：[docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md](docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md)
- OFD 攻坚路线：[docs/OFD_RESEARCH.md](docs/OFD_RESEARCH.md)
- 发布准备：[docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)
- 开发规范：[docs/development-standards/00_README.md](docs/development-standards/00_README.md)

## P0：桌面 Web-GUI 工作台 MVP

状态：桌面壳与 Web-GUI 工作台 MVP 已完成，Rust/Cargo 与 Visual Studio Build Tools 本机环境已安装，Tauri dev 真实桌面启动验收已通过。

目标：把当前 Web 转换工具升级为桌面专业工作台，让用户围绕文件队列、转换配置、结构编辑、预览、warnings 和导出完成完整工作流。

- [x] 建立 Tauri 桌面壳，明确最小文件系统权限和禁用远程文档处理边界。
- [x] 明确 Tauri + Web-GUI 选择判断、体验目标和当前不足：见 `docs/DESKTOP_APP_ARCHITECTURE.md`。
- [x] 将当前转换核心迁移为桌面 GUI 可复用模块，保持浏览器 smoke test 可继续运行。
- [x] 建立文件拖拽、文件队列、任务状态、批量选择和失败重试。
- [x] 建立输出目录选择和导出命名策略。
- [x] Worker 转换任务已建立基础链路。
- [x] 任务进度、取消、失败状态和 Blob URL 清理已建立浏览器基线。
- [x] local-only 安全状态已在当前前端展示。
- [x] 建立 Input / DocumentModel / Output 三栏专业预览，并为窄屏切换为 tabs。
- [x] 建立底部 Warnings / Quality Report / Diff / Versions 面板。
- [x] 建立 Plugin Manager 和 Security Center 的桌面入口。
- [x] 建立插件下载板块和更新板块入口，浏览器端和桌面端都必须可访问。
- [x] 优化默认工作台信息架构：队列、导出设置、报告和插件信息默认折叠，右侧改为单视图 tabs，降低首屏复杂度。

验收门槛：

- [x] 桌面应用真实启动验收：`npm run desktop:dev` 已完成 Tauri 编译并运行到 `target\debug\trans2former.exe`。
- [x] 浏览器 Web-GUI 可选文件、可转换、可导出，桌面壳复用同一前端。
- [x] 不需要联网即可完成基础热门格式转换。
- [x] 文件系统权限只覆盖用户明确选择的输入文件和输出目录。

## P1：转换质量与编辑体验

状态：部分完成。

目标：把转换器从“生成结果”升级为“可编辑、可预览、可解释修复”的专业工作台。

- [x] Markdown / HTML / TXT / JSON / CSV / XML 基础格式质量补齐。
- [x] warnings 分级已建立：info / lossy / unsupported / security / performance。
- [x] QualityReport、block id、source span、asset provenance 和 conversion metadata 已建立。
- [ ] 建立 Markdown output profile：AI-ready、human-readable、archive、strict round-trip。
- [ ] 建立输出文本编辑器，支持大文本不阻塞输入。
- [ ] 建立编辑后实时预览，预览失败时保留可编辑内容和错误解释。
- [ ] 建立 session undo / redo。
- [ ] 建立 session checkpoint：v0 初始转换结果、v1+ 用户修正。
- [ ] 建立 version diff，支持按文本和 block id 对比。
- [ ] 建立 warnings resolved 状态，用户修正后可标记处理。
- [ ] 建立关闭后持久版本历史 opt-in，默认不落盘保存用户内容。

验收门槛：

- [ ] 用户能在同一个工作台中上传、转换、编辑、预览、对比和导出。
- [ ] 所有持久化历史必须用户显式开启，并提供清除入口。

## P2：低内存与高响应优化

状态：部分完成。

目标：空闲低内存，小文件快响应，大文件不阻塞，超大文件可渐进处理和可解释降级。

- [x] 文本文件入口已建立分片读取基线。
- [x] 预览已接入 idle callback 调度。
- [x] active Worker、旧 Blob URL 和旧输出状态已在取消后清理。
- [x] 动态分块合并设计和 direct vs chunked equivalence 基线已建立。
- [ ] Worker Transferable：大块 ArrayBuffer 传递避免复制。
- [ ] 虚拟滚动：输入、输出、warnings 和质量报告列表必须适配大文档。
- [ ] 渐进预览：50MB+ 文件先展示结构摘要和前 N 个块。
- [ ] 大文件降级预览：100MB+ 文件可切换抽样、结构和全文模式。
- [ ] Asset lazy-load：图片、字体、附件只在预览或导出需要时加载。
- [ ] Blob URL / Worker / ObjectURL 生命周期加入专项测试。
- [ ] 建立性能 smoke test：冷启动、首个反馈、10MB 文本、50MB+ 渐进预览。

验收门槛：

- [ ] 10MB 文本转换不阻塞 UI。
- [ ] 50MB+ 文件可取消、可渐进反馈、不会误下载旧结果。
- [ ] 资源预算测试阻止重依赖进入默认核心路径。

## P3：插件隔离与资源治理

状态：策略完成，运行时待推进。

目标：插件可以扩展格式能力，但不能破坏本地安全、资源预算和处理阶段禁联网原则。

- [x] plugin manifest schema 已建立。
- [x] 权限模型已建立：install-network、process-document、read-assets、write-output、cache-plugin。
- [x] install mode / processing mode 隔离规则已建立。
- [x] processing no-network policy 已建立。
- [x] SHA-256 完整性校验工具已建立。
- [x] 插件资源预算测试已加入 `npm test`。
- [ ] 建立插件安装入口：下载插件时不能接触用户文档。
- [x] 确定插件分发策略：默认跳转 GitHub Releases，见 `docs/PLUGIN_DISTRIBUTION.md`。
- [ ] 浏览器端插件下载板块：展示插件列表、GitHub Release 链接、导入本地插件包入口。
- [ ] 桌面端插件下载板块：install mode 下访问 GitHub Release 或 release asset。
- [ ] 插件更新板块：展示可更新版本、release notes、权限变化、资源预算变化和回滚入口。
- [ ] 建立本地插件导入入口：校验 manifest、hash、签名或来源说明。
- [ ] 建立插件启用、禁用、卸载、回滚。
- [ ] 建立插件运行沙箱和处理阶段联网拦截验证。
- [ ] 建立插件能力发现：GUI 展示支持格式、资源预算、降级路径和安全模式。
- [ ] 建立插件崩溃隔离：单个插件失败不得污染当前转换任务和用户文件。

验收门槛：

- [ ] 插件下载和文档处理完全隔离。
- [ ] 处理阶段插件无法发起网络请求。
- [ ] 用户可以清楚看到插件权限、资源预算、能力和失败降级。

## P4：重格式插件与基础免下载体验

状态：基础能力完成，插件化整理待推进。

目标：热门格式开箱可用，重格式高保真增强按需插件化，避免核心包膨胀。

- [x] DOCX input MVP 已完成：标题、段落、表格、链接、图片引用、列表、页眉页脚、脚注、批注。
- [x] XLSX input MVP 已完成：工作表、共享字符串、基础表格、公式保留、日期格式、合并单元格 warning。
- [x] EPUB input MVP 已完成：OPF spine + XHTML heading/paragraph/table。
- [x] PDF text extraction MVP 已完成：文本型 PDF 到 Markdown/HTML/JSON。
- [x] PPTX input MVP 已完成：幻灯片标题、文本框、图片、表格、备注、母版引用。
- [x] ZIP/OOXML 容器基础设施已完成：解包、打包、deflate、central directory 校验和安全预算。
- [ ] 将当前重格式能力拆分为基础免下载层和增强插件层。
- [ ] 为 DOCX/XLSX/PPTX/EPUB/PDF 增加真实公开样例库和回归快照。
- [ ] 建立每个重格式的 capability note：支持范围、质量等级、warnings、资源预算。
- [ ] 建立 ZIP64 和超大 OOXML 容器专项。
- [ ] 建立 Office/EPUB/PDF 复杂样式、图片、表格、链接和 metadata 的质量回归。

验收门槛：

- [ ] 基础热门格式无需下载即可使用。
- [ ] 高保真增强能力不进入默认核心包。
- [ ] 每个重格式都有公开样例、快照、质量报告和降级说明。

## P5：高保真输出、本地模型与 OFD 攻坚

状态：P4 输出基线完成，P5 攻坚待推进。

目标：攻克市面常见转换器薄弱点：高保真输出、本地 OCR/layout/table 和 OFD 政务格式。

- [x] DOCX output MVP 已完成：基础段落、标题、列表、表格、图片占位和 OOXML 包。
- [x] 程序化 PDF output 已完成：本地 `.pdf` 二进制 data URL。
- [x] PNG/JPEG rendering output 已完成：本地图像二进制输出通道。
- [ ] DOCX output 高保真增强：样式、图片尺寸、表格宽度、列表编号、页眉页脚。
- [ ] 程序化 PDF 高保真增强：分页、字体、链接、图片、表格和多页布局。
- [ ] PNG/JPEG rendering 增强：真实文本渲染、多页策略、视觉快照。
- [ ] 本地 OCR 插件：扫描 PDF / 图片文档，不做云端 OCR。
- [ ] 本地版面分析插件：页面区块、阅读顺序、表格区域和图片区域。
- [ ] 本地表格恢复插件：PDF/图片中的表格结构恢复。
- [x] OFD-L0 样例登记入口：`samples/ofd/README.md` 已建立。
- [ ] OFD-L0：容器/manifest/metadata 读取。
- [ ] OFD-L1：页面树、文本对象、图片对象、附件列表到 DocumentModel。
- [ ] OFD-L2：本地 OFD -> PNG/PDF 渲染，输出质量报告和 warnings。
- [ ] OFD-L3：字体、矢量、签章、页面定位和资源引用高保真攻坚。
- [ ] OFD-L4：公开回归样例、视觉 diff、chunked 等价和资源预算。

验收门槛：

- [ ] OFD 不以“能跑”为验收，必须以公开样例、对照输出、视觉/结构质量报告和可解释 warnings 为验收。
- [ ] OFD 处理全程本地，不上传文件、文件名、签章信息、页面片段、错误日志或转换结果。
- [ ] 本地模型必须手动安装、手动启用、可删除，不进入核心包。

## 删除或降级路线

- [x] URL / YouTube URL：删除，不是文件格式，且必然联网。
- [x] Audio / Transcription：从主路线删除；音频转写不属于核心转换器。
- [x] ZIP：降级为容器基础设施，不作为转换格式宣传。
- [x] 云端 OCR / 云端 AI / 云端转写：删除，不提供。
- [x] 自动缓存恢复格式：不作为主线；改为 GUI 手动编辑 + 本地会话版本控制。

## 当前主要不足

- [ ] Tauri dev 桌面壳、最小文件权限和真实启动已完成；平台安装包、签名和正式发布流程仍待推进。
- [ ] 前端已有现代化 P0 工作台骨架；P1 仍需深化任务中心、输出编辑器、版本历史、插件管理运行时和安全中心。
- [ ] 编辑闭环未完成：输出编辑器、实时预览、undo/redo、checkpoint、version diff 和 warnings resolved 仍待推进。
- [ ] 大文件能力还不完整：Worker Transferable、虚拟滚动、渐进预览、Asset lazy-load 和生命周期专项测试仍待落地。
- [ ] 插件系统还停留在策略和校验层，尚未形成可安装、可禁用、可卸载、可回滚的运行时。
- [ ] 高保真输出和 OFD 攻坚还未进入真实实现和公开样例回归阶段。

## 已完成基础盘归档

- [x] 浏览器 Web 应用基线已建立，Express 仅保留静态资源托管和 `/api/health`。
- [x] Electron、Playwright、CLI 和服务端转换 API 已移除。
- [x] `input -> DocumentModel -> output` 转换链路已建立。
- [x] 当前可用输入：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX、XLSX、EPUB、PDF、PPTX。
- [x] 当前可用输出：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX、PDF、JPEG。
- [x] P0 基础格式质量、P1 DocumentModel 审计、P2 插件安全策略、P3 重格式输入、P4 输出基线已完成。
- [x] 用户端前端已重建为响应式工作台 v2。
- [x] README、INSTALL、CONTRIBUTING、CHANGELOG、COMMIT_CHECKLIST 和 docs 已同步上一阶段路线。
- [x] `npm test` 覆盖核心转换、快照、浏览器静态入口、本地安全、资源预算、插件安全和 release readiness。
- [x] 本地 release 包可通过 `npm run release:prepare` 生成到 `release/trans2former-2.0.0/`。
- [x] 文档入口已精简：桌面体验、前端工作台、本地模型插件、OFD 能力说明已合并入主架构/安全/OFD 文档。
