# Trans2Former Documentation

本目录用于承载开发期的产品、架构、格式、质量和安全文档。根目录文档只保留入口、安装、贡献和任务状态；长期原则和专题设计统一放在这里。

## 推荐阅读顺序

1. [PROJECT_ASSESSMENT_2026-05-03.md](PROJECT_ASSESSMENT_2026-05-03.md)：当前项目评估、问题清单和优化后的阶段方向。
2. [PRODUCT_STRATEGY.md](PRODUCT_STRATEGY.md)：产品边界、市场路线、差异化亮点和数据安全底线。
3. [DESKTOP_APP_ARCHITECTURE.md](DESKTOP_APP_ARCHITECTURE.md)：Tauri 桌面壳、Web-GUI、体验标准、版本控制和本地处理架构。
4. [DESKTOP_RELEASE_PLAN.md](DESKTOP_RELEASE_PLAN.md)：P7 桌面发布、安装包、checksum、平台 smoke 和核心能力发布规则。
5. [CONVERSION_PATHS.md](CONVERSION_PATHS.md)：输入格式到输出格式的产品路径矩阵。
6. [MULTI_MODEL_ARCHITECTURE.md](MULTI_MODEL_ARCHITECTURE.md)：P8 多模型架构（SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel / AssetGraph）。
7. [CONVERSION_ROUTING.md](CONVERSION_ROUTING.md)：P8 Capability Registry + Route Planner，路径矩阵自动派生。
8. [FORMAT_ROADMAP.md](FORMAT_ROADMAP.md)：格式覆盖矩阵、格式优先级和建议执行顺序。
7. [DOCUMENT_MODEL_SCHEMA.md](DOCUMENT_MODEL_SCHEMA.md)：`DocumentModel` 的结构说明。
8. [CONVERSION_POLICY.md](CONVERSION_POLICY.md)：不可逆转换、降级和 warnings 策略。
9. [BASIC_FORMAT_QUALITY.md](BASIC_FORMAT_QUALITY.md)：P0 基础格式 before/after、保真范围和降级说明。
10. [HEAVY_FORMAT_CAPABILITY_NOTES.md](HEAVY_FORMAT_CAPABILITY_NOTES.md)：重格式能力等级、warnings、资源预算和降级路径。
11. [STRUCTURED_EDITING_MODEL.md](STRUCTURED_EDITING_MODEL.md)：桌面 Web-GUI 结构化编辑状态模型。
12. [AI_READY_MARKDOWN.md](AI_READY_MARKDOWN.md)：AI/RAG 友好的 Markdown 输出准则。
13. [SECURITY_POLICY.md](SECURITY_POLICY.md)：本地优先、零云端处理、安全模式和核心内置处理规则。
14. [RESOURCE_BUDGET.md](RESOURCE_BUDGET.md)：核心包体积、依赖和重格式本地模块边界。
17. [DYNAMIC_CHUNKING_MERGE_DESIGN.md](DYNAMIC_CHUNKING_MERGE_DESIGN.md)：超大单文件动态分块与结构化合并设计。
18. [OOXML_CONTAINER.md](OOXML_CONTAINER.md)：ZIP/OOXML 容器基础设施。
19. [DOCX_INPUT_MVP.md](DOCX_INPUT_MVP.md)：DOCX input 支持范围和限制。
20. [XLSX_INPUT_MVP.md](XLSX_INPUT_MVP.md)：XLSX input 支持范围和限制。
21. [EPUB_INPUT_MVP.md](EPUB_INPUT_MVP.md)：EPUB input 支持范围和限制。
22. [PDF_TEXT_EXTRACTION_MVP.md](PDF_TEXT_EXTRACTION_MVP.md)：PDF 文本提取 MVP 支持范围和限制。
23. [PPTX_INPUT_MVP.md](PPTX_INPUT_MVP.md)：PPTX input 支持范围和限制。
24. [P4_OUTPUTS.md](P4_OUTPUTS.md)：DOCX/XLSX/EPUB/PPTX/PDF output 支持范围和限制，以及 PNG/JPEG 输出隐藏规则。
25. [OFD_RESEARCH.md](OFD_RESEARCH.md)：OFD 政务格式高保真攻坚路线、能力等级和样例规则。
26. [PROJECT_ASSESSMENT_2026-04-30.md](PROJECT_ASSESSMENT_2026-04-30.md)：早期项目评估、问题和修复结果。
27. [RELEASE_PREP.md](RELEASE_PREP.md)：GitHub release 准备规则和本地 release 包流程。
28. [development-standards/00_README.md](development-standards/00_README.md)：开发规范体系，覆盖文档、流程、AI 协作、质量门禁和成本资源治理。

## 文档职责

| 文档 | 职责 |
| --- | --- |
| [../README.md](../README.md) | 项目入口、当前能力、运行和验证方式 |
| [../DEVELOPMENT_TASKS.md](../DEVELOPMENT_TASKS.md) | 当前任务看板、阶段状态、下一步开发顺序 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献规则、开发约束、测试要求 |
| [../INSTALL.md](../INSTALL.md) | 安装、运行、验证、故障排除 |
| [../COMMIT_CHECKLIST.md](../COMMIT_CHECKLIST.md) | 提交前检查 |
| [../CHANGELOG.md](../CHANGELOG.md) | 已发生的变更记录 |
| [PROJECT_ASSESSMENT_2026-05-03.md](PROJECT_ASSESSMENT_2026-05-03.md) | 当前项目评估、问题清单和优化后的开发方向 |
| [BASIC_FORMAT_QUALITY.md](BASIC_FORMAT_QUALITY.md) | P0 基础格式质量、样例和可解释降级 |
| [CONVERSION_PATHS.md](CONVERSION_PATHS.md) | 输入到输出的产品路径矩阵 |
| [MULTI_MODEL_ARCHITECTURE.md](MULTI_MODEL_ARCHITECTURE.md) | P8 多模型架构：五个规范模型 + 共享资产图 |
| [CONVERSION_ROUTING.md](CONVERSION_ROUTING.md) | P8 Capability Registry + Route Planner |
| [HEAVY_FORMAT_CAPABILITY_NOTES.md](HEAVY_FORMAT_CAPABILITY_NOTES.md) | 重格式 capability note、fixture 分层和 P4/P6 回归入口 |
| [DESKTOP_APP_ARCHITECTURE.md](DESKTOP_APP_ARCHITECTURE.md) | 桌面 Web-GUI 架构、体验标准、模块、权限和版本策略 |
| [DESKTOP_RELEASE_PLAN.md](DESKTOP_RELEASE_PLAN.md) | P7 桌面安装包、平台 smoke、自动更新、文件关联和核心能力发布规则 |
| [STRUCTURED_EDITING_MODEL.md](STRUCTURED_EDITING_MODEL.md) | P1 结构化编辑状态模型 |
| [AI_READY_MARKDOWN.md](AI_READY_MARKDOWN.md) | AI-ready Markdown 输出准则 |
| [OOXML_CONTAINER.md](OOXML_CONTAINER.md) | ZIP/OOXML 容器基础设施 |
| [DOCX_INPUT_MVP.md](DOCX_INPUT_MVP.md) | DOCX input |
| [XLSX_INPUT_MVP.md](XLSX_INPUT_MVP.md) | XLSX input |
| [EPUB_INPUT_MVP.md](EPUB_INPUT_MVP.md) | EPUB input |
| [PDF_TEXT_EXTRACTION_MVP.md](PDF_TEXT_EXTRACTION_MVP.md) | PDF 文本提取 MVP |
| [PPTX_INPUT_MVP.md](PPTX_INPUT_MVP.md) | PPTX input |
| [P4_OUTPUTS.md](P4_OUTPUTS.md) | P4 output |
| [PROJECT_ASSESSMENT_2026-04-30.md](PROJECT_ASSESSMENT_2026-04-30.md) | 早期项目评估和修复记录 |
| [RELEASE_PREP.md](RELEASE_PREP.md) | GitHub release 准备规则 |
| [development-standards/00_README.md](development-standards/00_README.md) | 开发规范、任务流程、质量门禁和成本资源治理 |
| [OFD_RESEARCH.md](OFD_RESEARCH.md) | OFD 高保真攻坚路线、能力等级、样例和安全准入 |

## 归档文档

历史审计、一次性修复记录和已经被专题文档吸收的材料统一放入 `docs/archive/`，不再堆在项目根目录。当前格式合规历史材料位于 [archive/format-compliance/](archive/format-compliance/)；日常开发优先阅读 `CONVERSION_PATHS.md`、`FORMAT_ROADMAP.md`、`BASIC_FORMAT_QUALITY.md` 和 `HEAVY_FORMAT_CAPABILITY_NOTES.md`。

## 维护规则

- 新增长期产品原则、架构决策或格式规划时，优先更新 `docs/` 专题文档。
- `DEVELOPMENT_TASKS.md` 只记录可执行任务，不堆放长篇背景说明。
- README 只保留用户和开发者快速入口，不复制完整路线图。
- 修改支持格式、安全边界、资源预算、测试命令或运行方式时，同步更新相关专题文档和任务看板。
- 核心模块化、热门基础格式免下载、本地按需加载、资源治理等开发规则统一维护在 `docs/development-standards/`。
