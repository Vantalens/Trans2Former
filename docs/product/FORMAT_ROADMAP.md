# Format Roadmap

版本：v0.6.2
状态：生效
最后更新：2026-10-22

## 当前格式矩阵

| 格式 | 输入 | 输出 | 当前状态 | 下一步 |
| --- | --- | --- | --- | --- |
| Markdown | [x] | [x] | 支持标题、段落、列表、引用、代码、图片、表格 | 补 AI-ready Markdown 输出准则、脚注、高级内联、更多 round-trip 测试 |
| HTML | [x] | [x] | DOMParser 安全抽取，输出自包含 HTML | 扩展复杂表格/链接/图片降级测试，补 HTML -> Markdown 市场样例 |
| TXT | [x] | [x] | 支持段落、空行、简单标题推断 | 增加大文本性能测试 |
| JSON | [x] | [x] | 输出 Trans2Former DocumentModel JSON；schema 校验已接入 | 继续保持 schema 与运行时校验同步 |
| CSV | [x] | [x] | 第一行表头映射为 table block | 增加引号、换行、逗号、BOM 边界样例 |
| XML | [x] | [x] | raw XML + 可读文本结构；标准 XML 输出 | 完善命名空间、属性、嵌套结构映射 |
| YAML | [x] | [x] | 确定性缩进解析：映射/列表/标量/嵌套进入键值表；锚点、别名、标签、多文档降级为 warning | 评估 anchors/merge key 的安全展开策略 |
| TOML | [x] | [x] | 段/键值/数组/内联表/数组表进入键值表；多行字符串尽力解析并披露 | 评估异构数组与日期时间的类型保持 |
| IPYNB | [x] | [x] | nbformat 4.x：markdown/code cell 映射，文本输出附带；写出合法 nbformat 4.5 | 评估 execute_result 富输出（图片）与 cell metadata 保留 |
| RTF | [x] | [ ] | 只读：纯文本与段落提取（\par、\'xx、\uN），字体表/图片组跳过 | RTF 写出复杂度高，暂不承诺；先补真实样例回归 |
| LaTeX | [x] | [x] | 基础级：\section 族→标题、itemize/enumerate→列表、verbatim→代码、数学环境原样保留；写出 article 骨架 | 评估浮动体（figure/table）、宏展开与 bib 支持 |
| PNG | [x] | [ ] | 输入进入 AssetStore；未达标的占位输出已隐藏 | 真实文本渲染、多页和视觉快照完成后再开放输出 |
| PDF | [x] | [x] | P3 文本提取 + P4 程序化 PDF 二进制输出 | 后续增强文本顺序、编码、表格、图片和扫描 PDF 核心 OCR |
| DOCX | [x] | [x] | P3 input + P4 基础 OOXML output | P4+ 研究复杂样式、图片尺寸、修订和高保真输出 |
| PPTX | [x] | [x] | P3 input + 定向 output：输入解析支持幻灯片标题、文本框、图片、表格、备注、母版引用、alt text；输出只对 Markdown/HTML/JSON 等演示素材源开放 | 后续研究图表、动画、版式和高保真输出，成熟前不对 DOCX 等正文文档源开放 |
| XLSX | [x] | [x] | P3 input + 基础 XLSX output：工作表、共享字符串、基础表格、公式保留、日期格式、合并单元格 warning | 后续研究完整样式、图表、批注和公式计算 |
| EPUB | [x] | [x] | P3 input + 基础 EPUB output：OPF spine + XHTML heading/paragraph/table | 后续增强目录、图片、CSS、内链和 metadata |
| JPEG | [x] | [ ] | 输入进入 AssetStore；OCR 走核心内置路线；不暴露占位输出 | 真实文本渲染与视觉快照达标后再评估输出 |
| WebP | [x] | [ ] | 输入进入 AssetStore；OCR 走核心内置路线；不暴露占位输出 | 同上 |
| SVG | [x] | [ ] | 文本格式输入：`<text>` 元素提取 + 原图进入 AssetStore；OCR 需浏览器栅格化，核心包跳过并披露 SVG_RASTERIZE_UNSUPPORTED | 评估浏览器栅格化管线后接入 OCR |
| ODT | [x] | [x] | 基础级：content.xml 标题/段落/列表/表格读取，自动样式粗斜体尽力映射；写出合法最小骨架（mimetype 不压缩首位） | 评估 styles.xml 命名样式、页眉页脚与图片导入 |
| OFD | [x] | [ ] | L0 核心容器/metadata 读取，战略攻坚 | 中国政务、公文、票据格式；核心本地高保真路线 |

说明：`[~]` 表示已有过渡方案，但不是最终程序化输出能力。

## 基础包免下载格式

`format-basic` 必须覆盖热门、轻量、高频格式，让用户首次打开即可完成常见转换。当前基础免下载能力包括：

- Markdown
- HTML
- TXT
- JSON
- CSV
- XML
- YAML / TOML / IPYNB / LaTeX（读写，基础级）
- RTF（只读）
- ODT（读写，基础级）
- PNG / JPEG / WebP / SVG input
- DOCX / XLSX / EPUB / PDF / PPTX input
- DOCX / XLSX / EPUB / PPTX / PDF / ODT output

DOCX、PPTX、XLSX、PDF input、EPUB 已作为热门输入能力进入基础包；DOCX/XLSX/EPUB/PPTX/PDF/ODT 输出已建立本地基线。YAML/TOML/IPYNB/LaTeX/RTF 为轻量文本格式，无重依赖，直接进入基础包（RTF 暂不实现写出）。ODT 复用既有 ZIP 容器基础设施，零新增依赖，以基础级读写进入基础包。JPEG/WebP/SVG 复用 PNG 的图片资产输入路线，同样零新增依赖；SVG 为文本格式并提取 `<text>` 元素，OCR 需浏览器栅格化、核心包跳过并披露。前端按输入格式筛选输出，PPTX 不对 DOCX 等正文文档源开放，PNG/JPEG 视觉渲染未达标前不进入输出矩阵。高保真渲染、OCR、本地模型、OFD 和更重的格式增强进入核心本地按需加载路线。OFD 是战略攻坚格式，当前只暴露核心 L0 基线。

## 容器基础设施

ZIP 不作为用户-facing 转换格式宣传，但必须作为底层基础设施支持：

- DOCX 解包/打包
- PPTX 解包/打包
- XLSX 解包/打包
- EPUB 解包/打包
- 批量导出打包
- Release 打包校验

## 优化后的执行顺序

1. P4：先做架构收敛和质量基线，不继续扩格式。
2. P4：为当前基础包格式补 capability note、公开样例、快照、warnings 和资源预算说明。
3. P4：补 Asset lazy-load、ZIP64/超大 OOXML 和复杂文档质量回归。
4. P5：建立核心重能力执行容器，验证启用、禁用、回滚、崩溃隔离和 processing no-network。
5. P5：把高保真增强、本地 OCR/layout/table 和 OFD 承载到核心本地按需加载模块，不进入首屏启动路径。
6. P6：推进高保真 DOCX/PDF 和文档到 PNG/JPEG 视觉输出，必须有视觉或结构回归。
7. P6：攻坚 OFD 等政务/专业格式，按 OFD-L0 到 OFD-L4 建立样例、DocumentModel 提取、本地渲染、高保真专项和质量回归。
8. P7：桌面发布产品化，区分 Web preview、desktop dev build 和 desktop installer。

## 新增格式准入规则

- 必须声明 reader、writer、warnings、capability note 和样例覆盖。
- 必须声明输入到输出的产品路径，不能仅因为 writer 存在就向所有输入开放。
- 必须声明能力层级：`format-basic` 或核心重能力。
- 必须优先接入 `DocumentModel`，不得默认新增格式间私有直连。
- 重依赖必须放入核心按需加载模块，不能进入默认 dependencies。
- 核心重能力必须声明体积、依赖、安全模式、加载方式和失败降级路径。
- 申请进入 `format-basic` 的热门格式必须额外说明使用频率、体积影响、依赖影响和免下载体验收益。
- 涉及用户内容、缓存、核心重能力或诊断信息时，必须同步更新安全策略。

## 删除或降级路线

- URL / YouTube URL：删除，不属于文件格式，且必然联网。
- Audio / Transcription：从主路线删除；本地语音转写不属于核心转换器。
- ZIP：降级为容器基础设施，不作为转换格式宣传。
- OCR：只保留核心本地路线，不做云端 OCR，不进首屏启动路径。
- OFD：升级为 P5 战略攻坚格式，通过核心本地模块推进高保真解析、渲染和质量回归。

## 变更记录

- v0.6.2：ODT 读写（基础级，复用 ZIP 容器基础设施，零新增依赖）与 JPEG/WebP/SVG 只读输入进入支持矩阵；JPEG/WebP 走 PNG 同款图片资产 + 核心 OCR 路线，SVG 作为文本格式提取 `<text>` 元素、OCR 需栅格化而跳过并披露。
- v0.6.1：YAML/TOML/IPYNB/LaTeX 读写与 RTF 只读进入支持矩阵（基础级，零新增依赖）；RTF 写出因复杂度暂不实现，矩阵只声明可达路径。
- v0.6.0：取消插件安装路线，OFD/OCR/layout/table 等增强改为核心本地模块。
- v0.5.0：将后续路线从继续扩格式调整为 P4 质量基线、P5 真实插件加载器、P6 高保真/OFD、P7 桌面发布。
- v0.4.0：将 OFD 升级为 P5 战略攻坚格式，明确本地高保真插件路线。
- v0.2.0：删除 URL/YouTube/Audio 主线；ZIP 降级为容器基础设施；新增 OFD 政务格式研究路线。
- v0.3.0：P3 输入能力完成，DOCX/XLSX/PPTX/EPUB/PDF input 进入基础包，重格式增强和高保真输出进入 P4。
- v0.1.0：建立格式矩阵、基础包和插件准入规则。
