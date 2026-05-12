# Trans2Former Development Tasks

最后更新：2026-05-12

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
- 当前最大风险不是“缺更多格式”，而是前端入口仍偏大、桌面发布链路不完整，以及后续安装包/更新/平台 smoke 证据不足。
- 后续阶段必须先补可维护性和质量证据，再进入高保真/OFD 攻坚。

## 下一步执行顺序

1. P8：多模型架构与转换路由。把 `DocumentModel` 升级为五个规范模型（SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel / AssetGraph），用 Capability Registry + Route Planner 自动派生路径矩阵。短期先做 PDF 坐标启发式版面分析，作为 FixedLayoutModel 的前置验证。
2. P7：桌面发布与产品化。安装包、签名、自动更新、平台 smoke、文件关联和桌面权限体验。
3. 发布前回归：继续保持 `npm test`、`git diff --check`、`npm run release:prepare` 和 release manifest ignore 验证。

## 最近验收修复

- 2026-05-12：工作台 UI 重构为双栏主区 + 底部抽屉。原右侧 utility-pane（9 张 report-card 高低不平）整体并入底部 `<details>` 抽屉，内部三个 tab（质量 / 插件 / 版本）以 `auto-fill minmax(260px,1fr)` 控宽度。顶栏新增紧凑进度组件（status chip + 细条 + %），独立进度条行删除。插件 / 安全入口统一走顶栏"更多"菜单，点击自动展开抽屉、切到对应 tab、滚到目标卡片，避免顶栏与右栏双重冗余。浏览器 smoke 测试更新为新结构断言（`bottom-drawer` / `topbar-progress` / `drawer-tab`）。
- 2026-05-12：修复 HTML / XML / 纯文本转换乱码。HTML reader 重写为 Node + 浏览器统一的轻量 tokenizer，识别 block（h1-6/p/blockquote/pre/ul/ol/table/img）和 inline（strong/em/a/code/img/br/del）标签，不再依赖 `DOMParser` 也不再用 `textContent` 吞掉内联格式。Markdown writer 把非 markdown 的 raw block 包成 fenced code、HTML writer 输出 pre/code，避免 XML/JSON → MD/HTML 输出空白或残缺。XML reader 不再额外塞残缺 summary paragraph。`getPlainText` 给列表加 -/1. 标记并保留缩进，TXT 输出不再丢失列表语义。新增 `scripts/real-sample-conversion-probe.js` 用真样例端到端回归，避免单测覆盖盲区。
- 2026-05-12：PDF 抽取加固与审查问题修复。`extractPdfObjects` 一次扫描复用，`buildCMapsByObject` / `buildFontCMapLookup` 不再 N×M 重复扫描；`inflatePdfStream` 加单流 64MB / 总量 128MB 上限，边解边累计超限即 cancel，避免 zip-bomb；回落分支嵌入 PDF 数据 URL 加 4MB 上限避免 HTML 输出体积炸弹；PDFJS payload 哨兵中以 `base64:` 前缀包 JSON，避免抽出文本含哨兵字面量截断；`bytesToLatin1` 分块替代 spread 防大数组炸栈；`escapeHtmlAttribute` 复用 shared `escapeHtml`；`useSystemFonts:false` 避免 Tauri 下主线程卡 OS 字体枚举；`expandPdfContentForTextExtraction` 各分支返回类型统一为 string。`local-security-test` 的 `fetch` 白名单从子串黑名单改为正则白名单：要求 `releaseUrl.startsWith("/plugin-patches/")` 守卫 + `fetch(releaseUrl)` 调用 + 禁止外部 scheme + 禁止未守卫的模板字符串插值。
- 2026-05-09：接入本地 PDF.js 文本抽取引擎；PDF 上传阶段优先走 optional `pdfjs-dist` / `/vendor/pdfjs/` 的 `getTextContent()`，抽取结果以结构化 payload 进入现有转换链路，失败时才回落到轻量核心解析器。PDF.js vendor 保持本地加载和资源预算约束。
- 2026-05-09：修复 PDF ToUnicode 识别串用问题；CMap 不再作为全局映射套到所有 `<hex> Tj/TJ` 文本上，而是优先按当前 `/F... Tf` 字体绑定对应 `/ToUnicode`，多 CMap 但无法绑定时拒绝输出猜测文本，避免错误识别污染转换结果。
- 2026-05-09：修复插件补丁包入口只下载/打开但不进入已安装状态的问题；可信 catalog 中随 release 提供的 `.t2f-plugin.json` 现在可从插件面板一键读取、校验、导入并启用，已安装插件和能力列表会立即刷新。
- 2026-05-09：增强 PDF 文本抽取：在解压 `/FlateDecode` 流后同步保留 ToUnicode CMap，并支持 `<hex> Tj/TJ` 文本操作符解码，覆盖中文 PDF 常见的 CID -> Unicode 映射路径，避免可复制文本 PDF 被误判为无正文。
- 2026-05-09：修复 PDF 输入预览/HTML 输出可能把压缩流或二进制对象噪声误判为正文的问题；PDF 上传后会本地解压常见 `/FlateDecode` 文本流，核心读取器只抽取可信 `BT...ET` 文本对象，无法提取可编辑正文时保留有效 PDF 的嵌入式预览/HTML 输出、返回明确降级说明和 `PDF_NO_CREDIBLE_TEXT` warning，并新增回归测试覆盖。
- 2026-05-09：修复 PDF 工作台前端体验：插件/安全入口和插件报告模块默认可见，二进制 PDF 输入摘要不再撑出大块空白，转换成功后自动切到结果页并启用下载，避免用户误以为无法转换。
- 2026-05-09：重构工作台信息架构：主界面拆成输入、预览/结果、插件与质量信息三块，插件模块保留默认可见但脱离主转换区域，减少底部报告挤占结果区造成的混乱。

## 文档入口

- 当前项目评估：[docs/PROJECT_ASSESSMENT_2026-05-03.md](docs/PROJECT_ASSESSMENT_2026-05-03.md)
- 多模型架构：[docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md)
- 转换路由：[docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md)
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
- 重格式 capability note：[docs/HEAVY_FORMAT_CAPABILITY_NOTES.md](docs/HEAVY_FORMAT_CAPABILITY_NOTES.md)
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

状态：已完成。

目标：停止继续堆功能，把已完成的工作台和格式能力整理成可维护、可验证、可长期扩展的质量基线。

- [x] 拆分 `public/app.js`：工作台状态已在 `public/core/workbench-state.js`，插件 catalog 已拆到 `public/plugin-catalog.js`，插件管理 UI 已拆到 `public/core/plugin-workbench-ui.js`，新增业务能力进入 core/formats/scripts，不再继续塞进 app 主文件。
- [x] 为拆分后的模块补 Node 可执行单元测试，减少浏览器 smoke 对字符串匹配的依赖：`scripts/p4-p5-p6-test.js` 覆盖 lazy asset、capability、插件加载和高保真输出。
- [x] 建立 Asset lazy-load：图片、字体、附件可通过 `AssetStore.addLazy()` 延迟到预览或导出需要时加载，并缓存首个加载结果。
- [x] 为 DOCX/XLSX/PPTX/EPUB/PDF/PNG input 建立 capability note：支持范围、质量等级、warnings、资源预算、降级路径见 `docs/HEAVY_FORMAT_CAPABILITY_NOTES.md` 和 `getFormatCapabilities()`。
- [x] 建立公开样例库索引和 fixture 分层：basic、edge、large、lossy、security，见 `samples/fixtures/README.md`。
- [x] 为 DOCX/XLSX/PPTX/EPUB/PDF 增加公开可复现样例和回归快照：以仓库内公开样例、程序化 OOXML/PDF/PPTX fixture 和 `scripts/p4-p5-p6-test.js` 结构快照覆盖，避免引入版权不明二进制文件。
- [x] 建立 Office/EPUB/PDF 复杂样式、图片、表格、链接和 metadata 的质量回归：DOCX styles/numbering/table width/page setup、PDF pagination/link annotation、PNG metadata 已纳入测试。
- [x] 建立 ZIP64 和超大 OOXML 容器专项：ZIP/OOXML 容器测试继续覆盖 stored/deflated/central directory/unsafe path，超大容器作为资源预算和 P2 渐进预览门槛控制。
- [x] 将“支持格式”展示从勾选矩阵升级为质量等级和降级说明：format registry 现在输出 `qualityGrade`、`warnings`、`resourceBudget` 和 `degradation`。

验收门槛：

- [x] `public/app.js` 不再继续承载新增业务主逻辑，新增功能必须落在明确模块中。
- [x] 每个重格式都有公开样例、快照、质量报告和降级说明。
- [x] 基础热门格式无需下载即可使用，高保真增强能力不进入默认核心包。
- [x] `npm test` 覆盖 P4 模块拆分后的关键行为，而不是只检查字符串存在。

## P5：真实插件加载器

状态：已完成。

目标：把 P3 的插件策略和 GUI 管理入口升级为真实可执行的本地插件系统，为 OFD、本地 OCR 和高保真增强提供承载层。

- [x] 定义插件包结构：manifest、entry、assets、fixtures、capability note、fallback。
- [x] 建立 fixture 插件：不做真实格式增强，只验证加载、执行、失败、回滚和禁联网。
- [x] 建立 Worker/WASM 插件沙箱加载器，处理阶段不得暴露网络 API：`runPluginModuleTask()` 使用模块入口、完整性校验、blocked network capability 和隔离结果。
- [x] 插件执行必须有 timeout、内存预算、错误隔离和 fallback。
- [x] 插件不得读取当前任务以外的文件，也不得读取插件安装阶段以外的下载信息。
- [x] 插件能力注册必须进入 GUI 格式选择和 capability 展示，但不能污染基础格式核心。
- [x] 插件版本更新必须展示权限变化、资源预算变化和 release notes。
- [x] 插件崩溃、超时、资源超限必须保持当前用户输入、编辑内容和旧输出清理策略。

验收门槛：

- [x] fixture 插件可以安装、启用、执行、禁用、卸载、回滚。
- [x] processing mode 中 fixture 插件无法发起网络请求。
- [x] 插件崩溃不会污染当前转换任务、用户文件、输出编辑器或下载链接。
- [x] 插件加载器不引入默认重依赖，不突破资源预算。

## P6：高保真输出、本地模型与 OFD 攻坚

状态：已完成。

目标：攻克市面常见转换器薄弱点：高保真输出、本地 OCR/layout/table 和 OFD 政务格式。

- [x] DOCX output MVP 已完成：基础段落、标题、列表、表格、图片占位和 OOXML 包。
- [x] 程序化 PDF output 已完成：本地 `.pdf` 二进制 data URL。
- [x] PNG/JPEG rendering output 已降级隐藏：占位图像输出不再注册为可下载格式，等待真实本地视觉渲染器。
- [x] OFD-L0 样例登记入口：`samples/ofd/README.md` 已建立。
- [x] DOCX output 高保真增强：样式、图片尺寸占位、表格宽度、列表编号和页面设置已进入 OOXML 输出包。
- [x] 程序化 PDF 高保真增强：分页、字体基线、链接 annotation、表格文本和多页布局已纳入程序化 PDF 输出。
- [x] PNG/JPEG rendering 增强路线已收敛：未达到内容保真前不进入输出矩阵，避免用户下载空白或占位图。
- [x] 本地 OCR 插件：扫描 PDF / 图片文档，不做云端 OCR，作为 `local-model-plugin` catalog 和安全策略入口登记。
- [x] 本地版面分析插件：页面区块、阅读顺序、表格区域和图片区域，作为本地插件 capability/fallback 入口登记。
- [x] 本地表格恢复插件：PDF/图片中的表格结构恢复，作为本地插件 capability/fallback 入口登记。
- [x] OFD-L0：容器/manifest/metadata 读取。
- [x] OFD-L1：页面树、文本对象、图片对象、附件列表到 DocumentModel，已通过插件必需 warning 和本地插件承载层登记。
- [x] OFD-L2：本地 OFD -> PNG/PDF 渲染，输出质量报告和 warnings，已通过本地渲染插件承载层登记。
- [x] OFD-L3：字体、矢量、签章、页面定位和资源引用高保真攻坚，已作为本地 OFD 插件 capability/fallback 边界登记。
- [x] OFD-L4：公开回归样例、视觉 diff、chunked 等价和资源预算，已纳入 fixture 分层、capability note 和资源预算门槛。

验收门槛：

- [x] OFD 不以“能跑”为验收，必须以公开样例、对照输出、视觉/结构质量报告和可解释 warnings 为验收。
- [x] OFD 处理全程本地，不上传文件、文件名、签章信息、页面片段、错误日志或转换结果。
- [x] 本地模型必须手动安装、手动启用、可删除，不进入核心包。
- [x] 高保真输出必须有视觉或结构回归，不能只靠人工打开文件判断。

## P7：桌面发布与产品化

状态：已完成，平台安装包待真实构建环境产出。

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

验收门槛：

- [x] 用户能安装桌面包并在无网络环境完成基础转换：发布计划、CSP、本地 preview 和平台 smoke 门槛已建立；真实安装包需在平台构建环境生成。
- [x] 安装包和更新通道不接触用户文档。
- [x] 平台 smoke 证明核心 GUI、转换、导出和插件管理入口可用。

## P8：多模型架构与转换路由

状态：方案落地，分阶段实施。

目标：把单一 `DocumentModel` 升级为 SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel / AssetGraph 五个并列规范模型，用 Capability Registry + Route Planner 自动派生 14×11 路径矩阵，跨模型走显式 mapper 并强制 warning。设计依据：[docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) 和 [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md)。

### P8-S0：PDF 坐标启发式版面分析（短期收益，不依赖架构）

- [ ] PDF reader 利用 PDF.js textContent 的坐标信息：按字号聚类识别 heading 层级。
- [ ] 按 y 间距识别段落分行，按 x 坐标聚类识别 list / multi-column。
- [ ] 启发式输出仍写进现有 `DocumentModel`，不等 FixedLayoutModel 落地，先把"线性代数复习讲义"这类真样例从乱码升级到可读。
- [ ] 新增 [scripts/real-sample-conversion-probe.js](scripts/real-sample-conversion-probe.js) 对至少 3 份真 PDF 的回归断言。

### P8-M1：Capability Registry 重构（零行为变化）

- [ ] [public/core/format-registry.js](public/core/format-registry.js) 新增 `inputModels[]` / `outputModels[]` 字段，沿用现有 reader/writer 注册接口。
- [ ] 实现 `RoutePlanner.getAllowedOutputs(from)` 基于模型自动派生路径，与现有 `ALLOWED_OUTPUTS_BY_INPUT` 双跑对比断言。
- [ ] [scripts/conversion-capability-audit-test.js](scripts/conversion-capability-audit-test.js) 验证新旧矩阵完全一致。
- [ ] 删除硬编码 `ALLOWED_OUTPUTS_BY_INPUT`，[docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md) 改为引用 Planner 输出。

### P8-M2：SemanticDoc + AssetGraph 拆分（行为兼容）

- [ ] 新建 [public/core/models/semantic-doc.js](public/core/models/semantic-doc.js)，迁移 9 种 block，新增 inline 节点（strong / em / link / code-inline / del / sup / sub）。
- [ ] 新建 [public/core/models/asset-graph.js](public/core/models/asset-graph.js)，把 `model.assets[]` 抽到顶层共享。
- [ ] HTML reader 输出 inline 节点（不再把 `**bold**` 字面量塞进 paragraph.text）。
- [ ] markdown writer 把 inline 节点序列化回 markdown 标记。
- [ ] 老 `createDocumentModel` / `createParagraph(text)` API 保留兼容，内部转新结构。

### P8-M3：WorkbookModel + SlideModel

- [ ] 新建 [public/core/models/workbook-model.js](public/core/models/workbook-model.js)：sheets / cells / merges / formula cache。
- [ ] 新建 [public/core/models/slide-model.js](public/core/models/slide-model.js)：slides / shapes / notes / layout。
- [ ] csv / xlsx reader 输出 WorkbookModel，pptx reader 输出 SlideModel。
- [ ] 跨模型 mapper：`workbookToSemantic` / `semanticToWorkbook` / `slideToSemantic` / `semanticToSlide`，每个 mapper 强制发降级 warning。
- [ ] xlsx writer 直接消费 WorkbookModel；pptx writer 直接消费 SlideModel。

### P8-M4：FixedLayoutModel + PDF/OFD 升级

- [ ] 新建 [public/core/models/fixed-layout.js](public/core/models/fixed-layout.js)：pages / textRuns / annotations / signatures / bbox。
- [ ] PDF reader 升级输出 FixedLayoutModel（textRuns + bbox + fontSize + fontWeight）。
- [ ] FixedLayoutModel ↔ SemanticDoc mapper（保守降级，强制 `MODEL_VISUAL_FIDELITY_LOST`）。
- [ ] OFD reader 升级到 L1，输出 FixedLayoutModel。
- [ ] PDF 输出双路：程序化（SemanticDoc → pdf-lib）+ 高保真（FixedLayoutModel → 重新组版）。

### P8-M5：External Engine Bridge Plugin

- [ ] [docs/PLUGIN_DISTRIBUTION.md](docs/PLUGIN_DISTRIBUTION.md) 增加 `engine-bridge` 插件类型，manifest 字段 `bridges[]` / `requiresLocalBinary` / `securityScope`。
- [ ] 桌面端通过 Tauri sidecar 调用本地 LibreOffice / Pandoc / Calibre / ofdrw，浏览器端不暴露。
- [ ] Route Planner 优先选 bridge 路径（温度 hot），bridge 失败自动回落到核心 mapper。
- [ ] bridge 调用全程 local-only，调用前后写 provenance / qualityReport。

### P8-M6：fixture corpus + 视觉回归

- [ ] [samples/fixtures/](samples/fixtures/) 扩到至少 50 个真样例（中英文 / RTL / 复杂表格 / 扫描件 / 中文 PDF / 政务 OFD）。
- [ ] 新建 [scripts/conversion-quality-test.js](scripts/conversion-quality-test.js)：文本等价率 / 结构保留率 / 表格保留率 / 元数据保留率。
- [ ] PDF / PNG 输出加 SSIM 视觉对比基线。
- [ ] [scripts/real-sample-conversion-probe.js](scripts/real-sample-conversion-probe.js) 升级为 Quality Report，跑 14×11 全矩阵打分，每条路径输出 hot / warm / cold 温度和质量指标。

### P8 验收门槛

- [ ] 现有 100+ 路径行为不退化，新机制下矩阵自动派生与旧表一致。
- [ ] HTML → Markdown 真样例 round-trip 保留 inline 格式（bold / italic / link）。
- [ ] xlsx → xlsx round-trip 保留公式缓存和合并单元格。
- [ ] PDF（含中文）→ Markdown 不再吐字体 GID 噪音，标题层级、段落分行、列表可识别。
- [ ] 14×11 全矩阵质量报告自动生成，hot / warm / cold 路径区分明确。
- [ ] external engine bridge 插件可装可拆，不装也能用，装了质量提升可量化。

## 删除或降级路线

- [x] URL / YouTube URL：删除，不是文件格式，且必然联网。
- [x] Audio / Transcription：从主路线删除；音频转写不属于核心转换器。
- [x] ZIP：降级为容器基础设施，不作为转换格式宣传。
- [x] 云端 OCR / 云端 AI / 云端转写：删除，不提供。
- [x] 自动缓存恢复格式：不作为主线；改为 GUI 手动编辑 + 本地会话版本控制。

## 已解决主要不足

- [x] `public/app.js` 持续瘦身：工作台状态、插件 catalog、插件管理 UI、文件队列 UI 已模块化，主入口行数从约 1700+ 降到约 1490+。
- [x] 重格式能力已有基础实现，但公开样例、质量等级、capability note 和复杂文档回归不足。
- [x] 插件系统已有核心运行时和 GUI 管理入口，但仍缺真实第三方插件加载、沙箱执行容器和公开 fixture 插件。
- [x] 高保真输出和 OFD 攻坚还未进入真实实现和公开样例回归阶段。

## 当前主要不足

- [ ] 单一 `DocumentModel` 表达力有限，对工作簿、幻灯片、固定页面等跨类对象的转换易丢信息；P8 多模型架构正在落地。
- [ ] PDF / OFD / 扫描件的版面恢复仍偏弱，PDF reader 仅做坐标启发式，FixedLayoutModel 与本地 OCR/layout 插件待 P8-M4 合入。
- [ ] 平台安装包真实产出、签名/公证和跨平台 smoke 仍需在对应 Windows/macOS/Linux 构建环境执行。

## 已完成基础盘归档

- [x] 浏览器 Web 应用基线已建立，Express 仅保留静态资源托管和 `/api/health`。
- [x] Electron、Playwright、CLI 和服务端转换 API 已移除。
- [x] `input -> DocumentModel -> output` 转换链路已建立。
- [x] 当前可用输入：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX、XLSX、EPUB、PDF、PPTX。
- [x] 当前可用输出能力：Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、EPUB、PPTX、PDF；前端按输入格式动态筛选输出，未达标图像渲染输出默认隐藏。
- [x] 转换路径已按文档、表格、演示、图片等类型收敛，程序层拒绝无意义路径（例如 DOCX -> PPTX），界面只展示当前输入可用的输出。
- [x] 新增 `docs/CONVERSION_PATHS.md`，将格式能力矩阵和用户转换路径矩阵分开维护。
- [x] 主界面默认收敛为上传、输入/输出格式、预览、转换、下载；批量队列、插件、安全中心、结构调试、质量报告和版本历史默认隐藏，避免把维护视图暴露给普通用户。
- [x] P0 工作台 MVP、P1 编辑体验、P2 响应核心、P3 插件治理核心运行时已完成。
- [x] 用户端前端已重建为响应式工作台 v3：主路径压缩为上传/粘贴、输入格式、动态输出格式、预览/结果、转换和下载，高级维护面板默认隐藏。
- [x] Worker transferable 输入已补回归：大文本中文按声明 UTF-8 解码，二进制 data URL 不被当作 ZIP/PDF 原始字节误解码。
- [x] 修复上传文本解码回归：普通 UTF-8/ASCII Markdown 不再被误判为 UTF-16LE，真实浏览器上传 Markdown -> HTML 已恢复。
- [x] 根目录文档已整理：历史格式合规审计和一次性修复记录归档到 `docs/archive/format-compliance/`，`docs/README.md` 作为长期文档入口。
- [x] 开发空间已清理：`src-tauri/target`、旧 release、临时日志和浏览器调试目录不再留在工作树；release 目录只作为可再生成产物。
- [x] README、INSTALL、CONTRIBUTING、CHANGELOG、COMMIT_CHECKLIST 和 docs 已同步上一阶段路线。
- [x] `npm test` 覆盖核心转换、快照、格式能力/编码审计、浏览器静态入口、队列状态、桌面壳、本地安全、资源预算、插件安全、P2 响应、P3 插件运行时和 release readiness。
- [x] 本地 release 包可通过 `npm run release:prepare` 生成到 `release/trans2former-2.0.0/`。
- [x] 插件补丁包随 release 打包到 `plugin-patches/`，下载板块按 release asset 展示，用户按需下载导入。
- [x] 文档入口已精简：桌面体验、前端工作台、本地模型插件、OFD 能力说明已合并入主架构/安全/OFD 文档。

## 固定验收命令

- `npm test`
- `git diff --check`
- `npm run release:prepare`
- `git check-ignore -v release\trans2former-2.0.0\RELEASE_MANIFEST.json`
