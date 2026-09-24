# PDF Text Extraction MVP

版本：v0.1.0
状态：P3 MVP 生效
最后更新：2026-09-24

PDF text extraction MVP 只面向文本型 PDF 的基础文本提取，不承诺高保真 PDF 到 Office。

## 当前支持

- PDF 输入优先使用本地 vendored PDF.js 引擎抽取 `getTextContent()` 文本；浏览器端从 `/vendor/pdfjs/` 加载，Node 测试/桌面准备路径从 optional `pdfjs-dist` 加载。
- 读取简单 literal text operators。
- 提取 `Tj` / quote / double quote / `TJ` 附近的 literal string 和 hex string。
- 上传 PDF 时本地解压常见 `/FlateDecode` 内容流，再抽取其中的 `BT...ET` 文本对象。
- 保留并解析解压后的 ToUnicode CMap，支持常见 CID -> Unicode 映射，用于中文 PDF 的 `<hex> Tj/TJ` 文本恢复。
- PDF.js 失败时才回落到核心轻量解析器；回落解析中的 ToUnicode CMap 必须尽量按当前 `/F... Tf` 字体绑定，多 CMap 无法绑定时不输出猜测文本，避免错误识别污染转换结果。
- Node 环境使用本地文件路径加载 CMap 与标准字体；PDF.js 提取完成后销毁 loading task，清理失败不丢弃已提取页面。
- 没有可信正文时，`DocumentModel` 保留空正文与结构化 warning；工作台用 PDF.js 逐页渲染原 PDF，并提供 Blob 下载链接。转换成可编辑输出时若 OCR 后仍无正文，返回 `PDF_TEXT_UNAVAILABLE` 或 `PDF_ENCRYPTED`，不把提示语写入输出。
- 工作台的 PDF 输出预览也由本地 PDF.js 逐页渲染；生成文件的下载链接独立保留，不依赖浏览器或桌面 WebView 的内嵌 PDF 查看器。
- `PDF → PDF` 通过模型路由审计后直接复制原 PDF 字节，保留原图像、字体和版面；此路径不执行 OCR，也不添加可检索文字层，结果给出 `PDF_ORIGINAL_PRESERVED` 提示。
- 自动 OCR 仅在未提取到可信文本时触发；稀疏文本 PDF 标记为 `sparse-text-pdf`，避免把表单字段再次 OCR 后重复或重排。
- 混合文本页和无文字页时保留全部页号；无文字页写入 `metadata.pdf.pagesWithoutText`，并发出 `PDF_PAGES_WITHOUT_TEXT` warning。异步转换且本地 OCR 可用时只识别无文字页，再按原页号插入正文，避免重复识别已有文本页。
- 仍未识别到文字的页面进入 `qualityReport.unresolvedPdfPages`；工作台显示具体页号和 warning 内容，并将完成状态标为警告。关闭 Repair 时，核心 API 仍通过输出的 `unresolvedPdfPages` 与 `warnings` 返回同一风险。
- OCR 坐标在固定布局模型内按来源页尺寸从栅格像素映射回 PDF 点位；重绘型 PDF writer 仍不能恢复原图像和图形，无文字来源页会发出 `PDF_HF_PAGE_VISUALS_UNVERIFIED`。同格式 PDF 路由使用上述原件复制路径。
- 输出 heading + paragraph blocks。
- 按实际水平坐标推断英文片段间的空格；重复双栏页面按左栏后右栏的顺序恢复，避免仅凭字母/数字相邻插入空格。
- 生成 `PDF_TEXT_EXTRACTION_MVP` lossy warning。

## 当前限制

- 扫描 PDF 的文字提取依赖独立的本地 OCR 阶段及可用模型；未识别到正文时不得视为转换成功。
- 无文字页可能本身为空白；若 OCR 不可用、被关闭或识别失败，warning 仍表示该页的可编辑内容未得到确认。同步转换不执行 OCR。
- 扫描 PDF 默认处理全部页面；只有明确设置 `options.ocr.maxScanPages` 才截断并发出 `OCR_SCAN_PAGES_TRUNCATED`。
- 不还原完整字体、图片、坐标、表格结构和复杂版面；PDF 多栏检测是启发式处理，跨栏标题/特殊阅读顺序仍可能降级。
- 不承诺所有字体子集、自定义 CMap、坐标重排或图形化文字都能恢复为可编辑文本。
- 不调用云端 PDF、OCR 或 AI 服务。
