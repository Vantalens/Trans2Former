# 多域模型架构设计 (v2) - Phase 5 设计阶段

**版本**: v2.0.0-design  
**状态**: 🎯 设计阶段（Phase 5，不实施）  
**创建日期**: 2026-06-23  
**负责人**: Jack Yao + Claude Code

---

## 1. 设计目标

本文档定义 Trans2Former v2 多域模型架构，解决 v1 单一 `DocumentModel` 的语义混淆问题。

### 1.1 v1 架构的局限性

当前 v1 使用单一 `DocumentModel` 承载所有格式（语义文档、表格、幻灯片、固定版式），导致：

1. **语义混淆**: 同一个 `table` block 无法区分是"文档中的表格"还是"电子表格"
2. **信息损失**: XLSX 的公式、合并单元格、工作表结构被强制降级为简单 table block
3. **转换不可逆**: XLSX → DocumentModel → XLSX 往返后丢失大量元信息
4. **扩展困难**: 添加 PPTX、PDF 固定版式时，复用 block 类型导致语义污染

### 1.2 v2 设计目标

1. **语义解耦**: 不同文档类型使用独立的域模型（Domain Model）
2. **信息保真**: 每个域模型保留本域的完整语义（公式、布局、样式）
3. **显式转换**: 跨域转换通过 mapper 实现，降级可见、可追溯
4. **向下兼容**: 保留 `DocumentModel` 作为 `SemanticDoc` 别名，现有 API 不破坏

---

## 2. 五类域模型定义

### 2.1 SemanticDoc - 语义文档

**适用格式**: Markdown、HTML、TXT、DOCX、EPUB

**模型结构**:
```typescript
interface SemanticDoc {
  schemaVersion: "trans2former.semantic-doc.v2";
  title: string;
  blocks: SemanticBlock[];  // heading, paragraph, list, quote, code, table, image, asset, raw
  assets: Asset[];
  metadata: {
    sourceFormat: string;
    conversion?: ConversionMetadata;
    qualityReport?: QualityReport;
    warnings?: Warning[];
  };
}

type SemanticBlock = 
  | HeadingBlock 
  | ParagraphBlock 
  | ListBlock 
  | QuoteBlock 
  | CodeBlock 
  | TableBlock    // 文档中的表格（数据展示用）
  | ImageBlock 
  | AssetBlock 
  | RawBlock;
```

**语义**: 流式文档，强调阅读顺序和语义结构。

### 2.2 WorkbookModel - 表格工作簿

**适用格式**: XLSX、CSV

**模型结构**:
```typescript
interface WorkbookModel {
  schemaVersion: "trans2former.workbook.v2";
  title: string;
  sheets: Sheet[];
  assets: Asset[];
  metadata: {
    sourceFormat: string;
    conversion?: ConversionMetadata;
    qualityReport?: QualityReport;
    warnings?: Warning[];
  };
}

interface Sheet {
  id: string;
  name: string;
  cells: Cell[][];  // 二维数组，保留坐标
  mergedCells: MergedCell[];
  columnWidths?: number[];
  rowHeights?: number[];
  namedRanges?: NamedRange[];
  sourceSpan?: SourceSpan;
}

interface Cell {
  value: string | number | boolean | null;
  formula?: string;  // 保留公式
  format?: CellFormat;  // 数字格式、对齐、样式
  style?: CellStyle;
  sourceSpan?: SourceSpan;
}
```

**语义**: 强调单元格坐标、公式、多工作表、数据计算。

### 2.3 SlideModel - 演示幻灯片

**适用格式**: PPTX

**模型结构**:
```typescript
interface SlideModel {
  schemaVersion: "trans2former.slide.v2";
  title: string;
  slides: Slide[];
  masters?: SlideMaster[];  // 母版
  assets: Asset[];
  metadata: {
    sourceFormat: string;
    conversion?: ConversionMetadata;
    qualityReport?: QualityReport;
    warnings?: Warning[];
  };
}

interface Slide {
  id: string;
  title?: string;
  layout: string;  // title, content, two-column, blank
  elements: SlideElement[];  // text-box, image, shape, table, chart
  transitions?: Transition;
  animations?: Animation[];
  sourceSpan?: SourceSpan;
}

interface SlideElement {
  id: string;
  type: "text-box" | "image" | "shape" | "table" | "chart";
  bounds: { x: number; y: number; width: number; height: number };  // 坐标和尺寸
  content: any;  // 根据 type 不同
  style?: ElementStyle;
  sourceSpan?: SourceSpan;
}
```

**语义**: 强调空间布局、视觉层次、动画、演示流程。

### 2.4 FixedLayoutModel - 固定版式

**适用格式**: PDF

**模型结构**:
```typescript
interface FixedLayoutModel {
  schemaVersion: "trans2former.fixed-layout.v2";
  title: string;
  pages: Page[];
  assets: Asset[];
  metadata: {
    sourceFormat: string;
    conversion?: ConversionMetadata;
    qualityReport?: QualityReport;
    warnings?: Warning[];
  };
}

interface Page {
  id: string;
  pageNumber: number;
  width: number;
  height: number;
  elements: PageElement[];  // text, image, vector, path
  sourceSpan?: SourceSpan;
}

interface PageElement {
  id: string;
  type: "text" | "image" | "vector" | "path";
  bounds: { x: number; y: number; width: number; height: number };
  content: any;
  style?: ElementStyle;
  sourceSpan?: SourceSpan;
}
```

**语义**: 强调页面坐标、精确位置、打印版式、固定布局。

### 2.5 AssetGraph - 资源引用图

**适用场景**: 跨域模型共享、资源去重、依赖追踪

**模型结构**:
```typescript
interface AssetGraph {
  schemaVersion: "trans2former.asset-graph.v2";
  assets: Asset[];
  references: AssetReference[];  // 资源引用关系
  metadata: {
    totalSize: number;
    deduplicatedCount: number;
  };
}

interface AssetReference {
  assetId: string;
  referencedBy: string[];  // 引用该资源的模型 ID 列表
  role: "image" | "font" | "attachment" | "embedded";
}
```

**语义**: 资源共享、去重、依赖追踪，不属于文档正文。

---

## 3. 路由规则设计

### 3.1 直接转换（同域）

在同一个域内的格式转换，不需要跨域 mapper：

```
Markdown → HTML → DOCX → EPUB  (SemanticDoc 域内)
XLSX → CSV                      (WorkbookModel 域内)
PPTX → PPTX                     (SlideModel 域内)
PDF → PDF                       (FixedLayoutModel 域内)
```

**路由逻辑**:
```typescript
function route(inputFormat: string, outputFormat: string) {
  const inputDomain = getDomain(inputFormat);
  const outputDomain = getDomain(outputFormat);
  
  if (inputDomain === outputDomain) {
    // 同域转换，直接使用域模型
    return { domain: inputDomain, mapper: null };
  } else {
    // 跨域转换，需要 mapper
    return { 
      sourceDomain: inputDomain, 
      targetDomain: outputDomain, 
      mapper: `${inputDomain}To${outputDomain}Mapper` 
    };
  }
}
```

### 3.2 跨域转换（需要 mapper）

跨域转换需要显式 mapper，降级可见：

| 源域 | 目标域 | Mapper | 降级说明 |
| --- | --- | --- | --- |
| SemanticDoc | WorkbookModel | `SemanticToWorkbookMapper` | 表格 block 提取为工作表，其他内容丢弃或放入备注 |
| WorkbookModel | SemanticDoc | `WorkbookToSemanticMapper` | 每个工作表转为表格 block，公式转为值，布局信息丢失 |
| SemanticDoc | SlideModel | `SemanticToSlideMapper` | 标题映射为幻灯片标题，段落映射为内容，图片保留 |
| SlideModel | SemanticDoc | `SlideToSemanticMapper` | 每张幻灯片转为标题+段落，布局和动画丢失 |
| FixedLayoutModel | SemanticDoc | `FixedToSemanticMapper` | 页面元素按坐标排序，重建语义结构，可能需要 OCR |
| SemanticDoc | FixedLayoutModel | `SemanticToFixedMapper` | 语义内容渲染为固定布局，保留阅读顺序 |

### 3.3 路由决策流程

```
输入格式 → 识别域模型 A
输出格式 → 识别域模型 B

if (A === B) {
  读取 → 域模型 A → 写出
} else {
  读取 → 域模型 A → Mapper(A→B) → 域模型 B → 写出
}
```

**示例 1: Markdown → HTML** (同域)
```
MD Reader → SemanticDoc → HTML Writer
```

**示例 2: XLSX → Markdown** (跨域)
```
XLSX Reader → WorkbookModel → WorkbookToSemanticMapper → SemanticDoc → MD Writer
```

**示例 3: PDF → DOCX** (跨域)
```
PDF Reader → FixedLayoutModel → FixedToSemanticMapper → SemanticDoc → DOCX Writer
```

---

## 4. 投影与降级策略

### 4.1 投影（Projection）

**定义**: 从高信息量模型投影到低信息量模型，显式降级。

**示例: WorkbookModel → SemanticDoc**

```typescript
class WorkbookToSemanticMapper {
  map(workbook: WorkbookModel): SemanticDoc {
    const blocks: SemanticBlock[] = [];
    const warnings: Warning[] = [];
    
    for (const sheet of workbook.sheets) {
      // 工作表名作为标题
      blocks.push({ type: "heading", level: 2, text: sheet.name });
      
      // 单元格数据转为表格 block
      const tableBlock = this.sheetToTable(sheet);
      blocks.push(tableBlock);
      
      // 公式丢失警告
      const formulaCells = sheet.cells.flat().filter(c => c.formula);
      if (formulaCells.length > 0) {
        warnings.push({
          severity: "lossy",
          code: "FORMULA_TO_VALUE",
          message: `${formulaCells.length} formulas converted to values`,
          details: { formulaCount: formulaCells.length }
        });
      }
    }
    
    return {
      schemaVersion: "trans2former.semantic-doc.v2",
      title: workbook.title,
      blocks,
      assets: workbook.assets,
      metadata: {
        sourceFormat: workbook.metadata.sourceFormat,
        warnings,
        qualityReport: {
          structureFidelity: "medium",
          tableFidelity: "tracked",
          warningCount: warnings.length,
          downgradeCount: formulaCells.length
        }
      }
    };
  }
}
```

**降级记录**:
- 公式 → 值（lossy warning）
- 合并单元格 → 普通单元格（lossy warning）
- 数字格式 → 纯文本（lossy warning）
- 多工作表 → 多个表格 block（结构降级）

### 4.2 提升（Lift）

**定义**: 从低信息量模型提升到高信息量模型，补充默认值。

**示例: SemanticDoc → WorkbookModel**

```typescript
class SemanticToWorkbookMapper {
  map(doc: SemanticDoc): WorkbookModel {
    const sheets: Sheet[] = [];
    const warnings: Warning[] = [];
    
    // 提取文档中的所有表格 block
    const tableBocks = doc.blocks.filter(b => b.type === "table");
    
    if (tableBocks.length === 0) {
      warnings.push({
        severity: "unsupported",
        code: "NO_TABLE_FOUND",
        message: "No table blocks found in document, creating empty sheet",
        details: {}
      });
      sheets.push(this.createEmptySheet());
    } else {
      // 每个表格 block 转为一个工作表
      tableBocks.forEach((tableBlock, index) => {
        const sheet = this.tableBlockToSheet(tableBlock, index);
        sheets.push(sheet);
      });
      
      warnings.push({
        severity: "info",
        code: "NON_TABLE_CONTENT_IGNORED",
        message: "Non-table blocks (headings, paragraphs) were ignored",
        details: { ignoredBlocks: doc.blocks.length - tableBocks.length }
      });
    }
    
    return {
      schemaVersion: "trans2former.workbook.v2",
      title: doc.title,
      sheets,
      assets: doc.assets,
      metadata: {
        sourceFormat: doc.metadata.sourceFormat,
        warnings,
        qualityReport: {
          structureFidelity: "low",
          tableFidelity: "basic",
          warningCount: warnings.length,
          downgradeCount: 0
        }
      }
    };
  }
}
```

**提升逻辑**:
- 表格 block → 工作表（数据转移）
- 非表格内容 → 忽略（info warning）
- 缺少公式 → 保持空（无需 warning）
- 缺少样式 → 默认样式（无需 warning）

### 4.3 降级可见性

所有跨域转换必须在 `metadata.qualityReport` 中记录降级信息：

```typescript
interface QualityReport {
  structureFidelity: "high" | "medium" | "low";
  tableFidelity: "full" | "tracked" | "basic" | "not-applicable";
  assetFidelity: "full" | "embedded" | "not-applicable";
  warningCount: number;
  warningsBySeverity: Record<string, number>;
  downgradeCount: number;  // 降级项数量
  executedMappers?: string[];  // 执行的 mapper 列表
}
```

**示例**:
```json
{
  "qualityReport": {
    "structureFidelity": "medium",
    "tableFidelity": "tracked",
    "warningCount": 3,
    "warningsBySeverity": { "lossy": 2, "info": 1 },
    "downgradeCount": 5,
    "executedMappers": ["WorkbookToSemanticMapper"]
  }
}
```

---

## 5. 迁移路径规划

### 5.1 原则

1. **渐进式迁移**: 不破坏现有功能，逐步引入新模型
2. **向下兼容**: 保留 `DocumentModel` 作为 `SemanticDoc` 别名
3. **并行运行**: v1 和 v2 模型共存，逐条路径迁移
4. **充分测试**: 每个迁移步骤都有对应的测试和快照对比

### 5.2 四步迁移策略

#### 第一步: 引入域模型作为可选路径（Phase 6）

- 创建五个域模型的 TypeScript 定义和 JSON Schema
- 实现 `SemanticDoc`、`WorkbookModel`、`SlideModel`、`FixedLayoutModel`、`AssetGraph`
- 保留 `DocumentModel` 作为 `SemanticDoc` 的类型别名
- 添加 `schemaVersion` 识别逻辑，支持 v1 和 v2 共存

```typescript
// 向下兼容
type DocumentModel = SemanticDoc;  // 别名

function isV1Model(model: any): boolean {
  return model.schemaVersion === "trans2former.document.v1";
}

function isV2Model(model: any): boolean {
  return model.schemaVersion?.startsWith("trans2former.") 
    && model.schemaVersion !== "trans2former.document.v1";
}
```

**验证**: 所有现有测试通过，新模型通过独立测试。

#### 第二步: 重构 format registry（Phase 7）

- 扩展 `FormatRegistry`，支持域模型路由
- 为每个格式声明所属域模型
- 实现跨域 mapper 注册和调用机制
- 保留 v1 路径作为 fallback

```typescript
interface FormatMetadata {
  format: string;
  domain: "semantic" | "workbook" | "slide" | "fixed-layout";
  reader: ReaderFunction;
  writer: WriterFunction;
}

class FormatRegistryV2 {
  registerFormat(metadata: FormatMetadata) { ... }
  registerMapper(from: string, to: string, mapper: MapperFunction) { ... }
  
  convert(input: any, fromFormat: string, toFormat: string) {
    const fromDomain = this.getDomain(fromFormat);
    const toDomain = this.getDomain(toFormat);
    
    if (fromDomain === toDomain) {
      // 同域转换
      return this.convertSameDomain(input, fromFormat, toFormat);
    } else {
      // 跨域转换
      const mapper = this.getMapper(fromDomain, toDomain);
      return this.convertCrossDomain(input, fromFormat, toFormat, mapper);
    }
  }
}
```

**验证**: 重构后所有现有路径通过测试，质量报告一致。

#### 第三步: 逐条路径迁移（Phase 8-10）

优先级排序：

1. **P0: XLSX/CSV 路径** (Phase 8)
   - XLSX Reader → WorkbookModel
   - CSV Reader → WorkbookModel
   - WorkbookModel → XLSX Writer
   - WorkbookModel → CSV Writer
   - 实现 `WorkbookToSemanticMapper` 和 `SemanticToWorkbookMapper`
   - 迁移测试: `xlsx-reader-test.js`、`xlsx-writer-performance-test.js`

2. **P1: PPTX 路径** (Phase 9)
   - PPTX Reader → SlideModel
   - SlideModel → PPTX Writer
   - 实现 `SlideToSemanticMapper` 和 `SemanticToSlideMapper`
   - 迁移测试: `format-integrity-test.js` (PPTX 部分)

3. **P2: PDF 路径** (Phase 10)
   - PDF Reader → FixedLayoutModel
   - FixedLayoutModel → PDF Writer
   - 实现 `FixedToSemanticMapper` 和 `SemanticToFixedMapper`
   - 迁移测试: `pdf-reader-test.js`

**每条路径迁移检查清单**:
- [ ] 新模型定义完整
- [ ] Reader 迁移到新模型
- [ ] Writer 迁移到新模型
- [ ] Mapper 实现并测试
- [ ] 快照对比（迁移前后输出一致或降级可解释）
- [ ] 质量报告记录完整
- [ ] 所有测试通过
- [ ] 文档更新

#### 第四步: 废弃单一 DocumentModel（Phase 11+）

- 所有路径迁移完成后，评估 v1 使用情况
- 如果所有路径已迁移到 v2，标记 `DocumentModel` 为 deprecated
- 发布 v3.0.0，正式废弃 v1 单一模型
- 保留 v1 兼容层至少一个大版本（6 个月）

```typescript
/** @deprecated Use SemanticDoc instead. Will be removed in v4.0.0 */
type DocumentModel = SemanticDoc;
```

### 5.3 回滚策略

如果迁移过程中发现严重问题：

1. **保留 v1 路径**: 所有 v1 路径在迁移期间保持可用
2. **Feature Flag**: 使用 `enableV2Models` 开关控制新模型启用
3. **A/B 测试**: 同时运行 v1 和 v2 路径，对比输出质量
4. **快速回滚**: 如果 v2 路径失败，自动 fallback 到 v1

```typescript
const USE_V2_MODELS = process.env.ENABLE_V2_MODELS === "true";

function convert(input, from, to) {
  if (USE_V2_MODELS && isV2Supported(from, to)) {
    try {
      return convertV2(input, from, to);
    } catch (err) {
      console.warn("V2 conversion failed, fallback to V1", err);
      return convertV1(input, from, to);
    }
  } else {
    return convertV1(input, from, to);
  }
}
```

---

## 6. 文档体系更新

### 6.1 归档 v1 文档

- 重命名 `docs/formats/DOCUMENT_MODEL_SCHEMA.md` 为 `docs/formats/v1-document-model.md`
- 添加归档说明和迁移指南链接

### 6.2 创建 v2 文档

创建 `docs/V2_MULTI_DOMAIN_MODELS.md`，包含：

1. **概述**: 多域模型架构的动机和目标
2. **五个域模型**: 每个模型的详细定义、字段说明、示例
3. **路由规则**: 同域和跨域转换的决策逻辑
4. **Mapper 列表**: 所有跨域 mapper 的输入输出和降级说明
5. **迁移指南**: 如何从 v1 迁移到 v2
6. **API 参考**: 新模型的 TypeScript 接口和 JSON Schema

### 6.3 更新 README.md

在 "核心本地能力" 部分更新架构说明：

```markdown
**架构演进路径**：
- **✅ v1（当前）**：单一 DocumentModel 统一承载所有格式
  - 详见 [v1-document-model.md](docs/formats/v1-document-model.md)
  - 9 种块类型（heading/paragraph/list/table/code/quote/image/asset/raw）
  - 已验证支持 14 种输入 → 11 种输出转换矩阵
- **🎯 v2（设计中）**：多域模型架构，语义解耦
  - 五个规范模型：SemanticDoc、WorkbookModel、SlideModel、FixedLayoutModel、AssetGraph
  - 详见 [MULTI_DOMAIN_MODEL_DESIGN.md](docs/architecture/MULTI_DOMAIN_MODEL_DESIGN.md)
  - 跨模型转换显式 mapper，降级可见
- **⏱️ 迁移计划**：Phase 5 完成详细设计，Phase 6-11 分阶段实施，保证向下兼容
```

### 6.4 更新 CONVERSION_POLICY.md

添加投影规则部分：

```markdown
## 投影规则（v2）

跨域转换时，需要通过 mapper 进行投影或提升：

### WorkbookModel → SemanticDoc

- 公式 → 值（lossy）
- 合并单元格 → 普通单元格（lossy）
- 数字格式 → 纯文本（lossy）
- 多工作表 → 多个表格 block（结构降级）

### SemanticDoc → WorkbookModel

- 表格 block → 工作表（数据转移）
- 非表格内容 → 忽略（info）
- 缺少公式 → 保持空
- 缺少样式 → 默认样式

### SlideModel → SemanticDoc

- 每张幻灯片 → 标题 + 段落
- 布局信息 → 丢失（lossy）
- 动画 → 丢失（lossy）
- 空间坐标 → 阅读顺序（结构降级）

### SemanticDoc → SlideModel

- 标题 → 幻灯片标题
- 段落 → 内容文本框
- 图片 → 幻灯片图片元素
- 缺少布局 → 默认布局

### FixedLayoutModel → SemanticDoc

- 页面元素按坐标排序
- 重建语义结构（可能不准确，lossy）
- 可能需要 OCR（性能影响）

### SemanticDoc → FixedLayoutModel

- 语义内容 → 固定坐标元素
- 保留阅读顺序
- 使用默认排版
```

---

## 7. 质量保证

### 7.1 测试策略

1. **模型验证测试**
   - 每个域模型的 JSON Schema 验证
   - 字段类型和必填项检查
   - 示例数据验证

2. **Mapper 测试**
   - 每个 mapper 的输入输出测试
   - 降级记录完整性检查
   - 往返转换测试（A→B→A，验证信息损失是否符合预期）

3. **路径对比测试**
   - v1 路径 vs v2 路径输出快照对比
   - 质量报告一致性检查
   - 性能基准对比

4. **回归测试**
   - 所有现有测试必须通过
   - 覆盖率不得下降
   - 性能不得显著退化（±10%）

### 7.2 质量门禁

每个 Phase 完成后必须通过以下门禁：

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 覆盖率 ≥ 85%（整体）、≥ 80%（分支）
- [ ] 快照测试通过或降级可解释
- [ ] 质量报告记录完整
- [ ] 文档更新完成
- [ ] 代码审核通过
- [ ] 无 P0/P1 Issue

### 7.3 监控指标

迁移期间需要监控：

1. **转换成功率**: v1 vs v2 成功率对比
2. **降级率**: 每条路径的降级项数量
3. **性能**: 转换耗时对比
4. **内存使用**: 峰值内存对比
5. **用户反馈**: 如果有真实用户，收集反馈

---

## 8. 风险与应对

### 8.1 风险识别

1. **迁移工作量大**: 预计需要 6-8 周完成所有路径迁移
2. **兼容性问题**: 可能破坏现有 API 或测试
3. **性能退化**: 新模型可能带来额外开销
4. **质量回归**: 迁移过程中可能引入新 Bug

### 8.2 应对措施

1. **分阶段迁移**: 一次只迁移一条路径，充分测试后再继续
2. **保留 v1 路径**: 迁移期间 v1 路径始终可用，作为 fallback
3. **Feature Flag**: 使用开关控制新模型启用，便于快速回滚
4. **充分测试**: 每个 Phase 都有完整的测试和代码审核
5. **文档先行**: 设计阶段完成详细文档，减少实施阶段的返工

---

## 9. 实施时间线

### Phase 5: 设计阶段（当前，1 周）

- ✅ 创建本设计文档
- ✅ 定义五个域模型
- ✅ 设计路由规则
- ✅ 规划迁移路径
- ✅ 更新文档体系

### Phase 6: 引入域模型（2 周）

- 创建 TypeScript 接口定义
- 实现 JSON Schema 验证
- 添加 `schemaVersion` 识别逻辑
- 实现基础的 SemanticDoc（作为 v1 DocumentModel 的升级）
- 验证向下兼容性

### Phase 7: 重构 format registry（2 周）

- 扩展 FormatRegistry 支持域模型
- 为每个格式声明所属域
- 实现 mapper 注册机制
- 添加路由决策逻辑
- 验证所有现有路径通过

### Phase 8: XLSX/CSV 路径迁移（3 周）

- 实现 WorkbookModel
- 迁移 XLSX Reader/Writer
- 迁移 CSV Reader/Writer
- 实现 WorkbookToSemanticMapper
- 实现 SemanticToWorkbookMapper
- 迁移所有表格相关测试

### Phase 9: PPTX 路径迁移（3 周）

- 实现 SlideModel
- 迁移 PPTX Reader/Writer
- 实现 SlideToSemanticMapper
- 实现 SemanticToSlideMapper
- 迁移演示文稿相关测试

### Phase 10: PDF 路径迁移（3 周）

- 实现 FixedLayoutModel
- 迁移 PDF Reader/Writer
- 实现 FixedToSemanticMapper
- 实现 SemanticToFixedMapper
- 迁移 PDF 相关测试

### Phase 11: 废弃 v1（1 周）

- 标记 DocumentModel 为 deprecated
- 更新所有文档
- 发布 v3.0.0
- 保留兼容层 6 个月

**总计**: 约 15 周（3.5 个月）

---

## 10. 成功标准

### 10.1 功能完整性

- [ ] 所有 14 种输入格式支持
- [ ] 所有 11 种输出格式支持
- [ ] 所有现有转换路径正常工作
- [ ] 跨域转换降级可见且可追溯

### 10.2 质量标准

- [ ] 测试覆盖率 ≥ 85%（整体）
- [ ] 分支覆盖率 ≥ 80%
- [ ] 所有测试通过
- [ ] 快照测试一致或降级可解释
- [ ] 无 P0/P1 未关闭 Issue

### 10.3 性能标准

- [ ] 转换耗时不超过 v1 的 120%
- [ ] 内存使用不超过 v1 的 150%
- [ ] 资源预算不超标

### 10.4 文档完整性

- [ ] v2 架构文档完整
- [ ] 迁移指南清晰
- [ ] API 文档更新
- [ ] 示例代码完整

---

## 11. 附录

### 11.1 域模型选择决策树

```
输入格式识别
├─ 流式文档（强调阅读顺序）
│  └─ SemanticDoc: MD, HTML, TXT, DOCX, EPUB
├─ 数据表格（强调单元格坐标和公式）
│  └─ WorkbookModel: XLSX, CSV
├─ 演示文稿（强调空间布局和视觉层次）
│  └─ SlideModel: PPTX
├─ 固定版式（强调页面坐标和精确位置）
│  └─ FixedLayoutModel: PDF
└─ 图片（OCR 后进入其他域）
   └─ PNG → OCR → SemanticDoc
```

### 11.2 Mapper 组合规则

当需要 A→C 转换，但没有直接 mapper 时，可以组合：

```
A → B → C

示例: XLSX → PDF
XLSX Reader → WorkbookModel → WorkbookToSemanticMapper → SemanticDoc → SemanticToFixedMapper → FixedLayoutModel → PDF Writer
```

**注意**: 组合 mapper 会增加降级，需要在质量报告中记录完整的 mapper 链。

### 11.3 JSON Schema 示例

**SemanticDoc Schema**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "trans2former.semantic-doc.v2",
  "type": "object",
  "required": ["schemaVersion", "title", "blocks", "assets", "metadata"],
  "properties": {
    "schemaVersion": {
      "type": "string",
      "const": "trans2former.semantic-doc.v2"
    },
    "title": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": { "$ref": "#/definitions/SemanticBlock" }
    },
    "assets": {
      "type": "array",
      "items": { "$ref": "#/definitions/Asset" }
    },
    "metadata": { "$ref": "#/definitions/Metadata" }
  },
  "definitions": {
    "SemanticBlock": {
      "oneOf": [
        { "$ref": "#/definitions/HeadingBlock" },
        { "$ref": "#/definitions/ParagraphBlock" },
        { "$ref": "#/definitions/ListBlock" },
        { "$ref": "#/definitions/TableBlock" }
      ]
    }
  }
}
```

---

## 12. 变更记录

- v2.0.0-design (2026-06-23): Phase 5 设计文档创建
  - 定义五类域模型
  - 设计路由规则和投影策略
  - 规划迁移路径（Phase 6-11）
  - 更新文档体系

---

**文档维护者**: Jack Yao  
**协作 AI**: Claude Code (Opus 4.8)  
**状态**: 🎯 设计阶段，不实施代码修改  
**下一步**: Phase 6 引入域模型（需要用户确认后执行）

