# DocumentModel Schema

版本：v0.2.0
状态：生效  
最后更新：2026-04-30

## 目标

`DocumentModel` 是 Trans2Former 的统一中间文档模型。所有格式转换都应遵循：

```text
input format -> DocumentModel -> output format
```

## 顶层结构

```json
{
  "schemaVersion": "trans2former.document.v1",
  "title": "document",
  "sourceFormat": "md",
  "blocks": [],
  "assets": [],
  "metadata": {}
}
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | string | 是 | 当前固定为 `trans2former.document.v1`。 |
| `title` | string | 是 | 文档标题。 |
| `sourceFormat` | string | 是 | 原始输入格式，例如 `md`、`html`、`txt`、`json`、`png`。 |
| `blocks` | array | 是 | 文档正文块。 |
| `assets` | array | 是 | 图片、字体、附件等资源。 |
| `metadata` | object | 是 | 格式特有或转换过程产生的元数据。 |

## Block 类型

所有 block 都包含 P1 审计字段：

```json
{
  "id": "block-1-abcd1234",
  "sourceSpan": {
    "startLine": 1,
    "endLine": 1,
    "startOffset": 0,
    "endOffset": 7
  },
  "warnings": []
}
```

- `id`：稳定块标识，用于结构化编辑、局部预览和质量报告。
- `sourceSpan`：来源范围；无法定位时字段值为 `null`。
- `warnings`：块级 warnings。

### heading

```json
{ "type": "heading", "level": 1, "text": "Title" }
```

### paragraph

```json
{ "type": "paragraph", "text": "Paragraph text" }
```

### list

```json
{
  "type": "list",
  "ordered": false,
  "items": ["One", "Two"],
  "itemMeta": [{ "depth": 0, "marker": "-" }]
}
```

`itemMeta` 用于保留基础列表来源信息。

### code

```json
{ "type": "code", "language": "js", "code": "console.log('ok')" }
```


### table

```json
{
  "type": "table",
  "headers": ["Name", "Value"],
  "rows": [["A", "1"]],
  "alignments": ["left", "right"]
}
```

`alignments` 可选值为 `left`、`center`、`right` 或空字符串，用于保留 Markdown 表格对齐信息。

## Warnings

Warnings 同时支持文档级 `metadata.warnings` 和块级 `block.warnings`：

```json
{
  "severity": "info",
  "code": "CSV_MULTILINE_FIELD",
  "message": "CSV quoted multiline fields were normalized to LF newlines.",
  "details": {}
}
```

允许的 `severity`：

- `info`
- `lossy`
- `unsupported`
- `security`
- `performance`

`metadata.qualityReport` 会汇总 warnings 数量、按 severity 分组和降级数量。

## Conversion Metadata

```json
{
  "conversion": {
    "reader": "md",
    "writer": "html",
    "targetFormat": "html",
    "schemaVersion": "trans2former.document.v1",
    "options": {}
  }
}
```

## Quality Report

```json
{
  "qualityReport": {
    "structureFidelity": "high",
    "tableFidelity": "tracked",
    "assetFidelity": "not-applicable",
    "warningCount": 0,
    "warningsBySeverity": {},
    "downgradeCount": 0
  }
}
```

### quote

```json
{ "type": "quote", "text": "Quoted text" }
```

### image

```json
{ "type": "image", "src": "image.png", "alt": "Alt", "title": "Title" }
```

### asset

```json
{ "type": "asset", "assetId": "asset-1", "alt": "Alt", "title": "Title" }
```

### raw

```json
{ "type": "raw", "format": "html", "content": "<div>...</div>" }
```

## Asset 结构

```json
{
  "id": "asset-1",
  "name": "image.png",
  "mime": "image/png",
  "data": "data:image/png;base64,...",
  "size": 1234,
  "role": "image",
  "provenance": {
    "sourceFormat": "png",
    "fileName": "image.png",
    "sourceSpan": null,
    "role": "image"
  }
}
```

## 校验

浏览器端校验入口：

```js
import { validateDocumentModel, assertValidDocumentModel } from "./core/document-schema.js";
```

- `validateDocumentModel(model)` 返回 `{ ok, errors }`。
- `assertValidDocumentModel(model)` 在失败时抛出错误。

机器可读 JSON Schema：

```text
docs/document-model.schema.json
```
