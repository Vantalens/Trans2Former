# Conversion Policy

版本：v0.2.0  
状态：生效  
最后更新：2026-06-13

## 目标

Trans2Former 使用 `DocumentModel` 作为格式互转的中间层。不同格式的表达能力不一致，因此转换时允许可解释的降级，但必须保持内容可读、资源可追踪、损失可说明。

## 基本原则

- 优先保留正文语义：标题、段落、列表、引用、代码、图片资源优先级最高。
- 样式可降级：复杂 CSS、字体、动画、页面装饰可以降级为普通块级内容。
- 资源可追踪：图片、附件、字体等进入 `AssetStore`，正文只保存 asset 引用。
- 输出要可读：即使目标格式不支持某种结构，也要输出可理解的文本占位或说明。
- 不隐式依赖本地软件：不得要求 Office、LibreOffice、Pandoc、Electron 或 Playwright。

## 当前格式策略

| 格式 | 输入策略 | 输出策略 | 已知降级 |
| --- | --- | --- | --- |
| Markdown | 解析标题、段落、列表、引用、代码、图片、表格 | 从 DocumentModel 序列化为 Markdown | 脚注、复杂内联样式部分保留 |
| HTML | 使用 DOMParser 抽取安全内容块 | 输出自包含 HTML 文档 | CSS 布局、脚本、复杂嵌套结构会降级 |
| TXT | 按空行切段，首段可推断标题 | 输出纯文本 | 所有样式和结构会降级为文本 |
| JSON | 作为结构化代码块导入 | 输出 Trans2Former JSON 包装结构 | 原 JSON 语义不会自动映射为业务文档结构 |
| CSV | 解析为表格块 | 输出表格数据 | 样式、公式不保留 |
| XML | 解析为结构化文本 | 输出结构化 XML | 复杂 schema 可能降级 |
| DOCX | 提取标题、段落、表格、列表、链接、图片、批注、脚注 | 输出 OOXML 结构 | 复杂样式、修订、宏会降级 |
| XLSX | 提取单元格、公式、合并单元格、共享字符串 | 输出 Excel 工作簿 | 图表、宏、条件格式会降级 |
| EPUB | 章节、目录、元数据映射为 DocumentModel | 输出 EPUB 3 结构 | 阅读器私有样式、媒体叠加可能降级 |
| PDF | 文本型 PDF 提取文本和坐标，扫描件 OCR | 程序化生成二进制 PDF，高保真路径保留原始坐标 | 复杂分页、嵌入字体、某些特殊字符会降级 |
| PPTX | 提取幻灯片文本、图片、表格 | 输出 PPTX 幻灯片 | 动画、转场、精确坐标可能降级 |
| PNG | OCR 识别文本 | 不支持 | 仅作输入用于 OCR 提取文本 |
| DOC | best-effort 文本提取（二进制格式） | 不支持 | 复杂结构无法完整提取，建议转为 DOCX |
| OFD | L0 占位实现，基础文本提取 | 不支持 | 实验性支持，结构保留有限 |

## 投影规则（v2 多域模型）

**状态**: 🎯 设计阶段，Phase 5 完成，Phase 6+ 实施

Trans2Former v2 引入多域模型架构，跨域转换时需要通过 mapper 进行投影或提升。

详细设计见 [MULTI_DOMAIN_MODEL_DESIGN.md](../architecture/MULTI_DOMAIN_MODEL_DESIGN.md)。

### WorkbookModel → SemanticDoc

**Mapper**: `WorkbookToSemanticMapper`

**投影逻辑**:
- 每个工作表 → 标题（h2）+ 表格 block
- 公式 → 计算后的值
- 合并单元格 → 普通单元格
- 数字格式 → 纯文本
- 多工作表 → 多个表格 block（扁平化）

**降级说明**:
- 公式丢失（lossy warning）
- 合并单元格丢失（lossy warning）
- 数字格式丢失（lossy warning）
- 工作表结构扁平化（结构降级）

### SemanticDoc → WorkbookModel

**Mapper**: `SemanticToWorkbookMapper`

**提升逻辑**:
- 提取所有 table block
- 每个 table block → 一个工作表
- 非表格内容 → 忽略
- 缺少公式 → 保持空
- 缺少样式 → 默认样式

**降级说明**:
- 非表格内容丢失（info warning）
- 标题、段落、列表丢失（info warning）

### SlideModel → SemanticDoc

**Mapper**: `SlideToSemanticMapper`

**投影逻辑**:
- 每张幻灯片 → 标题（h2）+ 段落
- 文本框 → 段落
- 图片元素 → image block
- 表格元素 → table block
- 空间坐标 → 阅读顺序（从上到下，从左到右）

**降级说明**:
- 布局信息丢失（lossy warning）
- 动画丢失（lossy warning）
- 转场效果丢失（lossy warning）
- 空间坐标转为线性顺序（结构降级）

### SemanticDoc → SlideModel

**Mapper**: `SemanticToSlideMapper`

**提升逻辑**:
- h1/h2 标题 → 幻灯片标题
- 段落 → 内容文本框
- 图片 → 幻灯片图片元素
- table block → 幻灯片表格元素
- 使用默认布局和定位

**降级说明**:
- 使用默认布局（info warning）
- 无动画（info warning）
- 简单文本框定位（info warning）

### FixedLayoutModel → SemanticDoc

**Mapper**: `FixedToSemanticMapper`

**投影逻辑**:
- 页面元素按 Y 坐标排序（从上到下）
- 同行元素按 X 坐标排序（从左到右）
- 重建语义结构（段落、标题）
- 可能需要 OCR 辅助（扫描型 PDF）

**降级说明**:
- 坐标信息丢失（lossy warning）
- 语义重建可能不准确（lossy warning）
- 复杂排版可能错位（lossy warning）
- OCR 识别错误（如果使用 OCR）

### SemanticDoc → FixedLayoutModel

**Mapper**: `SemanticToFixedMapper`

**提升逻辑**:
- 语义内容 → 固定坐标元素
- 保留阅读顺序
- 使用默认排版样式
- 自动分页

**降级说明**:
- 使用默认排版（info warning）
- 使用默认字体（info warning）
- 简单分页逻辑（info warning）

### 质量追溯

所有跨域转换在 `metadata.qualityReport` 中记录：

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

## 降级说明

- **PNG/JPEG 输出已移除**：之前的占位实现不满足真实渲染需求，已从产品矩阵移除。
- **DOC 输入为 best-effort**：仅提取文本内容，复杂格式建议先用 Office 转为 DOCX。
- **OFD 为实验性支持**：L0 级别实现，基础文本提取可用，复杂布局保留有限。
