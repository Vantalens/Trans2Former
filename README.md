# Trans2Former

Trans2Former 是一个专业级、本地优先、零上传、多格式、高质量、可解释的格式转换处理器。当前项目不再依赖 Electron，应用形态统一为浏览器 Web 应用；文档处理阶段必须本地执行，不提供云端文档处理、远程转换、远程 OCR、远程转写或远程 AI 增强。后期将通过模块化插件设计，基础热门格式免下载可用，重格式和可选能力按需下载或加载。

## 当前状态

- 项目名：Trans2Former
- 包名：`trans2former`
- 当前可用输入：Markdown、HTML、TXT、JSON、CSV、XML、PNG、DOCX/XLSX/EPUB/PDF/PPTX input
- 当前可用输出：Markdown、HTML、TXT、JSON、CSV、XML、PDF-print
- Electron：已移除
- Playwright：已从运行依赖移除
- CLI：已从当前运行形态移除，项目收敛为浏览器 Web 应用
- PDF：当前通过浏览器打印/另存为 PDF 完成
- 数据安全：文档处理阶段 `local-only`，不提供云端文档处理
- 前端体验：专业三栏工作台，包含 local-only 顶部工具栏、输入、标准化预览和输出面板
- 交互状态：支持结构化错误详情、脱敏诊断复制、阶段化转换进度和取消后输出清理
- 文件大小：不设置人为上传大小上限；文本文件入口已使用分片读取，大文件默认手动预览以减少卡顿
- 基础格式质量：Markdown、CSV、XML 已补齐 P0 高风险语法路径和可解释 warnings
- 质量审计：P1 已补齐 block id、source span、block warnings、asset provenance、conversion metadata、quality report 和 chunked equivalence 基线
- 插件安全：P2 已建立 plugin manifest、权限模型、安装/处理隔离、processing no-network、完整性校验和插件资源预算
- P3 进展：已完成 ZIP/OOXML 容器、DOCX、XLSX、EPUB、PDF text extraction、PPTX input；包含 deflate、central directory 校验和 Office 增强提取路径
- 发布准备：可运行 `npm run release:prepare` 生成本地 `release/trans2former-2.0.0/` 发布包
- 超大文件策略：规划动态分块转换与结构化合并，避免单文件过大导致内存和卡顿问题
- 架构：采用模块化插件设计，基础热门格式免下载可用，重格式/可选能力按需下载或加载
- 测试：`npm test` 覆盖核心转换、P3 重格式增强、快照、浏览器自检、本地安全、资源预算、插件安全和 release readiness

## 目标方向

Trans2Former 不走“依赖本地安装办公软件”的路线，不要求用户安装 Microsoft Office、LibreOffice、Pandoc、Electron 或 Playwright。转换能力优先通过浏览器端 JavaScript、Web Worker、WASM、Canvas、ZIP/XML 解析和文件 API 实现，必要时只使用可在浏览器运行的轻量前端依赖。

产品壁垒：

- 网页端动态编辑：不仅转换，还要能编辑标准化后的文档结构。
- 实时预览：输入、结构、输出格式和 warnings 变化后尽量实时反馈。
- 上传文件大小无限制：不设置固定 MB/GB 上限，实际处理能力由用户设备和浏览器资源决定。
- 动态分块不降质：单个超大文件可拆成语义子模块转换，再结构化合并，最终结果应与直接转换语义等价。
- 行业顶尖质量：每个格式必须有样例、快照、降级说明和质量基准。
- 超广格式覆盖：长期覆盖 Office、PDF、EPUB、图片、结构化数据和政务格式研究。
- 热门格式免下载：基础包内置 Markdown、HTML、TXT、JSON、CSV、XML、PNG input、PDF-print 等高频轻量格式。
- 模块插件按需下载：重格式和可选能力不默认进入核心包，用户需要时再加载对应模块，降低资源占用并提升常用路径性能。
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
- OFD（远期研究 / 政务格式 / P4+）

详细分阶段任务见 [DEVELOPMENT_TASKS.md](DEVELOPMENT_TASKS.md)。开发文档总目录见 [docs/README.md](docs/README.md)，产品定位见 [docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)，格式路线见 [docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)，基础格式质量说明见 [docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)，项目评估见 [docs/PROJECT_ASSESSMENT_2026-04-30.md](docs/PROJECT_ASSESSMENT_2026-04-30.md)，发布准备见 [docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)，OFD 研究见 [docs/OFD_RESEARCH.md](docs/OFD_RESEARCH.md)，动态分块合并设计见 [docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md](docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md)。

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

当前版本使用 Node.js + Express 承载静态前端页面，文档转换在浏览器端执行。后续目标是进一步收敛为可静态部署的 Web 应用。

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
public/core/document-audit.js DocumentModel 审计层
public/core/chunking.js 动态分块合并基础工具
public/core/plugin-policy.js 插件 manifest、权限和完整性策略
public/formats/      Markdown / HTML / TXT / JSON / CSV / XML / PNG / DOCX / XLSX / EPUB / PDF / PPTX / PDF-print 适配器
public/workers/      浏览器端转换 Worker
samples/             当前格式样例集
tests/snapshots/     转换快照
src/web-server.js    Express 静态资源容器
```

## 开发文档

- [docs/README.md](docs/README.md)：文档总目录和维护规则
- [DEVELOPMENT_TASKS.md](DEVELOPMENT_TASKS.md)：当前任务看板
- [docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)：产品原则、市场路线和安全底线
- [docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)：格式覆盖矩阵和新增格式准入规则
- [docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)：基础格式 before/after、保真范围和降级说明
- [docs/STRUCTURED_EDITING_MODEL.md](docs/STRUCTURED_EDITING_MODEL.md)：结构化编辑状态模型
- [docs/AI_READY_MARKDOWN.md](docs/AI_READY_MARKDOWN.md)：AI-ready Markdown 输出准则
- [docs/PROJECT_ASSESSMENT_2026-04-30.md](docs/PROJECT_ASSESSMENT_2026-04-30.md)：当前项目评估和修复记录
- [docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md)：插件安全模型、权限隔离和资源预算
- [docs/OOXML_CONTAINER.md](docs/OOXML_CONTAINER.md)：ZIP/OOXML 容器基础设施
- [docs/DOCX_INPUT_MVP.md](docs/DOCX_INPUT_MVP.md)：DOCX input 支持范围和限制
- [docs/XLSX_INPUT_MVP.md](docs/XLSX_INPUT_MVP.md)：XLSX input 支持范围和限制
- [docs/EPUB_INPUT_MVP.md](docs/EPUB_INPUT_MVP.md)：EPUB input 支持范围和限制
- [docs/PDF_TEXT_EXTRACTION_MVP.md](docs/PDF_TEXT_EXTRACTION_MVP.md)：PDF 文本提取 MVP 支持范围和限制
- [docs/PPTX_INPUT_MVP.md](docs/PPTX_INPUT_MVP.md)：PPTX input 支持范围和限制
- [docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)：GitHub release 准备流程
- [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)：本地优先、零云端处理和插件隔离规则
- [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)：核心包体积与依赖预算
- [docs/OFD_RESEARCH.md](docs/OFD_RESEARCH.md)：OFD 远期政务格式研究
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

## Release 准备

```bash
npm run release:prepare
```

该命令会生成本地 `release/trans2former-2.0.0/`，用于后续 GitHub release 上传前检查。`release/` 默认不提交 GitHub。

## 资源预算

- 默认包只包含 `core + format-basic`。
- `format-basic` 内置热门轻量格式，保证常见转换无需下载即可使用。
- 基础包内置 DOCX、XLSX、EPUB、PDF、PPTX input，保证热门输入格式无需下载即可试用。
- OFD、本地 OCR、本地模型、高保真渲染和重格式增强能力必须通过模块插件按需下载或加载。
- 插件必须声明 manifest、体积预算、依赖、安全模式、加载方式和失败降级路径。
- 插件安装可以联网下载插件代码，文档处理阶段必须禁联网。
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

1. PDF 当前使用浏览器打印/另存为 PDF，不是程序化生成 `.pdf` 二进制文件。
2. EPUB、DOCX、PPTX、PNG 输出尚未实现。
3. DOCX/XLSX/PPTX/PDF 输入仍以结构化提取为主，不承诺复杂版式、动画、公式计算、扫描 PDF 或 Office 高保真还原。
4. OOXML/EPUB 容器暂不支持 ZIP64 和 data descriptor，超大真实样例库和性能预算进入 P4。
5. 当前文本读取仍有内存压力，后续会逐步改造为分片/流式处理，以真正支撑超大文件。

## Community
https://linux.do/

## 许可证

MIT License - 详见 [LICENSE](LICENSE)。
