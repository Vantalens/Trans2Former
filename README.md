# Trans2Former

Trans2Former Desktop 是一个专业级、本地优先、零上传、多格式、高质量的桌面端格式转换处理器。最终产品形态为 Tauri 桌面壳 + Web-GUI 前端 + TypeScript 转换核心 + Web Worker / WASM + 本地插件系统；当前仓库仍以浏览器 Web 应用验证转换核心和前端工作台。文档处理阶段必须本地执行，不提供云端文档处理、远程转换、远程 OCR、远程转写或远程 AI 增强。基础热门格式免下载可用，重格式、高保真渲染、本地模型和 OFD 能力按需插件化。

## 当前状态

- 项目名：Trans2Former
- 包名：`trans2former`
- 当前可用输入：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX/XLSX/EPUB/PDF/PPTX input
- 当前可用输出：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX、PDF、JPEG
- Electron：已移除
- Playwright：已从运行依赖移除
- CLI：已从当前运行形态移除，项目收敛为桌面 Web-GUI 工作台路线
- PDF：当前支持文本型 PDF 输入和程序化 PDF 二进制输出
- 数据安全：文档处理阶段 `local-only`，不提供云端文档处理
- 前端体验：响应式用户端工作台，围绕上传、编辑、预览、转换和下载组织
- P0 工作台：已建立文件队列、批量选择、失败重试、输出命名策略、Input / DocumentModel / Output 三栏、底部 Warnings / Quality Report / Diff / Versions 面板、Plugin Manager 和 Security Center 入口
- 桌面壳：已加入最小 Tauri v2 scaffold 和权限检查；真实桌面启动需要本机安装 Rust/Cargo 工具链
- 交互状态：支持结构化错误详情、脱敏诊断复制、阶段化转换进度和取消后输出清理
- P1 输出编辑：文本输出编辑器已支持实时预览、undo / redo、checkpoint、version diff、warnings resolved 和本地历史 opt-in
- 文件大小：不设置人为上传大小上限；文本文件入口已使用分片读取，大文件默认手动预览以减少卡顿
- 基础格式质量：Markdown、CSV、XML 已补齐 P0 高风险语法路径和可解释 warnings
- 质量审计：P1 已补齐 block id、source span、block warnings、asset provenance、conversion metadata、quality report、chunked equivalence、version diff 和会话历史
- 插件安全：P2 已建立 plugin manifest、权限模型、安装/处理隔离、processing no-network、完整性校验和插件资源预算
- P3 进展：已完成 ZIP/OOXML 容器、DOCX、XLSX、EPUB、PDF text extraction、PPTX input；包含 deflate、central directory 校验和 Office 增强提取路径
- P4 进展：已完成 DOCX output、程序化 PDF output、PNG/JPEG rendering output 的本地二进制输出基线
- 发布准备：可运行 `npm run release:prepare` 生成本地 `release/trans2former-2.0.0/` 发布包
- 超大文件策略：规划动态分块转换与结构化合并，避免单文件过大导致内存和卡顿问题
- 架构：目标为 Tauri + Web-GUI + TypeScript core + Worker/WASM + 本地插件系统；当前 Web 应用作为核心验证底座
- 插件分发：默认跳转 GitHub Releases 进行目标下载，浏览器端和桌面端都规划下载板块与更新板块
- 测试：`npm test` 覆盖核心转换、P3 重格式增强、P4 二进制输出、快照、浏览器自检、本地安全、资源预算、插件安全和 release readiness

## 目标方向

Trans2Former 不走“依赖本地安装办公软件”的路线，不要求用户安装 Microsoft Office、LibreOffice、Pandoc、Electron 或 Playwright。转换能力优先通过 Web-GUI、TypeScript、Web Worker、WASM、Canvas、ZIP/XML 解析和本地文件 API 实现；桌面壳采用 Tauri 承载权限隔离、文件系统入口和插件管理。

产品壁垒：

- 桌面 Web-GUI 动态编辑：不仅转换，还要能编辑标准化后的文档结构。
- 实时预览：输入、结构、输出格式和 warnings 变化后尽量实时反馈。
- 上传文件大小无限制：不设置固定 MB/GB 上限，实际处理能力由用户设备和浏览器资源决定。
- 动态分块不降质：单个超大文件可拆成语义子模块转换，再结构化合并，最终结果应与直接转换语义等价。
- 行业顶尖质量：每个格式必须有样例、快照、降级说明和质量基准。
- 超广格式覆盖：长期覆盖 Office、PDF、EPUB、图片、结构化数据和政务格式。
- OFD 高保真攻坚：OFD 是政务、公文、票据场景的战略格式，目标是本地高保真和可解释质量报告。
- 热门格式免下载：基础包内置 Markdown、HTML、TXT、JSON、CSV、XML、PNG input/output、DOCX input/output、PDF input/output、JPEG output 等高频轻量格式。
- 模块插件按需下载：重格式和可选能力不默认进入核心包，用户需要时再加载对应模块，降低资源占用并提升常用路径性能。
- GitHub Releases 插件分发：应用内展示插件下载和更新入口，实际插件包默认通过 GitHub Release 页面或 release asset 获取。
- 数据绝对安全：不上传用户文件、文件名、文档片段、转换结果或错误日志；插件处理文档时禁联网。

目标格式矩阵：

- Markdown
- HTML
- TXT
- JSON
- PDF
- EPUB
- Word DOCX
- PowerPoint PPTX
- PNG
- CSV
- XML
- Excel XLSX
- OFD（战略攻坚 / 政务格式 / 本地高保真插件）

详细分阶段任务见 [DEVELOPMENT_TASKS.md](DEVELOPMENT_TASKS.md)。开发文档总目录见 [docs/README.md](docs/README.md)，产品定位见 [docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)，桌面架构和体验标准见 [docs/DESKTOP_APP_ARCHITECTURE.md](docs/DESKTOP_APP_ARCHITECTURE.md)，插件分发见 [docs/PLUGIN_DISTRIBUTION.md](docs/PLUGIN_DISTRIBUTION.md)，格式路线见 [docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)，基础格式质量说明见 [docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)，项目评估见 [docs/PROJECT_ASSESSMENT_2026-04-30.md](docs/PROJECT_ASSESSMENT_2026-04-30.md)，发布准备见 [docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)，OFD 攻坚路线见 [docs/OFD_RESEARCH.md](docs/OFD_RESEARCH.md)，动态分块合并设计见 [docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md](docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md)。

## 仓库地址

https://github.com/Vantalens/Trans2Former

## 本地运行当前版本

```bash
npm install
npm start
```

打开：

```text
http://localhost:3000
```

当前版本使用 Node.js + Express 承载静态前端页面，文档转换在浏览器端执行。后续目标是将这套 Web-GUI 和转换核心迁移进 Tauri 桌面壳。

桌面壳配置检查：

```bash
npm run desktop:check
```

安装 Rust/Cargo 和 Tauri CLI 后可运行：

```bash
npm run desktop:dev
```

浏览器端自检页：

```text
http://localhost:3000/smoke-test.html
```

## 项目结构

```text
public/              浏览器界面
public/app.js        浏览器端界面逻辑
public/browser-transformer.js 浏览器端转换门面
public/core/         DocumentModel 与 ConverterRegistry
public/core/workbench-state.js 文件队列、导出命名和工作台报告状态
public/core/document-audit.js DocumentModel 审计层
public/core/chunking.js 动态分块合并基础工具
public/core/plugin-policy.js 插件 manifest、权限和完整性策略
public/formats/      Markdown / HTML / TXT / JSON / CSV / XML / PNG / DOCX / XLSX / EPUB / PDF / PPTX / JPEG 适配器
public/workers/      浏览器端转换 Worker
samples/             当前格式样例集
tests/snapshots/     转换快照
src/web-server.js    Express 静态资源容器
src-tauri/           Tauri v2 桌面壳、CSP 和最小权限配置
```

## 开发文档

- [docs/README.md](docs/README.md)：文档总目录和维护规则
- [DEVELOPMENT_TASKS.md](DEVELOPMENT_TASKS.md)：当前任务看板
- [docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)：产品原则、市场路线和安全底线
- [docs/DESKTOP_APP_ARCHITECTURE.md](docs/DESKTOP_APP_ARCHITECTURE.md)：Tauri 桌面壳、Web-GUI、体验标准、版本控制和插件隔离架构
- [docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)：格式覆盖矩阵和新增格式准入规则
- [docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)：基础格式 before/after、保真范围和降级说明
- [docs/STRUCTURED_EDITING_MODEL.md](docs/STRUCTURED_EDITING_MODEL.md)：结构化编辑状态模型
- [docs/AI_READY_MARKDOWN.md](docs/AI_READY_MARKDOWN.md)：AI-ready Markdown 输出准则
- [docs/PROJECT_ASSESSMENT_2026-04-30.md](docs/PROJECT_ASSESSMENT_2026-04-30.md)：当前项目评估和修复记录
- [docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md)：插件安全模型、权限隔离和资源预算
- [docs/PLUGIN_DISTRIBUTION.md](docs/PLUGIN_DISTRIBUTION.md)：GitHub Releases 插件分发、下载板块和更新板块规则
- [docs/OOXML_CONTAINER.md](docs/OOXML_CONTAINER.md)：ZIP/OOXML 容器基础设施
- [docs/DOCX_INPUT_MVP.md](docs/DOCX_INPUT_MVP.md)：DOCX input 支持范围和限制
- [docs/XLSX_INPUT_MVP.md](docs/XLSX_INPUT_MVP.md)：XLSX input 支持范围和限制
- [docs/EPUB_INPUT_MVP.md](docs/EPUB_INPUT_MVP.md)：EPUB input 支持范围和限制
- [docs/PDF_TEXT_EXTRACTION_MVP.md](docs/PDF_TEXT_EXTRACTION_MVP.md)：PDF 文本提取 MVP 支持范围和限制
- [docs/PPTX_INPUT_MVP.md](docs/PPTX_INPUT_MVP.md)：PPTX input 支持范围和限制
- [docs/P4_OUTPUTS.md](docs/P4_OUTPUTS.md)：DOCX/PDF/PNG/JPEG 输出支持范围和限制
- [docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)：GitHub release 准备流程
- [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)：本地优先、零云端处理和插件隔离规则
- [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)：核心包体积与依赖预算
- [docs/OFD_RESEARCH.md](docs/OFD_RESEARCH.md)：OFD 政务格式高保真攻坚路线
- [docs/development-standards/00_README.md](docs/development-standards/00_README.md)：开发规范体系
- [docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md](docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md)：成本、资源和模块插件治理规则

## 验证

```bash
npm test
```

当前 smoke test 会验证浏览器端 `DocumentModel -> ConverterRegistry -> 格式适配器` 基础链路。

`npm test` 当前包含：

- 核心转换 smoke test
- 固定转换快照测试
- 浏览器自检静态服务检查
- 本地安全 smoke test
- 资源预算 smoke test
- 插件安全 smoke test
- Release readiness test
- Tauri desktop shell scaffold and permission boundary check

## Release 准备

```bash
npm run release:prepare
```

该命令会生成本地 `release/trans2former-2.0.0/`，用于后续 GitHub release 上传前检查。`release/` 默认不提交 GitHub。

## 资源预算

- 默认包只包含 `core + format-basic`。
- `format-basic` 内置热门轻量格式，保证常见转换无需下载即可使用。
- 基础包内置 DOCX、XLSX、EPUB、PDF、PPTX input，保证热门输入格式无需下载即可试用。
- OFD、本地 OCR、本地模型、高保真渲染和重格式增强能力必须通过模块插件按需下载或加载；OFD 属于战略攻坚格式，不属于默认核心包膨胀项。
- 插件必须声明 manifest、体积预算、依赖、安全模式、加载方式和失败降级路径。
- 插件安装可以联网下载插件代码，文档处理阶段必须禁联网。
- 插件下载默认跳转 GitHub Releases；浏览器端和桌面端必须提供下载板块和更新板块。
- `npm test` 会检查核心目录体积、默认依赖数量，并阻止重依赖进入默认核心路径。

## 数据安全

- 默认 `local-only`，文档处理在用户设备上执行。
- 产品不设置人为上传大小上限；当前文本文件入口已使用分片读取，大文件默认手动预览，后续继续推进流式解析、Worker 和渐进预览。
- 不上传文档、图片、转换结果、错误详情、文件名、文档片段或编辑内容。
- 不接入第三方转换 API、云端 OCR、云端转写、云端 AI、分析 SDK 或遥测 SDK。
- 错误详情面板复制诊断时只复制脱敏字段，不默认复制用户文档正文、title 或 stack。
- 取消转换后会终止 active Worker、撤销旧 Blob URL、清空旧输出并禁用下载入口，避免误下载上一轮结果。
- URL / YouTube extraction、云端能力和音频转写不进入主路线。

## 已知限制

1. DOCX/PDF/PNG/JPEG 输出是 P4 本地二进制基线，高保真样式、精确分页、字体嵌入和完整视觉一致性进入 P5 攻坚路线。
2. EPUB、PPTX、XLSX 输出尚未实现。
3. DOCX/XLSX/PPTX/PDF 输入仍以结构化提取为主，复杂版式、动画、公式计算、扫描 PDF 和 Office 高保真还原进入插件化增强路线。
4. OOXML/EPUB 容器暂不支持 ZIP64 和 data descriptor，超大真实样例库和性能预算进入后续增强。
5. 当前文本读取仍有内存压力，后续会逐步改造为分片/流式处理，以真正支撑超大文件。

## Community
https://linux.do/

## 许可证

MIT License - 详见 [LICENSE](LICENSE)。
