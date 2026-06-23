# docs/ 目录进一步整理方案

## 当前问题

docs/ 根目录仍有 **34 个技术文档**，虽然已经比根目录的 40 个好很多，但仍然：
- 难以快速找到关键文档
- 缺乏清晰的分类
- 混合了不同层次的文档

## 整理方案

### 目标结构

```
docs/
├── README.md                           # 文档导航索引
│
├── product/                            # 📦 产品和需求（5 个）
│   ├── PRODUCT_STRATEGY.md
│   ├── CONVERSION_PATHS.md
│   ├── FORMAT_ROADMAP.md
│   ├── CONVERSION_POLICY.md
│   └── MARKET_RESEARCH_2026-04-26.md
│
├── architecture/                       # 🏗️ 架构设计（7 个）
│   ├── MULTI_MODEL_ARCHITECTURE.md
│   ├── CONVERSION_ROUTING.md
│   ├── DESKTOP_APP_ARCHITECTURE.md
│   ├── DYNAMIC_CHUNKING_MERGE_DESIGN.md
│   ├── OOXML_CONTAINER.md
│   ├── STRUCTURED_EDITING_MODEL.md
│   └── RESOURCE_BUDGET.md
│
├── formats/                            # 📄 格式支持（11 个）
│   ├── BASIC_FORMAT_QUALITY.md
│   ├── HEAVY_FORMAT_CAPABILITY_NOTES.md
│   ├── DOCUMENT_MODEL_SCHEMA.md
│   ├── DOCX_INPUT_MVP.md
│   ├── XLSX_INPUT_MVP.md
│   ├── PPTX_INPUT_MVP.md
│   ├── EPUB_INPUT_MVP.md
│   ├── PDF_TEXT_EXTRACTION_MVP.md
│   ├── P4_OUTPUTS.md
│   ├── OFD_RESEARCH.md
│   └── AI_READY_MARKDOWN.md
│
├── security/                           # 🔒 安全策略（1 个）
│   └── SECURITY_POLICY.md
│
├── research/                           # 🔬 研究文档（3 个）
│   ├── MARKITDOWN_RESEARCH.md
│   ├── MARKITDOWN_FORMAT_COVERAGE.md
│   └── PP_OCRV5_BROWSER_VERIFICATION.md
│
├── assessments/                        # 📊 项目评估（3 个）
│   ├── PROJECT_ASSESSMENT_2026-05-27.md
│   ├── PROJECT_ASSESSMENT_2026-05-03.md
│   └── PROJECT_ASSESSMENT_2026-04-30.md
│
├── operations/                         # 🚀 运维和发布（3 个）
│   ├── DESKTOP_RELEASE_PLAN.md
│   ├── RELEASE_PREP.md
│   └── VISUAL_COMPARISON_PLAN.md
│
├── development/                        # 💻 开发文档（已有）
├── release/                            # 📋 发布文档（已有）
├── checklists/                         # ✅ 检查清单（已有）
├── reports/                            # 📝 项目报告（已有）
├── setup/                              # ⚙️ 设置指南（已有）
├── i18n/                               # 🌍 多语言（已有）
└── archived/                           # 📦 归档（已有）
```

### 整理效果

**整理前**：
- docs/ 根目录：34 个文档
- 子目录：74 个文档

**整理后**：
- docs/ 根目录：1 个（README.md）
- 子目录分类：15 个目录，107 个文档

### 移动规则

#### product/ - 产品和需求（5 个）
```
PRODUCT_STRATEGY.md
CONVERSION_PATHS.md
FORMAT_ROADMAP.md
CONVERSION_POLICY.md
MARKET_RESEARCH_2026-04-26.md
```

#### architecture/ - 架构设计（7 个）
```
MULTI_MODEL_ARCHITECTURE.md
CONVERSION_ROUTING.md
DESKTOP_APP_ARCHITECTURE.md
DYNAMIC_CHUNKING_MERGE_DESIGN.md
OOXML_CONTAINER.md
STRUCTURED_EDITING_MODEL.md
RESOURCE_BUDGET.md
```

#### formats/ - 格式支持（11 个）
```
BASIC_FORMAT_QUALITY.md
HEAVY_FORMAT_CAPABILITY_NOTES.md
DOCUMENT_MODEL_SCHEMA.md
DOCX_INPUT_MVP.md
XLSX_INPUT_MVP.md
PPTX_INPUT_MVP.md
EPUB_INPUT_MVP.md
PDF_TEXT_EXTRACTION_MVP.md
P4_OUTPUTS.md
OFD_RESEARCH.md
AI_READY_MARKDOWN.md
```

#### security/ - 安全策略（1 个）
```
SECURITY_POLICY.md
```

#### research/ - 研究文档（3 个）
```
MARKITDOWN_RESEARCH.md
MARKITDOWN_FORMAT_COVERAGE.md
PP_OCRV5_BROWSER_VERIFICATION.md
```

#### assessments/ - 项目评估（3 个）
```
PROJECT_ASSESSMENT_2026-05-27.md
PROJECT_ASSESSMENT_2026-05-03.md
PROJECT_ASSESSMENT_2026-04-30.md
```

#### operations/ - 运维和发布（3 个）
```
DESKTOP_RELEASE_PLAN.md
RELEASE_PREP.md
VISUAL_COMPARISON_PLAN.md
```

---

**创建日期**: 2026-06-23  
**执行者**: Claude Opus 4.8
