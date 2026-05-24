# P4 Outputs

版本：v0.1.0
状态：P4 生效
最后更新：2026-05-01

P4 的目标是在不引入 Office、LibreOffice、Pandoc、云端 API 或重依赖的前提下，补齐第一批本地二进制输出能力。

## 当前支持

- DOCX output：由 `DocumentModel` 生成基础 OOXML 包，支持标题、段落、列表、表格和资源占位文本。
- PDF output：程序化生成 `.pdf` 二进制 data URL，不再依赖浏览器打印 HTML 作为 PDF 过渡方案。
- PNG/JPEG output：当前不作为公开输出格式展示；只有真实视觉渲染器能保留文档内容后才进入输出矩阵。
- 前端下载路径支持 `binary` 输出，不再把二进制 data URL 当作文本 Blob 下载。

## 当前限制

- DOCX output 是基础结构输出，不还原复杂样式、分页、页眉页脚、脚注、批注、修订和浮动布局。
- PDF output 当前使用单页文本排版，不处理复杂字体嵌入、分页控制、表格边框和图像绘制。
- 禁止用空白图、单像素图或摘要栅格冒充文档图片输出。
- OFD 已升级为 P5 战略攻坚格式，当前进入核心 L0 路线；高保真解析、渲染和质量回归通过核心本地增强推进。

## 验收

`scripts/smoke-test.js` 覆盖：

- Markdown -> DOCX，读取生成的 OOXML 包并验证 `word/document.xml`。
- Markdown -> PDF，验证 `%PDF-` 二进制头且不包含打印 HTML。
- Markdown -> PNG / JPEG 当前必须被路径策略隐藏，并由 `scripts/format-integrity-test.js` 防止重新暴露。

## 后续

- 建立真实样例库和视觉快照。
- 增强 PDF 分页、字体、表格和图片绘制。
- 增强 PNG/JPEG 文本渲染和多页策略，完成视觉回归后再开放输出。
- 研究 DOCX 高保真输出和 OFD-L0 到 OFD-L4 核心本地攻坚路线。
