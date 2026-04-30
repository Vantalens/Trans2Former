# Structured Editing Model

版本：v0.1.0
状态：P1 设计生效
最后更新：2026-04-30

本文定义网页端动态编辑的 P1 状态模型。P1 不实现完整 GUI 编辑器，但先固定后续编辑器必须依赖的状态边界。

## 编辑状态

```json
{
  "documentId": "doc-current",
  "selectedBlockId": "block-1-abcd1234",
  "activePanel": "model",
  "dirtyBlocks": [],
  "previewMode": "html",
  "warningsVisible": true
}
```

## 状态来源

- `block.id`：稳定块标识，用于选择、编辑、预览同步和局部更新。
- `block.sourceSpan`：来源范围，用于从结构块回跳到原始输入。
- `block.warnings`：块级 warnings，用于提示局部降级。
- `metadata.qualityReport`：文档级质量摘要，用于顶部质量状态。
- `metadata.conversion`：reader / writer / schemaVersion / options，用于审计转换路径。

## 后续接口

P2/P3 前端实现时应优先建立以下接口：

- `selectBlock(blockId)`
- `updateBlock(blockId, patch)`
- `syncPreview(blockId)`
- `filterWarnings(severity)`
- `exportEditedModel()`

编辑器不得绕过 `DocumentModel`，也不得把用户文档上传到远程服务。
