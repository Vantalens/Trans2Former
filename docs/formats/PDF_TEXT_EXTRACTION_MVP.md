# PDF Text Extraction MVP

版本：v0.1.0
状态：P3 MVP 生效
最后更新：2026-05-09

PDF text extraction MVP 只面向文本型 PDF 的基础文本提取，不承诺高保真 PDF 到 Office。

## 当前支持

- PDF 输入优先使用本地 vendored PDF.js 引擎抽取 `getTextContent()` 文本；浏览器端从 `/vendor/pdfjs/` 加载，Node 测试/桌面准备路径从 optional `pdfjs-dist` 加载。
- 读取简单 literal text operators。
- 提取 `Tj` / quote / double quote / `TJ` 附近的 literal string 和 hex string。
- 上传 PDF 时本地解压常见 `/FlateDecode` 内容流，再抽取其中的 `BT...ET` 文本对象。
- 保留并解析解压后的 ToUnicode CMap，支持常见 CID -> Unicode 映射，用于中文 PDF 的 `<hex> Tj/TJ` 文本恢复。
- PDF.js 失败时才回落到核心轻量解析器；回落解析中的 ToUnicode CMap 必须尽量按当前 `/F... Tf` 字体绑定，多 CMap 无法绑定时不输出猜测文本，避免错误识别污染转换结果。
- 输出 heading + paragraph blocks。
- 生成 `PDF_TEXT_EXTRACTION_MVP` lossy warning。

## 当前限制

- 不处理扫描 PDF。
- 不处理 OCR。
- 不还原字体、图片、坐标、表格结构和复杂版面；PDF.js 文本顺序以 PDF 引擎返回的 text content 为准。
- 不承诺所有字体子集、自定义 CMap、坐标重排或图形化文字都能恢复为可编辑文本。
- 不调用云端 PDF、OCR 或 AI 服务。
