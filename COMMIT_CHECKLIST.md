# Trans2Former Browser-First Checklist

## 当前提交前检查

- [ ] `npm install` 可完成依赖安装。
- [ ] `npm test` 可通过浏览器端转换核心 smoke test。
- [ ] `npm run release:prepare` 可生成本地 `release/trans2former-2.0.0/`。
- [ ] `npm start` 可启动 Web 应用。
- [ ] 浏览器可访问 `http://localhost:3000`。
- [ ] 浏览器可访问 `http://localhost:3000/smoke-test.html`。
- [ ] 浏览器端可完成 Markdown / HTML / TXT / JSON / CSV / XML 基础互转，并可导入 PNG 资源。
- [ ] 基础格式解析改动已同步 samples、snapshots、warnings 和 [docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)。
- [ ] 错误详情面板显示结构化错误，并且复制诊断不包含用户文档正文、title 或 stack。
- [ ] 没有新增人为固定上传大小上限；如涉及文件读取，已考虑分片/流式/Worker 路线。
- [ ] 如果进行了动态分块转换，直接转换 vs 分块转换的 blocks、assets、warnings、metadata 和输出快照没有不可解释差异。
- [ ] 如果进行了代码水平拆分，拆分前后样例、快照、warnings、assets 和错误分类没有退化。
- [ ] README 与安装文档不再描述桌面应用发布。
- [ ] 不引入 Office、LibreOffice、Pandoc 等本地办公软件依赖。
- [ ] 不引入上传、遥测、远程转换、远程 OCR、远程转写、远程 AI 或分析 SDK。
- [ ] 不把 PDF/OCR/Office/AI 等重依赖加入默认 dependencies 或核心路径。
- [ ] 新增重格式或可选能力时，已按模块插件处理，并提供 manifest、资源预算和失败降级说明。
- [ ] 新增基础免下载格式时，已证明属于高频轻量格式，且未突破默认资源预算。

## 架构约束

- 应用形态以浏览器 Web 为主。
- 转换核心逐步迁移到浏览器端 JavaScript、Web Worker、WASM、Canvas、ZIP/XML 和 File API。
- 产品目标是不设置人为上传大小上限；大文件能力必须通过分片、流式、Worker、渐进预览和资源释放实现。
- 动态分块转换必须以语义 chunk、partial DocumentModel、merge planner 和等价性测试保证合并结果不降质。
- 代码水平拆分必须以 `DocumentModel`、样例、快照、schema 和质量基准作为边界合同。
- 服务端只作为过渡期 Web/API 容器，最终应能收敛为静态托管。
- 后期 GUI/PWA/桌面外壳必须复用 Web 核心，并保持本地优先和数据安全底线。
- 默认 `local-only`，文档处理阶段禁联网，不提供云端文档处理。
- 默认包遵守 [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)，重格式和可选增强必须通过模块插件按需下载或加载。
- 成本、资源和模块插件治理遵守 [docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md](docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md)。

## 发布检查

- [ ] 更新 `DEVELOPMENT_TASKS.md` 中已完成阶段。
- [ ] 每次开发结束后已同步更新任务列表。
- [ ] 长期原则、格式矩阵和架构说明没有继续堆入 `DEVELOPMENT_TASKS.md`，已放入 `docs/` 专题文档。
- [ ] 若改动涉及定位、测试、安全、格式支持或运行方式，已同步更新 README、INSTALL、CONTRIBUTING、CHANGELOG 和相关 docs。
- [ ] 若准备上传 GitHub 或发布 release，已检查 [docs/RELEASE_PREP.md](docs/RELEASE_PREP.md) 和本地 `release/` 包。
- [ ] 检查 `rg -n "Electron|electron|Playwright|playwright|desktop|exe|portable" .` 不包含当前运行依赖说明。
- [ ] 检查 `npm test` 包含 local security test，且没有新增默认网络发送路径。
- [ ] 检查 `npm test` 包含 resource budget test，且核心包体积和默认依赖未超预算。
- [ ] 若涉及插件方向，已同步更新 `docs/development-standards/`、资源预算和格式路线。
- [ ] 记录仍处于过渡期的能力，例如当前 PDF 依赖浏览器打印。
