# EPUB Input MVP

版本：v0.1.0
状态：P3 生效
最后更新：2026-04-30

EPUB input MVP 读取 EPUB 容器中的 OPF spine，并把 XHTML 内容转换为 `DocumentModel`。

## 当前支持

- 读取 `META-INF/container.xml`。
- 定位 OPF rootfile。
- 读取 OPF title、manifest 和 spine。
- 按 spine 顺序读取 XHTML。
- 提取 heading、paragraph、table。

## 当前限制

- 暂不处理 CSS、脚注、目录、封面、图片资源、内链重写和多语言 metadata。
- P3 支持 stored / deflate ZIP entries，但暂不支持 ZIP64 和 data descriptor。
