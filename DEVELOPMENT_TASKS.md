# Trans2Former Development Tasks

最后更新：2026-05-26

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
- 转换核心围绕 `input -> DocumentModel -> QualityReport / Warnings -> output`，避免 N×N 私有路径。
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
| P7 桌面发布与产品化 | 进行中 | 平台真实安装包、签名/公证、平台 smoke 待补 |
| P8 多模型架构与转换路由 | 已完成 | SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel + RoutePlanner |
| P9 质量证据升级 | 待启动 | SSIM 视觉对比框架已建立，待推进到可运行实现 |

详细子任务和验收门槛见 [docs/archive/DEVELOPMENT_HISTORY.md](docs/archive/DEVELOPMENT_HISTORY.md)。

## 下一步执行顺序

1. **P7 桌面发布产品化收尾**：平台安装包真实产出、签名/公证、自动更新、平台 smoke、文件关联和桌面权限体验（需对应 Windows/macOS/Linux 构建环境）。
2. **P9 质量证据升级**：把 SSIM 视觉对比从框架推进到可运行实现，补 PDF/OFD/扫描件版面恢复的公开样例和质量报告。
3. **转换质量持续回归**：近期跨格式 inline pipeline、blockquote、HTML 实体、列表嵌套等修复保持回归覆盖。
4. **发布前回归**：`npm test`、`git diff --check`、`npm run release:prepare`、release manifest ignore 验证。

## 当前主要不足

- PDF / OFD / 扫描件的版面恢复偏弱：FixedLayoutModel 与本地 OCR/layout 需补真实实现，目前仅有坐标启发式和 capability 登记。
- 平台安装包真实产出、签名/公证和跨平台 smoke 仍需在对应构建环境执行。

## 最近验收修复

> 仅保留最近 4 周内的记录；更早的归档到 [docs/archive/DEVELOPMENT_HISTORY.md](docs/archive/DEVELOPMENT_HISTORY.md)，逐次发布的细节走 [CHANGELOG.md](CHANGELOG.md)。

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

- 当前项目评估：[docs/PROJECT_ASSESSMENT_2026-05-03.md](docs/PROJECT_ASSESSMENT_2026-05-03.md)
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
- `git check-ignore -v release\trans2former-2.0.0\RELEASE_MANIFEST.json`
