# DOCX Input MVP

版本：v0.2.0
状态：P3 生效
最后更新：2026-04-30

DOCX input MVP 的目标是把 Word 文档本地解析为 `DocumentModel`，优先输出 Markdown / HTML / JSON。

## 当前支持

- 标题：识别 `w:pStyle` 中的 `Heading1` 到 `Heading6`。
- 段落：合并 `w:t` 文本。
- 链接：解析 `word/_rels/document.xml.rels` 中的 external hyperlink，并追加到可读文本。
- 表格：第一行作为 headers，其余行作为 rows。
- 图片引用：解析 `a:blip r:embed`，读取 `word/media/*`，进入 `assets` 并生成 asset block。
- 列表：识别 `w:numPr`，映射为 `DocumentModel` list，保留层级 metadata。
- 页眉页脚：读取 header/footer relationship 中的可读文本。
- 脚注和批注：读取 `word/footnotes.xml`、`word/comments.xml` 并以可解释段落保留。
- 合并单元格：当前扁平化为 table，并输出 `DOCX_TABLE_MERGE_APPROXIMATED` warning。
- 图片 alt text：优先读取 `wp:docPr descr/title`。
- Metadata：记录 OOXML entry 数量、relationship 数量、document part 和文件名。

## 当前限制

- P3 支持 stored / deflate ZIP entries，但暂不支持 ZIP64 和 data descriptor。
- 不还原复杂 Word 样式、分页、修订、文本框、公式和浮动布局。
- 图片尺寸、精确编号样式和复杂表格布局属于 P4 高保真增强。

## 安全边界

- DOCX 在浏览器端本地读取，不上传文档。
- 不执行宏，不解析外部资源，不联网加载关系 target。
- 外部链接只作为文本 metadata/可读引用保留。

## 验收

`scripts/smoke-test.js` 覆盖最小 DOCX fixture：

- ZIP/OOXML entry 读取
- DOCX -> DocumentModel
- DOCX -> Markdown
- DOCX -> HTML
- DOCX -> JSON
- DOCX 列表、页眉页脚、脚注、批注、合并单元格 warning 和图片 alt text
