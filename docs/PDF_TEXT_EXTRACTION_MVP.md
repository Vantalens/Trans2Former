# PDF Text Extraction MVP

版本：v0.1.0
状态：P3 MVP 生效
最后更新：2026-04-30

PDF text extraction MVP 只面向文本型 PDF 的基础文本提取，不承诺高保真 PDF 到 Office。

## 当前支持

- 读取简单 literal text operators。
- 提取 `Tj` / quote / double quote / `TJ` 附近的字符串。
- 输出 heading + paragraph blocks。
- 生成 `PDF_TEXT_EXTRACTION_MVP` lossy warning。

## 当前限制

- 不处理扫描 PDF。
- 不处理 OCR。
- 不还原分页、字体、图片、坐标、阅读顺序、表格结构和复杂编码。
- 不调用云端 PDF、OCR 或 AI 服务。
