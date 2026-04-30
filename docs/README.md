# Trans2Former Documentation

本目录用于承载开发期的产品、架构、格式、质量和安全文档。根目录文档只保留入口、安装、贡献和任务状态；长期原则和专题设计统一放在这里。

## 推荐阅读顺序

1. [PRODUCT_STRATEGY.md](PRODUCT_STRATEGY.md)：产品边界、市场路线、差异化亮点和数据安全底线。
2. [FORMAT_ROADMAP.md](FORMAT_ROADMAP.md)：格式覆盖矩阵、格式优先级和建议执行顺序。
3. [DOCUMENT_MODEL_SCHEMA.md](DOCUMENT_MODEL_SCHEMA.md)：`DocumentModel` 的结构说明。
4. [CONVERSION_POLICY.md](CONVERSION_POLICY.md)：不可逆转换、降级和 warnings 策略。
5. [BASIC_FORMAT_QUALITY.md](BASIC_FORMAT_QUALITY.md)：P0 基础格式 before/after、保真范围和降级说明。
6. [STRUCTURED_EDITING_MODEL.md](STRUCTURED_EDITING_MODEL.md)：网页端结构化编辑状态模型。
7. [AI_READY_MARKDOWN.md](AI_READY_MARKDOWN.md)：AI/RAG 友好的 Markdown 输出准则。
8. [SECURITY_POLICY.md](SECURITY_POLICY.md)：本地优先、零云端处理、安全模式和插件隔离规则。
9. [PLUGIN_SECURITY_MODEL.md](PLUGIN_SECURITY_MODEL.md)：插件 manifest、权限隔离、no-network processing 和完整性校验。
10. [RESOURCE_BUDGET.md](RESOURCE_BUDGET.md)：核心包体积、依赖和重格式插件化边界。
11. [DYNAMIC_CHUNKING_MERGE_DESIGN.md](DYNAMIC_CHUNKING_MERGE_DESIGN.md)：超大单文件动态分块与结构化合并设计。
12. [OOXML_CONTAINER.md](OOXML_CONTAINER.md)：ZIP/OOXML 容器基础设施。
13. [DOCX_INPUT_MVP.md](DOCX_INPUT_MVP.md)：DOCX input 支持范围和限制。
14. [XLSX_INPUT_MVP.md](XLSX_INPUT_MVP.md)：XLSX input 支持范围和限制。
15. [EPUB_INPUT_MVP.md](EPUB_INPUT_MVP.md)：EPUB input 支持范围和限制。
16. [PDF_TEXT_EXTRACTION_MVP.md](PDF_TEXT_EXTRACTION_MVP.md)：PDF 文本提取 MVP 支持范围和限制。
17. [PPTX_INPUT_MVP.md](PPTX_INPUT_MVP.md)：PPTX input 支持范围和限制。
18. [OFD_RESEARCH.md](OFD_RESEARCH.md)：OFD 政务格式远期研究和准入路线。
19. [PROJECT_ASSESSMENT_2026-04-30.md](PROJECT_ASSESSMENT_2026-04-30.md)：当前项目评估、问题和修复结果。
20. [RELEASE_PREP.md](RELEASE_PREP.md)：GitHub release 准备规则和本地 release 包流程。
21. [development-standards/00_README.md](development-standards/00_README.md)：开发规范体系，覆盖文档、流程、AI 协作、质量门禁和成本资源治理。

## 文档职责

| 文档 | 职责 |
| --- | --- |
| [../README.md](../README.md) | 项目入口、当前能力、运行和验证方式 |
| [../DEVELOPMENT_TASKS.md](../DEVELOPMENT_TASKS.md) | 当前任务看板、阶段状态、下一步开发顺序 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献规则、开发约束、测试要求 |
| [../INSTALL.md](../INSTALL.md) | 安装、运行、验证、故障排除 |
| [../COMMIT_CHECKLIST.md](../COMMIT_CHECKLIST.md) | 提交前检查 |
| [../CHANGELOG.md](../CHANGELOG.md) | 已发生的变更记录 |
| [BASIC_FORMAT_QUALITY.md](BASIC_FORMAT_QUALITY.md) | P0 基础格式质量、样例和可解释降级 |
| [STRUCTURED_EDITING_MODEL.md](STRUCTURED_EDITING_MODEL.md) | P1 结构化编辑状态模型 |
| [AI_READY_MARKDOWN.md](AI_READY_MARKDOWN.md) | AI-ready Markdown 输出准则 |
| [PLUGIN_SECURITY_MODEL.md](PLUGIN_SECURITY_MODEL.md) | P2 插件安全模型 |
| [plugin-manifest.schema.json](plugin-manifest.schema.json) | 插件 manifest JSON Schema |
| [OOXML_CONTAINER.md](OOXML_CONTAINER.md) | ZIP/OOXML 容器基础设施 |
| [DOCX_INPUT_MVP.md](DOCX_INPUT_MVP.md) | DOCX input |
| [XLSX_INPUT_MVP.md](XLSX_INPUT_MVP.md) | XLSX input |
| [EPUB_INPUT_MVP.md](EPUB_INPUT_MVP.md) | EPUB input |
| [PDF_TEXT_EXTRACTION_MVP.md](PDF_TEXT_EXTRACTION_MVP.md) | PDF 文本提取 MVP |
| [PPTX_INPUT_MVP.md](PPTX_INPUT_MVP.md) | PPTX input |
| [PROJECT_ASSESSMENT_2026-04-30.md](PROJECT_ASSESSMENT_2026-04-30.md) | 当前项目评估和修复记录 |
| [RELEASE_PREP.md](RELEASE_PREP.md) | GitHub release 准备规则 |
| [development-standards/00_README.md](development-standards/00_README.md) | 开发规范、任务流程、质量门禁和成本资源治理 |
| [OFD_RESEARCH.md](OFD_RESEARCH.md) | OFD 远期研究、风险和安全准入 |

## 维护规则

- 新增长期产品原则、架构决策或格式规划时，优先更新 `docs/` 专题文档。
- `DEVELOPMENT_TASKS.md` 只记录可执行任务，不堆放长篇背景说明。
- README 只保留用户和开发者快速入口，不复制完整路线图。
- 修改支持格式、安全边界、资源预算、测试命令或运行方式时，同步更新相关专题文档和任务看板。
- 模块化插件、热门基础格式免下载、按需下载、资源治理等开发规则统一维护在 `docs/development-standards/`。
