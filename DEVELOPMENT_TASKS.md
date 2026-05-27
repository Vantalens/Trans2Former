# Trans2Former Development Tasks

最后更新：2026-05-27

维护规则：

- 每次开发结束更新本文件。
- 本文件只放当前阶段状态、下一步执行顺序和近期验收修复。
- 已完成阶段保留状态行，详细子任务清单归档到 [docs/archive/DEVELOPMENT_HISTORY.md](docs/archive/DEVELOPMENT_HISTORY.md)。
- 长期原则、格式矩阵、架构说明放入 `docs/` 专题文档。
- 验收修复滚动归档：超过 4 周或下一里程碑发布后，从本文件挪到归档。
- 修改定位、安全边界、支持格式、测试命令或运行方式时，同步更新 README、CONTRIBUTING、INSTALL、COMMIT_CHECKLIST、CHANGELOG 和相关 docs。

## 当前方向

> Trans2Former Desktop：基于 Tauri + Web-GUI 的专业级、本地优先、零上传、多格式、高质量桌面格式转换工作台。

- 当前 Web 应用继续作为转换核心和 GUI 验证底座，最终面向桌面体验。
- 桌面形态采用 Tauri，不依赖 Office、LibreOffice、Pandoc、云端转换或 OCR/AI。
- 转换核心围绕 `input -> canonical model -> executed mapper route -> QualityReport / Warnings -> output`，避免 N×N 私有路径；兼容期保留 `DocumentModel` 外壳，但不得用它掩盖专属模型的实际损失。
- 热门基础格式必须免下载可用；高保真、OFD、本地 OCR/layout/table 全部进入核心本地模块，不再提供插件安装。
- 文档处理、预览、编辑和导出阶段必须禁联网。

## 阶段状态

| 阶段 | 状态 | 备注 |
|------|------|------|
| P0 桌面 Web-GUI 工作台 MVP | 已完成 | Tauri 桌面壳 + 文件队列 + Worker 转换链路 |
| P1 转换质量与编辑体验 | 已完成 | warnings / QualityReport / undo-redo / checkpoint / diff |
| P2 低内存与高响应 | 已完成 | Transferable / 虚拟滚动 / 渐进预览 / 性能 smoke |
| P3 插件隔离与资源治理 | 已取消（2026-05-24） | 改为核心内置本地能力 |
| P4 架构收敛与质量基线 | 已完成 | app.js 拆分 / capability note / fixture 分层 |
| P5 真实插件加载器 | 已取消（2026-05-24） | 同 P3 |
| P6 高保真输出 / 本地模型 / OFD | 已完成 | DOCX/PDF 程序化输出 + OFD L0-L4 capability 登记 |
| P7-A Windows 发布构建基线 | 已完成（2026-05-27） | 2.2.0 版本同步 + ICO 配置 + MSI/NSIS 本机真实产出 |
| P7-B 跨平台发布与签名 | 待启动 | macOS/Linux 构建、签名/公证、更新和平台 smoke 待补 |
| P8-A 多模型路由可见性基线 | 已完成（2026-05-27 校准） | RoutePlanner 路径温度与强制降级 warnings 已接入 QualityReport |
| P8-B 执行型 mapper 与路径校准 | 待开发（技术路线已确认） | 按研究报告纠正 capability 真值、执行 mapper、收窄虚假保真路径 |
| P9 质量证据升级 | 待启动 | SSIM 视觉对比框架已建立，待推进到可运行实现 |

详细子任务和验收门槛见 [docs/archive/DEVELOPMENT_HISTORY.md](docs/archive/DEVELOPMENT_HISTORY.md)。

## 下一步执行顺序

1. **P8-B 执行型 mapper 与路径校准**：依据研究报告的三条主通路，先纠正 reader/writer 实际模型能力，再在稳定范围内让 mapper 进入真实转换执行链。
2. **P9 质量证据升级**：以校准后的路径等级为基线，把 SSIM 视觉对比推进到可运行实现，补 PDF/OFD/扫描件版面恢复的公开样例和质量报告。
3. **P7-B 跨平台发布与签名**：在转换能力表述准确后，于对应构建环境完成 macOS/Linux 安装包、签名/公证、自动更新、平台 smoke、文件关联和桌面权限体验。
4. **发布前回归**：`npm test`、`git diff --check`、`npm run release:prepare`、release manifest ignore 验证。

## P8-B 当前开发主线

依据 2026-05-12 的研究报告《多格式文档与媒体互转的可行路径与工程化方案》，P8-B 不追求一次开放更多格式组合，而是把语义文档链、表格链和定版终点链的实际执行能力说准、跑实、可回归。

1. **B1 Capability 真值校准**：区分 reader 原生模型、兼容投影和 writer 实际可消费模型；`pptx -> pptx` 不再视为 hot 保真写回，`ofd -> pdf` 不再声称已有稳定布局保持能力。
2. **B2 可执行 mapper 内核**：mapper 注册真实 `fn`；路由记录 `executedMappers`、温度与强制 warnings；仅对真实执行过的降级注入对应 warning。
3. **B3 稳定路径首批接入**：优先接入 `SemanticDoc <-> WorkbookModel`，覆盖结构化文档/表格到 `xlsx` 与 `csv/xlsx` 到语义 writer 的路径，并以现有输出快照防止无意回归。
4. **B4 高风险路径治理**：`SlideModel` 和 `FixedLayoutModel` 的自动映射须在对应 writer 或质量 fixture 具备证据后启用；`PPTX/PDF/OFD/PNG` 按生成型、降级型或受限型路径呈现。
5. **B5 文档与质量门禁**：同步更新路径矩阵、路由说明、capability audit 与转换质量测试，确保 UI 展示的推荐程度等于真实执行证据。

详细设计与实施顺序见：

- [docs/superpowers/specs/2026-05-27-executable-cross-model-routing-design.md](docs/superpowers/specs/2026-05-27-executable-cross-model-routing-design.md)
- [docs/superpowers/plans/2026-05-27-executable-cross-model-routing.md](docs/superpowers/plans/2026-05-27-executable-cross-model-routing.md)

## 当前主要不足

- PDF / OFD / 扫描件的版面恢复偏弱：FixedLayoutModel 与本地 OCR/layout 需补真实实现，目前仅有坐标启发式和 capability 登记。
- P8-A 当前只完成了模型路径提示和 warnings 注入；注册表声明与 writer 实际消费模型仍存在偏差，mapper 尚未进入真实执行链。
- Windows MSI/NSIS 已真实产出；macOS/Linux 安装包、签名/公证和跨平台 smoke 仍需在对应构建环境执行。

## 最近验收修复

> 仅保留最近 4 周内的记录；更早的归档到 [docs/archive/DEVELOPMENT_HISTORY.md](docs/archive/DEVELOPMENT_HISTORY.md)，逐次发布的细节走 [CHANGELOG.md](CHANGELOG.md)。

- **2026-05-27**：完成审核整改阶段与 P7-A Windows 发布构建基线。修复 Tauri/Rust 仍停在 `2.0.0` 且无 bundle icon 导致 Windows 安装包失败的问题，新增配置门禁并实际生成 `Trans2Former_2.2.0_x64_en-US.msi` 与 `Trans2Former_2.2.0_x64-setup.exe`。补齐 P8 转换模型路由损失：`warm/cold` 路径将 mapper `forcedWarnings` 和 `routeTemperature` 写入 QualityReport，前端展示转换后的质量模型。修复 TXT 等纯文本导出 Markdown 时 `<img ...>` 原样激活 HTML 的回归，同时保留 `- [x]` task list。核心 smoke 扩展为 46 组。
- **2026-05-26**：跨格式转换质量回归。Markdown writer 统一走 `getInlineTokens → inlinesToHtml/Markdown`，废弃旧 `inlineMarkdownToHtml` 正则兜底；脚注 `[^id]` 升级为 `footnoteRef` 一等公民 inline 节点（HTML/MD/XML/DOCX vertAlign superscript/PDF 各自渲染）。修复 md→md 嵌套有序列表跳号（独立 `orderedCounter` 仅在 depth=0 递增）；task list `[x]` 不再被错误转义（escape 字符集收窄到 ``\ ` * _ ~``，放过 `[]<>`）。markdown reader 合并连续 `>` 行消除 `<p>&gt;</p>` 孤段；html reader 修复 `<li>` 嵌套 `<ul>/<ol>` 被展平为 inline 文本，新增 70+ HTML 命名实体表。`npm test` 全套通过；DOCX/PDF/XLSX 二进制输出经字节级验证。
- **2026-05-25**：修复用户回归报告三处问题（HTML 分级丢失 / 预览尺寸错乱 / 前端风格偏老旧）。DOCX reader 新增 `parseHeadingStyleMap` 多路兜底识别中英文 `Heading 1`/`标题 1`；`.viewer-card` 从 grid 改 flex column + `min-height: 0` 让预览/textarea 自适应；`.preview-markdown` 补 h4/h5/h6 字号梯度，h1/h2 加 border-bottom；色板换为 slate + teal，Inter `font-feature-settings: cv11/ss01/ss03`。补齐 P1 残留：PDF 输出回填 `autoLinkifySegments` 让纯文本 URL 生成 `/Annots`；`***粗斜体***` / `___...___` 优先识别为 strong×em 嵌套；XML inline 断言更新为结构化输出。
- **2026-05-24**：六项发布卫生与跨格式修复。
  - HTML 输出"不像 HTML"：`<main>` 内部按块换行，列表/表格不再压成一行，普通列表项移除内部 `data-depth="0"`。
  - 取消产品插件系统：OFD/OCR/layout/table 改为核心内置本地能力，移除插件管理 UI / catalog / runtime / policy / `.t2f-plugin.json` / 插件测试链。
  - 跨输出格式 markdown 标记泄漏：TXT/CSV/XML/JSON plainText/DOCX/PPTX/PDF 程序化输出清理 `**bold**` 等行内标记；HTML/EPUB 列表改为真实嵌套；XML/DOCX/XLSX/PPTX XML 改为可读结构。新增 `format writers emit clean target-format output` 回归。
  - 工作台截图三处问题：左侧 source card 不再强行拉满；外层不再用 `100vh` 制造空白；PDF 结果 iframe 明确 `width/height:100%`；高保真 PDF 改用绝对 `Tm` text matrix。
  - 主分支代码审核：`git diff --check v2.0.0..HEAD` trailing whitespace、`.claude/settings.local.json` 入库风险、`RELEASE_GUIDE.md` 命令偏 Unix、发布说明断言不可验证。
  - 上述发布卫生项已全部修复（清理 trailing whitespace、移除本地配置、补 Windows PowerShell 命令、收敛质量断言、扩展 `release-readiness-test`）。

## 文档入口

- 当前项目评估：[docs/PROJECT_ASSESSMENT_2026-05-27.md](docs/PROJECT_ASSESSMENT_2026-05-27.md)
- 多模型架构：[docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md)
- 转换路由：[docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md)
- 产品定位和零上传原则：[docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)
- 桌面 Web-GUI 架构：[docs/DESKTOP_APP_ARCHITECTURE.md](docs/DESKTOP_APP_ARCHITECTURE.md)
- 格式路线：[docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)
- 基础格式质量：[docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)
- DocumentModel：[docs/DOCUMENT_MODEL_SCHEMA.md](docs/DOCUMENT_MODEL_SCHEMA.md)
- 转换降级策略：[docs/CONVERSION_POLICY.md](docs/CONVERSION_POLICY.md)
- 安全策略：[docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)
- 资源预算：[docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)
- 重格式 capability note：[docs/HEAVY_FORMAT_CAPABILITY_NOTES.md](docs/HEAVY_FORMAT_CAPABILITY_NOTES.md)
- 动态分块合并：[docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md](docs/DYNAMIC_CHUNKING_MERGE_DESIGN.md)
- OFD 攻坚路线：[docs/OFD_RESEARCH.md](docs/OFD_RESEARCH.md)
- 发布准备：[docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)
- 开发规范：[docs/development-standards/00_README.md](docs/development-standards/00_README.md)
- 历史归档：[docs/archive/DEVELOPMENT_HISTORY.md](docs/archive/DEVELOPMENT_HISTORY.md)

## 固定验收命令

- `npm test`
- `git diff --check`
- `npm run release:prepare`
- `git check-ignore -v release\trans2former-2.2.0\RELEASE_MANIFEST.json`
- `npm run desktop:build`（Windows P7-A / 发布前安装包验证）
