# Format Roadmap

版本：v0.2.0
状态：生效
最后更新：2026-04-30

## 当前格式矩阵

| 格式 | 输入 | 输出 | 当前状态 | 下一步 |
| --- | --- | --- | --- | --- |
| Markdown | [x] | [x] | 支持标题、段落、列表、引用、代码、图片、表格 | 补 AI-ready Markdown 输出准则、脚注、高级内联、更多 round-trip 测试 |
| HTML | [x] | [x] | DOMParser 安全抽取，输出自包含 HTML | 扩展复杂表格/链接/图片降级测试，补 HTML -> Markdown 市场样例 |
| TXT | [x] | [x] | 支持段落、空行、简单标题推断 | 增加大文本性能测试 |
| JSON | [x] | [x] | 输出 Trans2Former DocumentModel JSON；schema 校验已接入 | 继续保持 schema 与运行时校验同步 |
| CSV | [x] | [x] | 第一行表头映射为 table block | 增加引号、换行、逗号、BOM 边界样例 |
| XML | [x] | [x] | raw XML + 可读文本结构；标准 XML 输出 | 完善命名空间、属性、嵌套结构映射 |
| PNG | [x] | [ ] | 输入进入 AssetStore，可转 HTML/MD/JSON/TXT/PDF-print | Canvas PNG 输出、多页/长图策略 |
| PDF | [ ] | [~] | 当前输出为浏览器打印/另存 PDF | 先做文本型 PDF -> Markdown/HTML 评估，不承诺高保真 PDF -> Office |
| DOCX | [ ] | [ ] | 未做 | 市场优先级最高；先做输入到 Markdown/HTML/JSON，再做基础 DOCX 输出 |
| PPTX | [ ] | [ ] | 未做 | 市场优先级高；先做输入到 Markdown/HTML/JSON，输出前设计 `PresentationModel` |
| XLSX | [ ] | [ ] | 未做 | 市场优先级高；先做多工作表到 Markdown/CSV/JSON |
| EPUB | [ ] | [ ] | 未做 | ZIP + OPF + XHTML 解析，优先输出 Markdown/HTML/JSON |
| JPEG/WebP/SVG | [ ] | [ ] | 未做 | 扩展 AssetStore 图片输入与输出策略，OCR 作为可选能力 |
| RTF/ODT | [ ] | [ ] | 未做 | 进入评估矩阵，默认不得引入重依赖 |
| YAML/TOML/IPYNB/LaTeX | [ ] | [ ] | 未做 | 进入数据/技术文档格式评估矩阵 |
| OFD | [ ] | [ ] | 远期研究 | 中国政务文档格式；P4+ 研究，不进近期路线 |

说明：`[~]` 表示已有过渡方案，但不是最终程序化输出能力。

## 基础包免下载格式

`format-basic` 必须覆盖热门、轻量、高频格式，让用户首次打开即可完成常见转换。当前基础免下载能力包括：

- Markdown
- HTML
- TXT
- JSON
- CSV
- XML
- PNG input
- PDF-print

DOCX、PPTX、XLSX、PDF input、EPUB 等热门但重的格式，先以 `format-plugin` 进入；只有通过体积、安全、本地化和质量评审后，才允许评估是否晋升为基础能力。

## 容器基础设施

ZIP 不作为用户-facing 转换格式宣传，但必须作为底层基础设施支持：

- DOCX 解包/打包
- PPTX 解包/打包
- XLSX 解包/打包
- EPUB 解包/打包
- 批量导出打包
- 插件包分发

## 建议执行顺序

1. 稳定当前 7 种输入、7 种输出的样例、快照、错误和 warnings。
2. 迁移预览渲染到 Worker 或 idle callback，减少大文档 UI 阻塞。
3. 建立大文件入口策略：分片读取、流式解析、渐进预览、资源释放和可解释错误。
4. 建立动态分块转换与合并算法，并补直接转换 vs 分块转换等价测试。
5. 建立格式插件 manifest、按需下载、缓存和失败降级策略，避免核心包膨胀。
6. 建立插件注册、能力发现和资源预算测试，确保新增格式不会进入默认核心路径。
7. 补 AI-ready Markdown 输出准则、warnings 和质量评分维度。
8. 进入 ZIP/OOXML 容器基础设施，优先以 `format-plugin` 做 DOCX/PPTX/XLSX 输入到 Markdown/HTML/JSON。
9. 做 EPUB 和文本型 PDF 评估；扫描 PDF / 图片 OCR 只保留本地插件接口，不承诺近期实现。
10. P4+ 研究 OFD 等政务/专业格式，先做可行性、样例和高保真风险评估。

## 新增格式准入规则

- 必须声明 reader、writer、warnings、capability note 和样例覆盖。
- 必须声明插件层级：`format-basic`、`format-plugin` 或 `optional-plugin`。
- 必须优先接入 `DocumentModel`，不得默认新增格式间私有直连。
- 重依赖必须放入按需下载模块插件，不能进入默认 dependencies。
- 插件必须提供 manifest，声明体积、依赖、安全模式、加载方式和失败降级路径。
- 申请进入 `format-basic` 的热门格式必须额外说明使用频率、体积影响、依赖影响和免下载体验收益。
- 涉及用户内容、缓存、插件下载或诊断信息时，必须同步更新安全策略。

## 删除或降级路线

- URL / YouTube URL：删除，不属于文件格式，且必然联网。
- Audio / Transcription：从主路线删除；本地语音转写不属于核心转换器。
- ZIP：降级为容器基础设施，不作为转换格式宣传。
- OCR：只保留本地插件接口，不做云端 OCR，不进近期核心路线。
- OFD：保留为 P4+ 政务格式研究，不进近期实现。

## 变更记录

- v0.2.0：删除 URL/YouTube/Audio 主线；ZIP 降级为容器基础设施；新增 OFD P4+ 研究路线。
- v0.1.0：建立格式矩阵、基础包和插件准入规则。
