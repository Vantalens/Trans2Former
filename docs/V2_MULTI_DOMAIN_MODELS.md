# Trans2Former v2 多域模型参考手册

**版本**: v2.0.0-design  
**状态**: 🎯 设计阶段  
**最后更新**: 2026-06-23

---

## 概述

Trans2Former v2 引入多域模型架构，解决 v1 单一 `DocumentModel` 的语义混淆问题。

### 为什么需要多域模型？

**v1 的问题**:
- 单一 `DocumentModel` 承载所有格式（文档、表格、幻灯片、PDF）
- 同一个 `table` block 无法区分"文档中的表格"还是"电子表格"
- XLSX 公式、合并单元格、工作表结构被强制降级
- XLSX → DocumentModel → XLSX 往返后丢失大量信息

**v2 的解决方案**:
- 五个独立的域模型，每个专注于一类文档语义
- 跨域转换通过显式 mapper，降级可见、可追溯
- 保留 v1 兼容性，现有 API 不破坏

---

## 五个域模型

### 1. SemanticDoc - 语义文档

**适用格式**: Markdown、HTML、TXT、DOCX、EPUB

**特点**:
- 流式文档结构
- 强调阅读顺序和语义层次
- 块级元素（标题、段落、列表、引用、代码、表格）
- 适合文本内容和轻量排版

**Schema Version**: `trans2former.semantic-doc.v2`

**示例**:
```json
{
  "schemaVersion": "trans2former.semantic-doc.v2",
  "title": "示例文档",
  "blocks": [
    { "type": "heading", "level": 1, "text": "标题" },
    { "type": "paragraph", "text": "段落内容" },
    { "type": "list", "ordered": false, "items": ["项1", "项2"] },
    { "type": "table", "headers": ["列1", "列2"], "rows": [["A", "B"]] }
  ],
  "assets": [],
  "metadata": {
    "sourceFormat": "md",
    "warnings": []
  }
}
```

### 2. WorkbookModel - 表格工作簿

**适用格式**: XLSX、CSV

**特点**:
- 多工作表结构
- 保留单元格坐标、公式、格式
- 支持合并单元格、命名区域
- 适合数据计算和表格处理

**Schema Version**: `trans2former.workbook.v2`

**示例**:
```json
{
  "schemaVersion": "trans2former.workbook.v2",
  "title": "工作簿",
  "sheets": [
    {
      "id": "sheet-1",
      "name": "Sheet1",
      "cells": [
        [
          { "value": "姓名", "format": "text" },
          { "value": "年龄", "format": "text" }
        ],
        [
          { "value": "张三", "format": "text" },
          { "value": 25, "formula": null, "format": "number" }
        ]
      ],
      "mergedCells": [],
      "columnWidths": [100, 80]
    }
  ],
  "assets": [],
  "metadata": {
    "sourceFormat": "xlsx",
    "warnings": []
  }
}
```

### 3. SlideModel - 演示幻灯片

**适用格式**: PPTX

**特点**:
- 幻灯片序列结构
- 保留空间布局和坐标
- 支持母版、动画、转场
- 适合演示和视觉传达

**Schema Version**: `trans2former.slide.v2`

**示例**:
```json
{
  "schemaVersion": "trans2former.slide.v2",
  "title": "演示文稿",
  "slides": [
    {
      "id": "slide-1",
      "title": "标题页",
      "layout": "title",
      "elements": [
        {
          "id": "elem-1",
          "type": "text-box",
          "bounds": { "x": 100, "y": 200, "width": 600, "height": 100 },
          "content": { "text": "欢迎使用 Trans2Former" },
          "style": { "fontSize": 32, "bold": true }
        }
      ]
    }
  ],
  "assets": [],
  "metadata": {
    "sourceFormat": "pptx",
    "warnings": []
  }
}
```

### 4. FixedLayoutModel - 固定版式

**适用格式**: PDF

**特点**:
- 分页结构
- 保留精确坐标和尺寸
- 支持矢量图形和路径
- 适合打印和固定布局

**Schema Version**: `trans2former.fixed-layout.v2`

**示例**:
```json
{
  "schemaVersion": "trans2former.fixed-layout.v2",
  "title": "PDF文档",
  "pages": [
    {
      "id": "page-1",
      "pageNumber": 1,
      "width": 595,
      "height": 842,
      "elements": [
        {
          "id": "elem-1",
          "type": "text",
          "bounds": { "x": 72, "y": 72, "width": 451, "height": 20 },
          "content": { "text": "页面内容", "font": "Arial", "size": 12 },
          "style": {}
        }
      ]
    }
  ],
  "assets": [],
  "metadata": {
    "sourceFormat": "pdf",
    "warnings": []
  }
}
```

### 5. AssetGraph - 资源引用图

**适用场景**: 跨域资源共享、去重、依赖追踪

**特点**:
- 独立于文档正文的资源管理
- 记录资源引用关系
- 支持资源去重和统计

**Schema Version**: `trans2former.asset-graph.v2`

**示例**:
```json
{
  "schemaVersion": "trans2former.asset-graph.v2",
  "assets": [
    {
      "id": "asset-1",
      "name": "logo.png",
      "mime": "image/png",
      "data": "data:image/png;base64,...",
      "size": 12345,
      "role": "image"
    }
  ],
  "references": [
    {
      "assetId": "asset-1",
      "referencedBy": ["semantic-doc-1", "slide-2"],
      "role": "image"
    }
  ],
  "metadata": {
    "totalSize": 12345,
    "deduplicatedCount": 1
  }
}
```

---

## 路由规则

### 同域转换（直接）

在同一个域内的格式转换，不需要跨域 mapper：

```
Markdown → HTML → DOCX → EPUB  (SemanticDoc 域内)
XLSX → CSV                      (WorkbookModel 域内)
PPTX → PPTX                     (SlideModel 域内)
PDF → PDF                       (FixedLayoutModel 域内)
```

**流程**: 读取 → 域模型 → 写出

### 跨域转换（需要 mapper）

不同域之间的转换需要显式 mapper：

```
XLSX (WorkbookModel) → Markdown (SemanticDoc)
需要: WorkbookToSemanticMapper

Markdown (SemanticDoc) → PDF (FixedLayoutModel)
需要: SemanticToFixedMapper
```

**流程**: 读取 → 源域模型 → Mapper → 目标域模型 → 写出

---

## Mapper 参考

### WorkbookToSemanticMapper

**转换**: WorkbookModel → SemanticDoc

**逻辑**:
- 每个工作表 → 标题（h2）+ 表格 block
- 公式 → 计算后的值
- 合并单元格 → 普通单元格
- 数字格式 → 纯文本

**降级**:
- 公式丢失（lossy warning）
- 合并单元格丢失（lossy warning）
- 数字格式丢失（lossy warning）
- 多工作表结构扁平化（结构降级）

### SemanticToWorkbookMapper

**转换**: SemanticDoc → WorkbookModel

**逻辑**:
- 提取所有 table block
- 每个 table block → 一个工作表
- 非表格内容 → 忽略

**降级**:
- 非表格内容丢失（info warning）
- 标题、段落丢失（info warning）
- 缺少公式（保持空，无 warning）

### SlideToSemanticMapper

**转换**: SlideModel → SemanticDoc

**逻辑**:
- 每张幻灯片 → 标题（h2）+ 段落
- 文本框 → 段落
- 图片元素 → image block
- 表格元素 → table block

**降级**:
- 布局信息丢失（lossy warning）
- 动画丢失（lossy warning）
- 空间坐标转为阅读顺序（结构降级）
- 转场效果丢失（lossy warning）

### SemanticToSlideMapper

**转换**: SemanticDoc → SlideModel

**逻辑**:
- h1/h2 标题 → 幻灯片标题
- 段落 → 内容文本框
- 图片 → 幻灯片图片元素
- table block → 幻灯片表格元素

**降级**:
- 使用默认布局（info warning）
- 无动画（info warning）
- 简单文本框定位（info warning）

### FixedToSemanticMapper

**转换**: FixedLayoutModel → SemanticDoc

**逻辑**:
- 页面元素按 Y 坐标排序（从上到下）
- 同行元素按 X 坐标排序（从左到右）
- 重建语义结构（段落、标题）
- 可能需要 OCR 辅助

**降级**:
- 坐标信息丢失（lossy warning）
- 语义重建可能不准确（lossy warning）
- 复杂排版可能错位（lossy warning）
- OCR 识别错误（如果使用 OCR）

### SemanticToFixedMapper

**转换**: SemanticDoc → FixedLayoutModel

**逻辑**:
- 语义内容 → 固定坐标元素
- 保留阅读顺序
- 使用默认排版样式
- 自动分页

**降级**:
- 使用默认排版（info warning）
- 使用默认字体（info warning）
- 简单分页逻辑（info warning）

---

## 质量报告

所有跨域转换必须在 `metadata.qualityReport` 中记录降级信息。

### 质量报告结构

```typescript
interface QualityReport {
  structureFidelity: "high" | "medium" | "low";
  tableFidelity: "full" | "tracked" | "basic" | "not-applicable";
  assetFidelity: "full" | "embedded" | "not-applicable";
  warningCount: number;
  warningsBySeverity: Record<string, number>;
  downgradeCount: number;
  executedMappers?: string[];  // v2 新增
}
```

### 示例

**XLSX → Markdown 转换**:
```json
{
  "qualityReport": {
    "structureFidelity": "medium",
    "tableFidelity": "tracked",
    "assetFidelity": "not-applicable",
    "warningCount": 3,
    "warningsBySeverity": {
      "lossy": 2,
      "info": 1
    },
    "downgradeCount": 5,
    "executedMappers": ["WorkbookToSemanticMapper"]
  }
}
```

**降级项**:
- 2 个公式转为值
- 1 个合并单元格拆分
- 2 个数字格式丢失

---

## 从 v1 迁移

### 向下兼容

v2 保留 `DocumentModel` 作为 `SemanticDoc` 的类型别名：

```typescript
// v1 代码继续有效
type DocumentModel = SemanticDoc;

// v2 代码使用新名称
const doc: SemanticDoc = { ... };
```

### 识别模型版本

通过 `schemaVersion` 字段识别：

```typescript
function getModelVersion(model: any): "v1" | "v2" {
  if (model.schemaVersion === "trans2former.document.v1") {
    return "v1";
  } else if (model.schemaVersion?.startsWith("trans2former.")) {
    return "v2";
  }
  throw new Error("Unknown model version");
}
```

### 迁移路径

如果你的代码使用了 `DocumentModel`，不需要立即修改：

1. **继续使用 v1**: 所有 v1 路径在迁移期间保持可用
2. **逐步迁移**: 当特定格式迁移到 v2 后，建议切换到新 API
3. **完全迁移**: v3.0.0 废弃 v1（预计 6 个月后）

---

## API 参考

### 格式注册（v2）

```typescript
interface FormatMetadata {
  format: string;
  domain: "semantic" | "workbook" | "slide" | "fixed-layout";
  reader: (input: any) => Promise<DomainModel>;
  writer: (model: DomainModel) => Promise<Uint8Array>;
}

class FormatRegistryV2 {
  registerFormat(metadata: FormatMetadata): void;
  registerMapper(
    fromDomain: string, 
    toDomain: string, 
    mapper: MapperFunction
  ): void;
  
  convert(
    input: any, 
    fromFormat: string, 
    toFormat: string
  ): Promise<ConversionResult>;
}
```

### Mapper 接口

```typescript
interface MapperFunction {
  (sourceModel: DomainModel): Promise<{
    targetModel: DomainModel;
    warnings: Warning[];
    downgradeCount: number;
  }>;
}

// 示例实现
class WorkbookToSemanticMapper implements MapperFunction {
  async map(workbook: WorkbookModel): Promise<{
    targetModel: SemanticDoc;
    warnings: Warning[];
    downgradeCount: number;
  }> {
    // 实现转换逻辑
  }
}
```

### 转换结果

```typescript
interface ConversionResult {
  output: Uint8Array;
  model: DomainModel;
  qualityReport: QualityReport;
  warnings: Warning[];
}
```

---

## 常见问题

### Q1: 为什么不直接扩展 DocumentModel？

**答**: 扩展单一模型会导致字段爆炸和语义混淆。例如，`table` block 无法区分是"文档中的表格"还是"电子表格"，导致 XLSX 转换时丢失大量信息。

### Q2: 跨域转换性能如何？

**答**: 跨域转换需要额外的 mapper 步骤，预计增加 10-20% 的耗时。但换来的是更高的信息保真度和可追溯的降级记录。

### Q3: v1 代码何时废弃？

**答**: v3.0.0 (预计 2026 年底) 会标记 `DocumentModel` 为 deprecated，但保留兼容层至少 6 个月。完全移除预计在 v4.0.0 (2027 年中)。

### Q4: 如何选择使用哪个域模型？

**答**: 根据输入格式自动选择：
- Markdown/HTML/DOCX → SemanticDoc
- XLSX/CSV → WorkbookModel
- PPTX → SlideModel
- PDF → FixedLayoutModel

用户无需手动选择，系统会自动路由。

### Q5: 可以组合多个 mapper 吗？

**答**: 可以，但会增加降级。例如 `XLSX → PDF` 需要：
```
XLSX → WorkbookModel → WorkbookToSemanticMapper → SemanticDoc → SemanticToFixedMapper → FixedLayoutModel → PDF
```

质量报告会记录完整的 mapper 链。

---

## 示例代码

### 读取 XLSX 为 WorkbookModel

```typescript
import { FormatRegistryV2 } from "./core/format-registry-v2.js";

const registry = new FormatRegistryV2();
const xlsxData = await fs.readFile("data.xlsx");

const workbook = await registry.read(xlsxData, "xlsx");
console.log(workbook.schemaVersion); // "trans2former.workbook.v2"
console.log(workbook.sheets.length); // 工作表数量
```

### 转换 XLSX → Markdown

```typescript
const result = await registry.convert(xlsxData, "xlsx", "md");

console.log("输出:", result.output);
console.log("质量报告:", result.qualityReport);
console.log("执行的 mapper:", result.qualityReport.executedMappers);
// ["WorkbookToSemanticMapper"]
```

### 自定义 Mapper

```typescript
class CustomWorkbookToSemanticMapper {
  async map(workbook: WorkbookModel) {
    const warnings: Warning[] = [];
    const blocks: SemanticBlock[] = [];
    
    // 自定义转换逻辑
    for (const sheet of workbook.sheets) {
      blocks.push({
        type: "heading",
        level: 1,
        text: sheet.name
      });
      
      // 转换单元格为段落（而不是表格）
      for (const row of sheet.cells) {
        const text = row.map(c => c.value).join(" ");
        blocks.push({
          type: "paragraph",
          text
        });
      }
    }
    
    return {
      targetModel: {
        schemaVersion: "trans2former.semantic-doc.v2",
        title: workbook.title,
        blocks,
        assets: [],
        metadata: { sourceFormat: "xlsx", warnings }
      },
      warnings,
      downgradeCount: 0
    };
  }
}

// 注册自定义 mapper
registry.registerMapper("workbook", "semantic", new CustomWorkbookToSemanticMapper());
```

---

## 相关文档

- [MULTI_DOMAIN_MODEL_DESIGN.md](architecture/MULTI_DOMAIN_MODEL_DESIGN.md) - 详细设计文档
- [v1-document-model.md](formats/v1-document-model.md) - v1 模型参考（已归档）
- [CONVERSION_POLICY.md](product/CONVERSION_POLICY.md) - 转换策略
- [CONVERSION_PATHS.md](product/CONVERSION_PATHS.md) - 转换路径矩阵

---

**版本**: v2.0.0-design  
**状态**: 🎯 设计阶段，不实施代码修改  
**维护者**: Jack Yao  
**协作 AI**: Claude Code (Opus 4.8)

