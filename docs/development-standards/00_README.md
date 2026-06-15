# Development Standards

版本：v0.1.0  
状态：生效  
最后更新：2026-04-26

## 定位

本目录是 Trans2Former 的开发规范体系，参考 `StandardDucument` 的个人开发者规范和文档维护 SOP，并按本项目的桌面 Web-GUI、本地优先、模块插件化方向做了裁剪。

根目录文档只做入口和任务状态；开发规范、AI 协作、质量门禁、资源治理和模块插件规则统一放在本目录。

## 推荐阅读顺序

1. [01_DOCUMENTATION_RULES.md](01_DOCUMENTATION_RULES.md)：文档编写、命名、版本和维护规则。
2. [02_DEVELOPMENT_WORKFLOW.md](02_DEVELOPMENT_WORKFLOW.md)：开发流程、任务推进和收尾要求。
3. [03_TASK_AND_PROGRESS_RULES.md](03_TASK_AND_PROGRESS_RULES.md)：任务拆分、验收、回滚和 progress 规则。
4. [04_AI_COLLABORATION_RULES.md](04_AI_COLLABORATION_RULES.md)：AI 协作边界、启动和收尾规则。
5. [05_QUALITY_GATES.md](05_QUALITY_GATES.md)：测试、安全、资源和发布门禁。
6. [06_SECURITY_AND_LOCAL_FIRST.md](06_SECURITY_AND_LOCAL_FIRST.md)：用户数据安全、本地优先、零云端处理和模型缓存边界。
7. [07_COST_AND_RESOURCE_GOVERNANCE.md](07_COST_AND_RESOURCE_GOVERNANCE.md)：依赖、包体积、热门基础格式、核心内置模块和成本治理规则。
8. [08_TEMPLATES.md](08_TEMPLATES.md)：任务、progress、lessons、变更记录模板。

## 维护规则

- 同一规则只能有一个主来源；跨文档只引用，不复制长段内容。
- 修改支持格式、插件加载、安全边界、资源预算或测试命令时，必须同步更新 `DEVELOPMENT_TASKS.md` 和相关专题文档。
- 每次开发结束必须更新任务看板；如果出现重复错误，还要更新 `lessons` 或对应规范。
- 文档变更必须包含明确的版本、状态、最后更新时间和变更记录。

## 主方向

Trans2Former 采用模块化设计：核心包保持小而可用，内置热门基础格式，按用户需求下载或加载重格式和可选能力模块插件。目标是降低默认资源占用、避免 `18 * 18` 转换路线膨胀，同时保证常见转换无需下载即可使用。
