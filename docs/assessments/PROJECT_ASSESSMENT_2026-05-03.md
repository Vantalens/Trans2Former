# Project Assessment 2026-05-03

状态：历史归档

> 历史评估：本文反映 2026-05-03 的插件路线阶段。当前生效评估请阅读 [PROJECT_ASSESSMENT_2026-05-27.md](PROJECT_ASSESSMENT_2026-05-27.md)；自 2026-05-24 起，插件产品路线已取消，增强能力改为核心本地模块。

## 当前结论

Trans2Former 已经从“浏览器转换 demo”推进到可验证的本地优先桌面工作台底座：

- P0 桌面壳和 Web-GUI 工作台骨架已完成。
- P1 编辑、预览、版本、diff 和 warnings resolved 闭环已完成。
- P2 低内存与响应核心链路已完成，剩余 Asset lazy-load 属于优化项。
- P3 插件安全策略、GUI 管理入口和核心运行时已完成。
- 当前测试链路覆盖转换、快照、浏览器入口、桌面壳、安全、资源预算、插件安全、P2 响应、P3 运行时和 release readiness。

当前最大风险已经从“基础能力缺失”转为“架构债和路线分叉”：

1. `public/app.js` 承载过多工作台状态、预览、编辑、插件和队列逻辑，继续堆功能会降低可靠性。
2. 插件运行时目前是核心策略和 GUI 管理层，还不是执行第三方插件代码的真实沙箱加载器。
3. 重格式能力已经进入基础包，但公开样例、capability note、复杂文档质量回归不足。
4. Tauri 桌面方向已跑通 dev 壳，但还缺安装包、签名、自动更新、桌面文件系统集成和平台 smoke。
5. OFD、高保真 PDF/DOCX、本地 OCR/layout/table 是差异化壁垒，但必须走插件化样例驱动路线，不能直接塞进核心包。

## 已发现问题

| 问题 | 风险 | 优化方向 |
| --- | --- | --- |
| 工作台逻辑集中在 `public/app.js` | 后续任务中心、插件和大文件能力会互相影响，测试只能做字符串检查 | P4 前先拆分 workbench state、preview renderer、plugin manager、queue manager |
| P4/P5 边界不够清晰 | 容易继续“堆格式”，忽略质量回归和插件加载器 | P4 聚焦质量基线和模块拆分，P5 聚焦真实插件沙箱，P6 聚焦高保真/OFD |
| 重格式缺公开样例和 capability note | 无法证明“支持”到什么程度，用户看不到降级边界 | 每个重格式必须有样例、快照、warnings、资源预算和支持范围说明 |
| 插件运行时还未执行真实插件包 | 只能证明策略，不足以承载 OFD/OCR 等实际插件 | 建立 Worker/WASM 沙箱加载器、插件包格式、fixture 插件和崩溃隔离测试 |
| 桌面发布链路仍是预览包 | 不能称为成熟 PC 桌面产品 | 新增 P7 桌面发布和平台化路线，单独处理安装、签名、更新和平台 smoke |
| 文档状态有旧结论 | 任务看板和架构文档容易误导下一轮开发 | 用本评估同步任务路线，并把旧不足改为当前不足 |

## 优化后的开发方向

### P4：架构收敛与质量基线

P4 不再继续扩格式，而是把已完成的核心能力整理成可长期维护的结构：

- 拆分 `public/app.js` 的工作台职责。
- 为 DOCX/XLSX/PPTX/EPUB/PDF/PNG input 建立 capability note；PNG/JPEG 输出未达标前保持隐藏。
- 建立公开样例库、快照和质量报告基线。
- 补 Asset lazy-load 和大文件样例验证。
- 把 “支持格式” 从简单勾选升级为“质量等级 + 降级说明 + 回归样例”。

### P5：真实插件加载器

P5 聚焦把 P3 的策略运行时升级为真实插件执行能力：

- 定义插件包结构和本地导入流程。
- 在 Worker 中加载 fixture 插件，处理阶段禁联网。
- 插件崩溃、超时、资源超限必须隔离。
- GUI 必须展示插件能力、权限、预算、fallback 和启用状态。
- 插件不得读取文档以外的本地文件，不得上传或联网。

### P6：高保真与 OFD 攻坚

P6 开始攻坚差异化能力，但必须样例驱动：

- OFD-L0 到 OFD-L4 按公开样例推进。
- 高保真 DOCX/PDF 输出必须有视觉/结构回归。
- 本地 OCR/layout/table 只能作为手动安装插件。
- 不以“能跑”为验收，必须以质量报告、warnings 和可解释降级为验收。

### P7：桌面发布与产品化

P7 单独处理成熟桌面产品事项：

- Tauri 安装包、签名、自动更新和发布资产。
- Windows/macOS/Linux 平台 smoke。
- 桌面文件关联、最近文件、项目保存和导出目录权限。
- 发布包不是当前 `release/trans2former-2.0.0/` Web-GUI preview 包。

## 下一轮优先级

推荐顺序：

1. P4-A：拆分 `public/app.js`，让后续开发有清晰模块边界。
2. P4-B：补齐重格式 capability note 和公开样例回归。
3. P5-A：实现最小 fixture 插件包和 Worker 沙箱加载器。
4. P6-A：开始 OFD-L0 容器/manifest/metadata 读取。
5. P7-A：建立桌面 release plan，不急于发布，但先把安装包路线写清。

## 验收策略

后续每阶段必须继续通过：

- `npm test`
- `git diff --check`
- `npm run release:prepare`
- `git check-ignore -v release\trans2former-2.0.0\RELEASE_MANIFEST.json`

新增 P4/P5/P6/P7 任务时必须同步更新 `DEVELOPMENT_TASKS.md`、对应 docs 和测试脚本。
