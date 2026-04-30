# Project Assessment 2026-04-30

状态：已执行

## 评估范围

- 仓库结构和 GitHub 上传准备
- 当前测试链路
- `DocumentModel` / schema / formatter 管线
- P1：质量审计层、source span、warnings、chunked equivalence
- release 包准备能力

## 发现的问题与处理

| 问题 | 风险 | 处理结果 |
| --- | --- | --- |
| P1 只有任务规划，缺少运行时审计层 | 后续重格式无法可靠追踪来源、warnings 和质量降级 | 新增 `public/core/document-audit.js`，统一补 block id、source span、block warnings、asset provenance、conversion metadata 和 quality report |
| `metadata.warnings` 只停留在格式局部 | UI 和后续质量报告无法统一汇总 | 统一 warnings 进入 `metadata.warnings`，block-level warnings 可参与 quality report 汇总 |
| 缺少 direct vs chunked equivalence 基线 | 超大文件动态分块无法证明不降质 | 新增 `public/core/chunking.js`，提供 line chunk、partial merge、equivalence comparison，并加入 smoke test |
| JSON 输出缺少 metadata | 无法从 JSON 产物审计转换过程 | JSON 输出加入 `metadata`，快照同步更新 |
| PNG asset 缺少 provenance，且 title 带 `.png` 时会生成重复扩展名 | 资源来源不可追踪，文件名不干净 | asset provenance 由 audit 层补齐，PNG fallback name 避免 `.png.png` |
| JSON Schema 未覆盖 P1 字段 | 文档与运行时模型不一致 | `docs/document-model.schema.json` 已同步 `id/sourceSpan/warnings/provenance/metadata` |
| release 准备不可验证 | 上传 GitHub 后发布素材容易漂移 | 新增 `docs/RELEASE_PREP.md`、`scripts/prepare-release.js`、release readiness test 和本地 `release/trans2former-2.0.0/` |

## 当前风险

- P1 的 source span 是基于文本搜索的基础实现，对复杂 HTML/XML/重格式后续需要按 parser token/source map 升级。
- quality report 当前是 P1 MVP，适合做统一入口，不等于最终行业级评分系统。
- release 包当前是目录包，不是压缩包；GitHub release 上传前可基于该目录再打包。

## 验收

- `npm test` 已覆盖核心 smoke、快照、浏览器静态入口、本地安全、资源预算、release readiness。
- `npm run release:prepare` 已生成本地 release 包。
