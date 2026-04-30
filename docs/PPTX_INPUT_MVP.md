# PPTX Input MVP

版本：v0.2.0
状态：P3 生效
最后更新：2026-04-30

PPTX input MVP 复用 ZIP/OOXML 容器基础设施，将幻灯片标题和文本框内容映射为 `DocumentModel`。

## 当前支持

- 读取 `ppt/_rels/presentation.xml.rels`。
- 定位 slide parts。
- 提取每页第一个文本框为 slide heading。
- 提取后续文本框为 paragraphs。
- 提取 slide relationship 中的图片资源，进入 `assets` 并生成 asset block。
- 图片 alt text 优先读取 `p:cNvPr descr/name`。
- 提取基础 DrawingML table，映射为 `DocumentModel` table。
- 提取 notes slide 中的 speaker notes 文本。
- Metadata 记录 notes slide count、master reference count、compression methods 和 entry count。

## 当前限制

- 母版当前只记录引用数量，不展开母版布局和继承样式。
- 暂不处理图表、动画、版式、文本样式、SmartArt 和复杂图形。
- P3 支持 stored / deflate ZIP entries，但暂不支持 ZIP64 和 data descriptor。
