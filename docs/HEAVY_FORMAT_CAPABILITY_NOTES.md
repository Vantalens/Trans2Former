# Heavy Format Capability Notes

最后更新：2026-05-07

本文件是 P4/P6 的重格式能力说明。GUI 的格式能力来自 `public/core/format-registry.js`，这里保留人工可审查版本。

| Format | Quality | Core support | Warnings | Resource budget | Degradation path |
| --- | --- | --- | --- | --- | --- |
| DOCX | enhanced | 读取 OOXML 正文、标题、表格、链接、图片、列表、页眉页脚、脚注、批注；输出包含 styles、numbering、表格宽度和页面设置 | complex layout approximated, floating objects degraded | 50 MB input / 768 MB runtime | 修订、宏、复杂分页和浮动对象降级为结构化文本或 asset |
| XLSX | enhanced | 读取工作表文本、公式缓存、日期和合并单元格 warning；输出基础 workbook/sheet 容器 | formula cache only, merged cells approximated | 30 MB input / 512 MB runtime | 不执行公式，不还原图表、宏和复杂样式 |
| PPTX | enhanced | 读取幻灯片标题、文本框、图片、表格和备注；输出基础 presentation/slide 容器 | layout approximated, animation ignored | 80 MB input / 1024 MB runtime | 动画、母版精确布局和媒体播放降级 |
| EPUB | enhanced | 读取 OPF spine 和 XHTML 内容结构；输出基础 EPUB3 container/OPF/XHTML | CSS approximated, media referenced | 80 MB input / 768 MB runtime | 复杂 CSS、脚本、DRM 内容降级 |
| PDF | enhanced | 文本型 PDF 抽取，上传时本地解压常见 FlateDecode 文本流；程序化 PDF 输出支持分页和 link annotation 基线 | text order approximated, scan requires core OCR enhancement | 50 MB input / 1024 MB runtime | 扫描件、复杂字体编码、复杂版面和表格恢复进入核心本地增强路线 |
| PNG | basic | 图片输入进入 AssetStore；文档到 PNG 输出不公开 | input asset only | 25 MB input / 512 MB runtime | 真实视觉渲染未完成前不允许占位图像输出进入矩阵 |
| JPEG | planned | 不公开输出 | visual renderer required | 25 MB input / 512 MB runtime | 多页和真实排版渲染等待本地渲染器 |
| OFD | basic | 核心包读取 L0 container/manifest/metadata | L1 core enhancement pending, render core enhancement pending | 80 MB input / 1024 MB runtime | 页面树、文本对象、图片对象、签章和渲染进入核心本地增强路线 |

## Fixture Layers

公开样例按 `samples/fixtures/` 分层：

- `basic`：最小可读/可写样例。
- `edge`：边界结构，例如链接、metadata、复杂表格。
- `large`：大文件和渐进预览基线。
- `lossy`：必须触发 warnings 的样例。
- `security`：验证本地优先、禁联网和危险内容降级。

机器回归入口：`scripts/p4-p5-p6-test.js` 和 `scripts/conversion-capability-audit-test.js`。后者覆盖可写格式矩阵、GBK/UTF-8 中文解码、XLSX/EPUB/PPTX 容器输出和 OFD 容器 L0。
