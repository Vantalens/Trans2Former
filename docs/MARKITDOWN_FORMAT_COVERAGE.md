# MarkItDown Format Coverage Target

版本：v0.1.0  
状态：规划中  
最后更新：2026-04-25

目标：MarkItDown README 中提到的文件格式用于参考，但 Trans2Former 不照搬 URL、音频转写或云端能力。实现必须保持桌面 Web-GUI、本地优先、零上传路线，不直接引入 Python、本地 Office、LibreOffice、Pandoc、Electron 或 Playwright。

| MarkItDown 提到的格式 | Trans2Former 目标 | 当前状态 | 浏览器端策略 |
| --- | --- | --- | --- |
| PDF | 输入/输出 | 已支持文本型 PDF 输入和程序化 PDF 输出基线 | 后续评估文本顺序、表格、图片和核心 OCR 增强 |
| PowerPoint | PPTX 输入/输出 | 未做 | 解析/生成 OOXML ZIP；借鉴 PresentationModel/schema 思路 |
| Word | DOCX 输入/输出 | 未做 | 解析/生成 OOXML ZIP；正文结构进入 DocumentModel |
| Excel | XLSX/CSV 输入/输出 | CSV 已支持；XLSX 未做 | CSV 走 table block；XLSX 后续解析 OOXML ZIP |
| Images | PNG 输入，更多图片格式后续 | PNG 输入已做 | 图片进入 AssetStore；OCR 作为可选后续能力 |
| Audio | 从主路线删除 | 不做 | 音频转写偏 AI 产品，云端转写违反定位，本地转写资源重且不属于核心转换器 |
| HTML | 输入/输出 | 已支持 | DOMParser + 安全降级 |
| Text | TXT/Markdown/JSON/XML/CSV | TXT/MD/JSON/XML/CSV 已支持 | text-based formats 走浏览器解析器 |
| CSV | 输入/输出 | 已支持 | 第一行表头 -> table block |
| JSON | 输入/输出 | 已支持 | DocumentModel JSON schema |
| XML | 输入/输出 | 已支持基础版 | raw XML + 可读文本/标准 XML 输出 |
| ZIP | 容器基础设施 | 未做 | 不作为用户-facing 转换格式；用于 OOXML、EPUB、批量导出和插件包 |
| YouTube URLs | 删除 | 不做 | URL 不是文件格式，且必然联网，与零上传、本地处理定位冲突 |
| EPUB | 输入/输出 | 未做 | EPUB 是 ZIP + OPF + XHTML，优先级较高 |

## 实施优先级

1. Text-based formats：Markdown、HTML、TXT、JSON、CSV、XML。
2. Image formats：PNG 输入已做；文档到 PNG/JPEG 输出必须等待真实视觉渲染器，不能以占位图进入输出矩阵。
3. ZIP/OOXML 容器基础设施：只作为底层能力。
4. EPUB：浏览器端 ZIP/XML/XHTML 解析。
5. Office Open XML：DOCX、XLSX、PPTX。
6. PDF：先文本型 PDF 提取，再评估程序化输出。
7. OFD：P5 政务、公文、票据场景战略攻坚格式。
8. Audio/YouTube：删除，不进入主路线。
