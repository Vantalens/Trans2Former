# 贡献指南

Trans2Former 当前是浏览器优先的 Web 应用。贡献代码时请保持这个方向：不要新增 Electron、Playwright、Office、LibreOffice、Pandoc 或其他本地转换软件作为运行依赖。

核心底线：用户数据本地处理、零上传。不要上传文档、文件名、文档片段、转换结果、错误详情或用户编辑内容；不要接入云端文档处理、远程转换、远程 OCR、远程转写或远程 AI 增强。

## 开发

```bash
npm install
npm start
```

打开：

```text
http://localhost:3000
```

## 文档结构

- [README.md](README.md)：项目入口、当前能力、运行和验证方式。
- [DEVELOPMENT_TASKS.md](DEVELOPMENT_TASKS.md)：当前任务看板，只放可执行任务和阶段状态。
- [docs/README.md](docs/README.md)：开发文档总目录。
- [docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)：产品原则、市场路线和安全底线。
- [docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)：格式覆盖矩阵和新增格式准入规则。
- [docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)：P0 基础格式质量、before/after 和降级说明。
- [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)：本地优先、零云端处理和插件隔离规则。
- [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)：核心包体积和依赖预算。
- [docs/PROJECT_ASSESSMENT_2026-04-30.md](docs/PROJECT_ASSESSMENT_2026-04-30.md)：项目评估和修复记录。
- [docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)：GitHub release 准备流程。
- [docs/development-standards/00_README.md](docs/development-standards/00_README.md)：开发规范体系。
- [docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md](docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md)：成本、资源、热门基础格式和模块插件治理规则。

## 项目结构

```text
public/
  app.js                  浏览器端界面逻辑
  browser-transformer.js  浏览器端转换核心
  index.html              主页面
  styles.css              页面样式
src/
  server.js               启动静态 Web 服务
  web-server.js           Express 静态资源容器
```

## 贡献规则

- 转换逻辑优先放在浏览器端模块中。
- 大文件、压缩包、图片处理等耗时任务后续应迁移到 Web Worker。
- 新增格式时，先设计中间模型，再做输入/输出适配器。
- 新增高频轻量格式时，可评估进入 `format-basic`，但必须通过体积、安全和质量门禁，保证免下载体验不破坏资源预算。
- 新增重格式或可选能力时，默认按模块插件处理；用户需要时再下载或加载，不能进入核心包默认路径。
- 可以进行代码水平拆分，但必须保持 `input -> DocumentModel -> output` 语义一致，拆分前后快照不能退化。
- 处理超大单文件时，优先设计动态分块转换与结构化合并，不允许为了分块速度牺牲最终转换效果。
- 不提交生成产物、缓存、日志或本地构建输出。
- 修改 UI 后要验证上传、预览、转换、下载、PDF 打印路径和错误详情面板。
- 修改任务、定位、安全策略、测试命令或支持格式后，必须同步更新 `README.md`、`DEVELOPMENT_TASKS.md`、`INSTALL.md`、`COMMIT_CHECKLIST.md` 和必要的 `docs/` 专题文档。
- 涉及发布准备或 GitHub 上传前检查时，必须同步 `docs/RELEASE_PREP.md` 并运行 `npm run release:prepare`。
- 不把长期产品原则、格式矩阵或架构说明继续堆入 `DEVELOPMENT_TASKS.md`；这些内容应放入 `docs/PRODUCT_STRATEGY.md`、`docs/FORMAT_ROADMAP.md` 或对应专题文档。
- 每次开发结束必须更新 `DEVELOPMENT_TASKS.md`。

## 数据安全要求

- 默认不得引入 `fetch`、`XMLHttpRequest`、`sendBeacon`、`WebSocket`、远程转换 API、云端 OCR、云端 AI、遥测 SDK 或分析 SDK。
- 默认不得把文档正文、转换结果、错误原文写入 localStorage、IndexedDB 或日志。
- 插件安装可以联网下载插件代码；文档处理阶段必须禁联网。
- 远程 OCR、远程转写、远程 AI 增强明确不做。
- 错误详情复制必须脱敏，只包含 category/code/format/message/warnings。
- 任何违反本地优先路线的改动都必须先更新安全策略并增加测试。

## 资源预算要求

- 默认依赖必须保持少量；PDF/OCR/Office/AI/云端 SDK 不得进入默认 dependencies。
- 基础包必须保持小而可用，热门轻量格式可内置免下载。
- 重格式应放入模块插件、按需加载目录或后续独立包。
- 新增格式前先判断属于 `format-basic`、`format-plugin` 还是 `optional-plugin`。
- 插件必须有 manifest，声明格式能力、体积预算、依赖、安全模式、加载方式和失败降级路径。
- 如果必须提高资源预算，先更新 [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)，并解释原因。

## 动态分块与代码拆分要求

- 单个超大文件应优先按语义边界拆分，例如章节、段落、表格、页、幻灯片、工作表、XML/HTML 节点或 ZIP entry。
- 每个 chunk 应转换为 partial `DocumentModel`，再由 merge planner 合并为全局 `DocumentModel`。
- 分块转换必须提供与直接转换的等价性测试，至少比较 blocks、assets、warnings 和输出快照。
- 拆 format adapter 时，同步维护 samples、snapshots、capability note 和 warnings。
- 修改基础格式解析时，同步更新 [docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md) 和对应 smoke/snapshot。
- 拆 Worker 或 pipeline 时，保持 read / parse / validate / convert / render / package 阶段语义。
- 拆 UI 时，上传、预览、输出、错误详情、进度条和下载路径必须继续通过 browser smoke test。
- 不允许为了模块化或分块转换绕过 `DocumentModel`、破坏语义结构或删除降级说明。
- 拆分前先补覆盖，拆分后跑完整 `npm test`。

## 测试

```bash
npm test
```

当前测试包括核心转换 smoke、转换快照、浏览器自检静态服务检查、本地安全 smoke test、资源预算 smoke test。

## PPTX 方向

PPTX 支持应优先走浏览器端可编辑对象路线，例如 Schema/PresentationModel -> PPTX。可以参考外部 PPT skill 的 schema 思路，但不要把 Python/Playwright 脚本引入为运行时依赖。
