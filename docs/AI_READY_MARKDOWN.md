# AI-ready Markdown Output

版本：v0.1.0
状态：P1 设计生效
最后更新：2026-04-30

本文定义 Trans2Former 面向 AI/RAG 场景的 Markdown 输出准则。

## 输出原则

- 标题层级必须稳定，不为了视觉效果跳级。
- 表格优先保留为 Markdown table；无法保真时用 warning 解释。
- 图片输出为可追踪占位：alt、title、asset id 或来源路径必须至少保留一个。
- 列表保持有序/无序属性，嵌套层级通过 `itemMeta.depth` 保留。
- 脚注、属性、命名空间、复杂版式等无法完整表达时必须产生 warning。
- 输出不得包含用户本地绝对路径、调试 stack、临时 Blob URL 或隐藏遥测信息。

## 建议结构

```md
# Document Title

## Section

Paragraph text.

| Header | Value |
| --- | --- |
| A | 1 |

![asset alt](asset:asset-id)
```

## 降级说明

Markdown 无法完整表达分页、复杂 CSS、动画、嵌入脚本、扫描图片文字、Office 复杂样式和 PDF 精确版面。此类信息必须通过 `metadata.warnings`、`block.warnings` 或 `qualityReport` 暴露，而不是静默丢弃。
