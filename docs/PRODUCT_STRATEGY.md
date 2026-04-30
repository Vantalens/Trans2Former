# Product Strategy

版本：v0.1.0
状态：生效
最后更新：2026-04-26

## 产品定位

Trans2Former 是专业级、本地优先、零上传、多格式、高质量、可解释的格式转换处理器。核心路线不是“调用本地办公软件”或“上传到云端转换”，而是在浏览器内通过 JavaScript、Web Worker、WASM、Canvas、ZIP/XML 解析和 File API 完成尽可能多的转换。

## 不变原则

- 用户数据绝对安全：文档处理阶段本地执行，不上传、不遥测、不留存文档内容。
- 零云端处理：不提供云端文档处理、远程转换、远程 OCR、远程转写或远程 AI 增强。
- 浏览器端优先：不依赖 Microsoft Office、LibreOffice、Pandoc、Electron、Playwright 或其他本地转换软件。
- 本地化处理优先：后期 GUI/PWA/桌面外壳也必须复用 Web 核心，并保持本地优先。
- 中间模型优先：新增格式必须走 `input -> DocumentModel -> output`，避免 `N * N` 转换路线。
- 模块插件优先：核心包保持小而可用，内置热门基础格式；重格式和可选能力按用户需求下载或加载对应模块插件。
- 可验证交付：每个阶段都必须有样例、自动化测试和浏览器端 smoke test。

## 产品壁垒

- 网页端动态编辑：用户可以编辑标准化后的文档结构、块内容、表格、图片引用和输出参数。
- 实时预览：输入编辑、格式选择、转换 warnings 和输出预览尽量实时反馈。
- 上传文件大小无限制目标：不设置人为固定 MB/GB 上限；实际能力由用户设备和浏览器资源决定。
- 动态分块不降质：单个超大文件可按语义子模块转换后合并，结果必须与直接转换语义等价。
- 行业顶尖质量：格式适配器必须有样例、快照、降级说明、性能基准和人工可读质量准则。
- 超广格式覆盖：长期覆盖 Office、PDF、EPUB、图片、结构化数据和 OFD 等专业格式研究。
- 热门格式免下载：基础包必须覆盖 Markdown、HTML、TXT、JSON、CSV、XML、PNG input、PDF-print 等高频轻量格式，保证首次使用体验。
- 按需能力扩展：用户只为当前任务加载需要的重格式或可选模块，减少默认资源占用并提升常用路径性能。

## 市场切入

- 优先满足 AI/RAG 对“多格式转干净 Markdown”的需求。
- 优先服务 `Office/PDF/HTML/Data -> Markdown/HTML/JSON`。
- 高保真 PDF to DOCX/PPTX/XLSX 难度高，先做结构提取、可解释降级和 Markdown/HTML 输出。
- 隐私、本地转换、多文件批量、可解释降级、动态编辑和实时预览是浏览器端产品的差异化方向。

详细调研见 [MARKET_RESEARCH_2026-04-26.md](MARKET_RESEARCH_2026-04-26.md)。

## 数据安全底线

- 不上传文档、图片、转换结果、错误详情、文件名、文档片段或用户编辑内容。
- 不接入第三方转换 API、云端 OCR、云端转写、云端 AI、分析 SDK 或遥测 SDK。
- 错误详情面板必须区分“可复制诊断信息”和“可能包含用户内容的原始片段”。
- IndexedDB/localStorage 只能保存用户明确允许的历史、偏好和临时缓存，并提供清除入口。
- 插件安装可以联网下载代码和资源，但不得接触用户文档；文档处理阶段必须禁联网。

安全细则见 [SECURITY_POLICY.md](SECURITY_POLICY.md)。

## 资源策略

- 默认包只包含 `core + format-basic`。
- `format-basic` 必须覆盖高频轻量格式，保证常见转换无需下载即可使用。
- PDF 输入、DOCX、PPTX、XLSX、EPUB、OFD、本地 OCR、本地版面分析、本地表格恢复模型默认必须插件化或按需加载。
- 模块插件必须通过 manifest 声明格式能力、体积预算、依赖、安全模式、加载方式和失败降级路径。
- 插件下载必须由用户需求触发，不能因为支持超广格式而默认下载所有能力。
- 重格式如果要晋升为基础内置能力，必须通过资源预算、安全、本地处理和质量基准评审。
- `npm test` 必须包含资源预算和本地安全检查，防止核心包无意引入重依赖、远程 SDK、网络处理路径或过大资产。

资源预算见 [RESOURCE_BUDGET.md](RESOURCE_BUDGET.md)。
成本与资源治理见 [development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md](development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md)。
