# OOXML Container Infrastructure

版本：v0.2.0
状态：P3 生效
最后更新：2026-04-30

本文记录 P3 的 ZIP/OOXML 容器基础设施。

## 当前能力

- 浏览器端读取 ZIP local file header。
- 支持 stored entries，也就是 compression method `0`。
- 支持 deflate entries，也就是 compression method `8`，用于常见 DOCX / XLSX / PPTX / EPUB 包。
- 发现 central directory 时校验中央目录 entry 名称与 local entries 一致。
- 拒绝路径穿越、绝对路径和 Windows drive path。
- 设置本地资源预算：entry 数量、展开体积、压缩比，降低 ZIP bomb 风险。
- 暴露 entry list、bytes 读取和 UTF-8 text 读取。
- 暴露 compression methods 和 central directory 检测结果。
- DOCX reader 基于该容器读取：
  - `word/document.xml`
  - `word/_rels/document.xml.rels`
  - `word/media/*`

## 当前限制

- P3 暂不支持 data descriptor 和 ZIP64。
- 不把 ZIP 作为用户-facing 转换格式宣传，ZIP 只作为 DOCX/PPTX/XLSX/EPUB 等容器基础设施。
- 如果遇到 unsupported compression method，会返回结构化 parse error。

## 后续任务

- 增加 ZIP64 大文件容器专项。
- 增加 data descriptor 支持。
- 扩展重复 entry、CRC32 和更细粒度资源预算策略。
- 基于真实 Office / EPUB 样例扩展快照和性能预算。
