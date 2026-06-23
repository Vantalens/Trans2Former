# Basic Format Quality Notes

版本：v0.1.0  
状态：P0 生效  
最后更新：2026-04-30

本文记录免下载基础格式的 before/after 样例、保真范围和可解释降级路径。基础格式包括 Markdown、HTML、TXT、JSON、CSV、XML、PNG input 和 PDF output；文档到 PNG/JPEG 的视觉输出在真实渲染器完成前不进入输出矩阵。

## 质量原则

- 所有转换必须经过 `DocumentModel`。
- 可以降级，但必须可解释，并通过 warnings 或格式能力说明暴露。
- 不设置人为上传大小上限；大文件入口优先使用分片读取、手动预览和 Worker 转换。
- 文档处理阶段不联网，不上传文件名、正文、片段、转换结果或错误详情。

## Markdown

Before:

```md
1. First
   - Nested

| A | B |
| :--- | ---: |
| left | right |

Text[^note]

[^note]: Footnote body
```

After:

- 有序列表进入 `list.ordered = true`。
- 嵌套层级进入 `list.itemMeta[].depth`。
- 表格对齐进入 `table.alignments`。
- 脚注引用进入预览 `sup`，脚注定义保留为可读引用块，并产生 `MARKDOWN_FOOTNOTE` info warning。

降级说明：P0 不承诺完整 CommonMark AST；复杂脚注、多段脚注、HTML 混排和扩展语法会以可读文本优先。

## CSV

Before:

```csv
Name,Note,Empty
"A, one","line 1
line 2",
B,"quoted ""value""",
```

After:

- BOM 自动移除。
- 引号内逗号保留为单元格内容。
- 引号内换行统一为 LF，并产生 `CSV_MULTILINE_FIELD` info warning。
- 空单元格保留为空字符串。

降级说明：P0 固定使用逗号分隔，不自动推断分号、Tab 或区域性数字格式。

## XML

Before:

```xml
<doc xmlns:ofd="urn:ofd" id="root">
  <ofd:item type="a">A</ofd:item>
</doc>
```

After:

- 原始 XML 保留为 `raw` block。
- 可读结构进入 `paragraph`。
- 根元素、命名空间和属性进入 `metadata`。
- parsererror 转为结构化 `ConversionError`，code 为 `XML_PARSE_ERROR`。
- 属性提取产生 `XML_ATTRIBUTES_EXTRACTED` info warning。

降级说明：P0 不做 DTD、schema validation、实体解析或完整 XPath 语义。

## HTML

After:

- 标题、段落、列表、引用、代码、表格和图片进入对应 blocks。
- 复杂 CSS、脚本、交互状态和布局栅格不进入基础 `DocumentModel`。

降级说明：HTML 作为内容结构输入，不作为网页还原引擎。

## TXT

After:

- 连续文本段落进入 `paragraph`。
- 纯文本不推断复杂样式。

降级说明：TXT 没有结构元数据，输出质量取决于原始换行和段落边界。

## JSON

After:

- 合法 `DocumentModel` JSON 会直接校验并进入管线。
- 普通 JSON 会格式化为 `code` block。

降级说明：普通对象不会自动推断为表格或段落，后续可在 P1/P3 增加结构化映射规则。

## PNG Input

After:

- PNG data URL 进入 `assets`，正文引用进入 `asset` block。

降级说明：P0 不做 OCR，不读取图片内文字，不调用云端视觉能力。

## PDF Output

After:

- P4 生成程序化 PDF 二进制 data URL。

降级说明：P0 不是程序化 PDF 引擎，不保证复杂分页、字体嵌入和印刷级排版。
