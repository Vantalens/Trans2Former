# Conversion Paths

版本：v0.1.0  
状态：生效

## 原则

Trans2Former 区分两件事：

- **格式能力矩阵**：系统有哪些 reader / writer。
- **用户转换路径矩阵**：某个输入格式实际允许导出哪些输出格式。

前端必须按输入格式动态展示输出选项，不能把所有 writer 一次性展示给用户。程序层也必须校验路径，不能只靠前端隐藏。

## 当前路径矩阵

| 输入 | 可选输出 | 说明 |
| --- | --- | --- |
| Markdown | Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、PDF、EPUB、PPTX | 作为结构化轻量源，可导出文档、网页、表格和演示；文档到图片输出等待真实视觉渲染器。 |
| HTML | Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、PDF、EPUB、PPTX | 作为结构化轻量源，可转为常见发布和办公格式。 |
| TXT | Markdown、HTML、TXT、JSON、DOCX、PDF、EPUB | 纯文本不直接导出表格或演示，避免误导。 |
| JSON | Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、PDF、EPUB、PPTX | 仅当 JSON 可进入 DocumentModel 时适合多目标导出。 |
| CSV | Markdown、CSV、XLSX、HTML、TXT、JSON、PDF | 表格源只提供表格、网页、文本和 PDF 路径。 |
| XLSX | Markdown、CSV、XLSX、HTML、TXT、JSON、PDF | 表格源不提供 PPTX/DOCX 等不可靠跨类型输出。 |
| DOC / DOCX | Markdown、HTML、TXT、JSON、DOCX、PDF | 文档源不直接转 PPTX，避免把正文文档错误包装成演示稿。 |
| EPUB | Markdown、HTML、TXT、JSON、DOCX、PDF、EPUB | 电子书源保留文档和发布路径。 |
| PDF | Markdown、HTML、TXT、JSON、DOCX、PDF | 当前主要是文本型 PDF 抽取，不提供表格/演示高保真输出。 |
| PPTX | Markdown、HTML、TXT、JSON、PDF | 演示源可抽取为文档或导出 PDF，不做反向复杂编辑。 |
| PNG | HTML、TXT、JSON、PDF | 图片源进入资产/预览路径，OCR 和图片重渲染进入核心本地增强路线。 |
| OFD | Markdown、HTML、TXT、JSON、PDF | 核心包提供 L0 级本地解析路径，高保真继续并入核心本地增强。 |

## UI 规则

- 输入格式变化后，输出下拉框立即按路径矩阵刷新。
- 当前输出不再适用时，自动选择该输入格式的第一个可用输出。
- 维护型功能（安全中心、质量报告、DocumentModel、版本历史）默认隐藏，避免干扰主转换路径。
- 格式能力说明只展示当前输入/输出组合的简短状态，详细 warnings 和 capability note 放入高级面板或文档。

## 程序层规则

- `getAllowedOutputFormats(from)` 是前端和测试使用的唯一路径来源。
- `ConverterRegistry.convert()` 必须在读写前校验路径。
- 不支持路径统一返回 `UNSUPPORTED_CONVERSION_PATH`，未知 writer 才返回 `UNSUPPORTED_OUTPUT_FORMAT`。
- 新增格式时必须同时更新本文件、`ALLOWED_OUTPUTS_BY_INPUT`、样例和测试。
