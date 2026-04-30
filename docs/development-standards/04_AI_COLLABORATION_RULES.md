# AI Collaboration Rules

版本：v0.1.0  
状态：生效  
最后更新：2026-04-26

## 会话启动

AI 开始开发前必须阅读：

- `DEVELOPMENT_TASKS.md`
- `docs/README.md`
- 本轮相关专题文档
- 本目录下相关开发规范

如果任务涉及格式扩展、依赖、插件、远程能力或用户数据，必须同时阅读：

- `docs/RESOURCE_BUDGET.md`
- `docs/SECURITY_POLICY.md`
- `docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md`

## 执行规则

- 直接执行明确任务，不停留在泛泛建议。
- 每次开发结束必须更新 `DEVELOPMENT_TASKS.md`。
- 修改长期方向时，同步更新对应专题文档。
- 不擅自引入重依赖、远程 SDK、遥测、云端文档处理或上传路径。
- 不回滚用户已有改动，除非用户明确要求。

## 输出要求

收尾时必须说明：

- 改了哪些文件
- 完成了哪些任务
- 跑了哪些验证
- 是否有未完成项或风险

## 插件化方向的 AI 约束

- 任何新格式默认先按插件候选处理。
- AI 不得为了快速实现把 heavy format 直接塞进核心路径。
- AI 必须检查新增代码是否影响 `resource-budget-test`。
- 插件可以联网下载代码和资源，但文档处理阶段必须禁联网，不得上传用户文件、文件名、片段、结果或错误详情。

## 变更记录

- v0.1.0：建立 AI 协作启动、执行、输出和插件化约束。
