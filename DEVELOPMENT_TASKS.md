# Trans2Former Development Tasks

最后更新：2026-05-03

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

- 当前 Web 应用继续作为转换核心和 GUI 验证底座，最终用户产品面向成熟 PC 桌面体验。
- 桌面形态采用 Tauri，不回到 Electron，不依赖 Microsoft Office、LibreOffice、Pandoc、云端转换 API 或云端 OCR/AI。
- 转换核心继续围绕 `input -> DocumentModel -> QualityReport / Warnings -> output`，避免 `N * N` 私有转换路线。
- 热门基础格式必须免下载可用；高保真增强、OFD、本地 OCR/layout/table 必须插件化或按需加载。
- 插件系统必须隔离安装和文档处理：安装/更新可联网但不可接触用户文档，处理/编辑/导出可接触文档但必须禁联网。
- 插件下载服务采用 GitHub Releases，不自建分发后端；浏览器端和桌面端都必须保留下载板块和更新板块。
- 当前优先级从“继续堆格式”调整为“架构收敛、质量回归、真实插件加载器、高保真/OFD 攻坚和桌面发布产品化”。

## 当前项目判断

详细评估见 [docs/PROJECT_ASSESSMENT_2026-05-03.md](docs/PROJECT_ASSESSMENT_2026-05-03.md)。

当前结论：

- P0/P1/P2/P3 的核心链路已完成，项目已经有可验证的本地优先桌面工作台底座。
- 当前最大风险不是“缺更多格式”，而是 `public/app.js` 过大、真实插件加载器缺失、重格式质量回归不足、桌面发布链路不完整。
- 后续阶段必须先补可维护性和质量证据，再进入高保真/OFD 攻坚。

## 下一步执行顺序

1. P4：架构收敛与质量基线。拆分工作台模块、补 Asset lazy-load、建立重格式 capability note 和公开样例回归。
2. P5：真实插件加载器。把 P3 策略运行时升级为 Worker/WASM 沙箱加载、fixture 插件、资源限制和崩溃隔离。
3. P6：高保真输出、本地模型与 OFD 攻坚。按样例和质量报告推进 DOCX/PDF/OFD/OCR/layout/table。
4. P7：桌面发布与产品化。安装包、签名、自动更新、平台 smoke、文件关联和桌面权限体验。

## 文档入口

- 当前项目评估：[docs/PROJECT_ASSESSMENT_2026-05-03.md](docs/PROJECT_ASSESSMENT_2026-05-03.md)
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

状态：已完成。

目标：把浏览器转换核心升级为桌面专业工作台底座，让用户围绕文件队列、转换配置、结构编辑、预览、warnings 和导出完成完整工作流。

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

状态：已完成。

目标：把转换器从“生成结果”升级为“可编辑、可预览、可解释修复”的专业工作台。

- [x] Markdown / HTML / TXT / JSON / CSV / XML 基础格式质量补齐。
- [x] warnings 分级已建立：info / lossy / unsupported / security / performance。
- [x] QualityReport、block id、source span、asset provenance、conversion metadata 已建立。
- [x] 建立 Markdown output profile：AI-ready、human-readable、archive、strict round-trip。
- [x] 建立输出文本编辑器，支持大文本不阻塞输入。
- [x] 建立编辑后实时预览，预览失败时保留可编辑内容和错误解释。
- [x] 建立 session undo / redo。
- [x] 建立 session checkpoint：v0 初始转换结果、v1+ 用户修正。
- [x] 建立 version diff，支持按文本和 block id 对比。
- [x] 建立 warnings resolved 状态，用户修正后可标记处理。
- [x] 建立关闭后持久版本历史 opt-in，默认不落盘保存用户内容。

验收门槛：

- [x] 用户能在同一个工作台中上传、转换、编辑、预览、对比和导出。
- [x] 所有持久化历史必须用户显式开启，并提供清除入口。

## P2：低内存与高响应优化

状态：核心完成，Asset lazy-load 并入 P4。

目标：空闲低内存，小文件快响应，大文件不阻塞，超大文件可渐进处理和可解释降级。

- [x] 文本文件入口已建立分片读取基线。
- [x] 预览已接入 idle callback 调度。
- [x] active Worker、旧 Blob URL 和旧输出状态已在取消后清理。
- [x] 动态分块合并设计和 direct vs chunked equivalence 基线已建立。
- [x] Worker Transferable：大块 ArrayBuffer 传递避免复制。
- [x] 虚拟滚动：输入、输出、warnings 和质量报告列表必须适配大文档。
- [x] 渐进预览：50MB+ 文件先展示结构摘要和前 N 个块。
- [x] 大文件降级预览：100MB+ 文件可切换抽样、结构和全文模式。
- [x] Blob URL / Worker / ObjectURL 生命周期加入专项测试。
- [x] 建立性能 smoke test：冷启动、首个反馈、10MB 文本、50MB+ 渐进预览。

验收门槛：

- [x] 10MB 文本转换不阻塞 UI。
- [x] 50MB+ 文件可取消、可渐进反馈、不会误下载旧结果。
- [x] 资源预算测试阻止重依赖进入默认核心路径。

## P3：插件隔离与资源治理

状态：核心运行时完成，真实插件沙箱加载器并入 P5。

目标：插件可以扩展格式能力，但不能破坏本地安全、资源预算和处理阶段禁联网原则。

- [x] plugin manifest schema 已建立。
- [x] 权限模型已建立：install-network、process-document、read-assets、write-output、cache-plugin。
- [x] install mode / processing mode 隔离规则已建立。
- [x] processing no-network policy 已建立。
- [x] SHA-256 完整性校验工具已建立。
- [x] 插件资源预算测试已加入 `npm test`。
- [x] 建立插件安装入口：下载插件时不能接触用户文档。
- [x] 确定插件分发策略：默认跳转 GitHub Releases，见 `docs/PLUGIN_DISTRIBUTION.md`。
- [x] 浏览器端插件下载板块：展示插件列表、GitHub Release 链接、导入本地插件包入口。
- [x] 桌面端插件下载板块：install mode 下访问 GitHub Release 或 release asset。
- [x] 插件更新板块：展示可更新版本、release notes、权限变化、资源预算变化和回滚入口。
- [x] 建立本地插件导入入口：校验 manifest、hash、签名或来源说明。
- [x] 建立插件启用、禁用、卸载、回滚。
- [x] 建立插件运行沙箱和处理阶段联网拦截验证。
- [x] 建立插件能力发现：GUI 展示支持格式、资源预算、降级路径和安全模式。
- [x] 建立插件崩溃隔离：单个插件失败不得污染当前转换任务和用户文件。

验收门槛：

- [x] 插件下载和文档处理完全隔离。
- [x] 处理阶段插件无法发起网络请求。
- [x] 用户可以清楚看到插件权限、资源预算、能力和失败降级。

## P4：架构收敛与质量基线

状态：待推进。

目标：停止继续堆功能，把已完成的工作台和格式能力整理成可维护、可验证、可长期扩展的质量基线。

- [ ] 拆分 `public/app.js`：工作台状态、文件队列、预览渲染、输出编辑、插件管理、历史持久化分离为独立模块。
- [ ] 为拆分后的模块补 Node 可执行单元测试，减少浏览器 smoke 对字符串匹配的依赖。
- [ ] 建立 Asset lazy-load：图片、字体、附件只在预览或导出需要时加载。
- [ ] 为 DOCX/XLSX/PPTX/EPUB/PDF/PNG/JPEG 建立 capability note：支持范围、质量等级、warnings、资源预算、降级路径。
- [ ] 建立公开样例库索引和 fixture 分层：basic、edge、large、lossy、security。
- [ ] 为 DOCX/XLSX/PPTX/EPUB/PDF 增加真实公开样例和回归快照。
- [ ] 建立 Office/EPUB/PDF 复杂样式、图片、表格、链接和 metadata 的质量回归。
- [ ] 建立 ZIP64 和超大 OOXML 容器专项。
- [ ] 将“支持格式”展示从勾选矩阵升级为质量等级和降级说明。

验收门槛：

- [ ] `public/app.js` 不再继续承载新增业务主逻辑，新增功能必须落在明确模块中。
- [ ] 每个重格式都有公开样例、快照、质量报告和降级说明。
- [ ] 基础热门格式无需下载即可使用，高保真增强能力不进入默认核心包。
- [ ] `npm test` 覆盖 P4 模块拆分后的关键行为，而不是只检查字符串存在。

## P5：真实插件加载器

状态：待推进。

目标：把 P3 的插件策略和 GUI 管理入口升级为真实可执行的本地插件系统，为 OFD、本地 OCR 和高保真增强提供承载层。

- [ ] 定义插件包结构：manifest、entry、assets、fixtures、capability note、fallback。
- [ ] 建立 fixture 插件：不做真实格式增强，只验证加载、执行、失败、回滚和禁联网。
- [ ] 建立 Worker/WASM 插件沙箱加载器，处理阶段不得暴露网络 API。
- [ ] 插件执行必须有 timeout、内存预算、错误隔离和 fallback。
- [ ] 插件不得读取当前任务以外的文件，也不得读取插件安装阶段以外的下载信息。
- [ ] 插件能力注册必须进入 GUI 格式选择和 capability 展示，但不能污染基础格式核心。
- [ ] 插件版本更新必须展示权限变化、资源预算变化和 release notes。
- [ ] 插件崩溃、超时、资源超限必须保持当前用户输入、编辑内容和旧输出清理策略。

验收门槛：

- [ ] fixture 插件可以安装、启用、执行、禁用、卸载、回滚。
- [ ] processing mode 中 fixture 插件无法发起网络请求。
- [ ] 插件崩溃不会污染当前转换任务、用户文件、输出编辑器或下载链接。
- [ ] 插件加载器不引入默认重依赖，不突破资源预算。

## P6：高保真输出、本地模型与 OFD 攻坚

状态：待推进。

目标：攻克市面常见转换器薄弱点：高保真输出、本地 OCR/layout/table 和 OFD 政务格式。

- [x] DOCX output MVP 已完成：基础段落、标题、列表、表格、图片占位和 OOXML 包。
- [x] 程序化 PDF output 已完成：本地 `.pdf` 二进制 data URL。
- [x] PNG/JPEG rendering output 已完成：本地图像二进制输出通道。
- [x] OFD-L0 样例登记入口：`samples/ofd/README.md` 已建立。
- [ ] DOCX output 高保真增强：样式、图片尺寸、表格宽度、列表编号、页眉页脚。
- [ ] 程序化 PDF 高保真增强：分页、字体、链接、图片、表格和多页布局。
- [ ] PNG/JPEG rendering 增强：真实文本渲染、多页策略、视觉快照。
- [ ] 本地 OCR 插件：扫描 PDF / 图片文档，不做云端 OCR。
- [ ] 本地版面分析插件：页面区块、阅读顺序、表格区域和图片区域。
- [ ] 本地表格恢复插件：PDF/图片中的表格结构恢复。
- [ ] OFD-L0：容器/manifest/metadata 读取。
- [ ] OFD-L1：页面树、文本对象、图片对象、附件列表到 DocumentModel。
- [ ] OFD-L2：本地 OFD -> PNG/PDF 渲染，输出质量报告和 warnings。
- [ ] OFD-L3：字体、矢量、签章、页面定位和资源引用高保真攻坚。
- [ ] OFD-L4：公开回归样例、视觉 diff、chunked 等价和资源预算。

验收门槛：

- [ ] OFD 不以“能跑”为验收，必须以公开样例、对照输出、视觉/结构质量报告和可解释 warnings 为验收。
- [ ] OFD 处理全程本地，不上传文件、文件名、签章信息、页面片段、错误日志或转换结果。
- [ ] 本地模型必须手动安装、手动启用、可删除，不进入核心包。
- [ ] 高保真输出必须有视觉或结构回归，不能只靠人工打开文件判断。

## P7：桌面发布与产品化

状态：待推进。

目标：把当前 Web-GUI preview release 逐步升级为可分发、可安装、可更新的成熟桌面产品。

- [ ] 明确当前 `release/trans2former-2.0.0/` 是 Web-GUI preview 包，不是 Tauri 安装包。
- [ ] 建立 Tauri build/release plan：Windows MSI/NSIS、macOS app/dmg、Linux AppImage/deb。
- [ ] 建立签名、公证、校验和 release artifact 命名规则。
- [ ] 建立平台 smoke test：Windows WebView2、macOS WKWebView、Linux WebKitGTK。
- [ ] 建立桌面文件关联、最近文件、项目保存和导出目录权限策略。
- [ ] 建立自动更新策略，但不得与文档处理阶段并发访问网络。
- [ ] 发布文档区分 Web preview、desktop dev build、desktop installer、plugin release。

验收门槛：

- [ ] 用户能安装桌面包并在无网络环境完成基础转换。
- [ ] 安装包和更新通道不接触用户文档。
- [ ] 平台 smoke 证明核心 GUI、转换、导出和插件管理入口可用。

## 删除或降级路线

- [x] URL / YouTube URL：删除，不是文件格式，且必然联网。
- [x] Audio / Transcription：从主路线删除；音频转写不属于核心转换器。
- [x] ZIP：降级为容器基础设施，不作为转换格式宣传。
- [x] 云端 OCR / 云端 AI / 云端转写：删除，不提供。
- [x] 自动缓存恢复格式：不作为主线；改为 GUI 手动编辑 + 本地会话版本控制。

## 当前主要不足

- [ ] `public/app.js` 过大，工作台状态、插件管理、预览、历史和队列逻辑需要模块化拆分。
- [ ] 重格式能力已有基础实现，但公开样例、质量等级、capability note 和复杂文档回归不足。
- [ ] 插件系统已有核心运行时和 GUI 管理入口，但仍缺真实第三方插件加载、沙箱执行容器和公开 fixture 插件。
- [ ] 高保真输出和 OFD 攻坚还未进入真实实现和公开样例回归阶段。
- [ ] 桌面壳可开发启动，但平台安装包、签名、自动更新和平台 smoke 尚未完成。

## 已完成基础盘归档

- [x] 浏览器 Web 应用基线已建立，Express 仅保留静态资源托管和 `/api/health`。
- [x] Electron、Playwright、CLI 和服务端转换 API 已移除。
- [x] `input -> DocumentModel -> output` 转换链路已建立。
- [x] 当前可用输入：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX、XLSX、EPUB、PDF、PPTX。
- [x] 当前可用输出：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX、PDF、JPEG。
- [x] P0 工作台 MVP、P1 编辑体验、P2 响应核心、P3 插件治理核心运行时已完成。
- [x] 用户端前端已重建为响应式工作台 v2。
- [x] README、INSTALL、CONTRIBUTING、CHANGELOG、COMMIT_CHECKLIST 和 docs 已同步上一阶段路线。
- [x] `npm test` 覆盖核心转换、快照、浏览器静态入口、桌面壳、本地安全、资源预算、插件安全、P2 响应、P3 插件运行时和 release readiness。
- [x] 本地 release 包可通过 `npm run release:prepare` 生成到 `release/trans2former-2.0.0/`。
- [x] 文档入口已精简：桌面体验、前端工作台、本地模型插件、OFD 能力说明已合并入主架构/安全/OFD 文档。

## 固定验收命令

- `npm test`
- `git diff --check`
- `npm run release:prepare`
- `git check-ignore -v release\trans2former-2.0.0\RELEASE_MANIFEST.json`
