# Project Assessment 2026-05-27

状态：生效

## 当前结论

Trans2Former 当前具备可验证的浏览器转换核心、Tauri 桌面壳和 Windows 安装包构建基线。2026-05-27 的审核整改阶段完成了三项发布前必须成立的事实：

- Windows 桌面配置版本已与 `package.json` 的 `2.2.0` 同步，且 `npm run desktop:build` 能在 Windows 产出 MSI 与 NSIS 安装包。
- RoutePlanner 已不再只用于温度展示；跨模型 `warm` / `cold` 路径会把强制降级 warnings 和路径温度写入转换 QualityReport。该能力属于 P8-A 可见性基线，mapper 真实执行与路径真值校准仍属于 P8-B。
- Markdown 文本导出同时满足 task list 保留与原始 HTML 标签不被重新激活。

## 阶段判断

| 阶段 | 当前判断 | 后续边界 |
| --- | --- | --- |
| P0-P2 | 已完成并持续回归 | 保持 Worker、大文件、编辑与预览门禁 |
| P3/P5 插件路线 | 已取消 | 增强能力进入核心本地模块，不恢复插件分发 |
| P4/P6 | 基线已完成 | 重格式质量仍需公开样例和视觉证据强化 |
| P7-A Windows 发布构建基线 | 已完成 | 真实生成 MSI/NSIS，不代表已签名或可公开发布 |
| P7-B 跨平台发布与签名 | 待启动 | macOS/Linux 构建、签名、公证、自动更新、平台 smoke |
| P8-A 多模型路由可见性基线 | 已完成 | 路由温度和降级 warnings 已进入用户可见质量模型 |
| P8-B 执行型 mapper 与路径校准 | 待开发 | 优先让 Workbook/Semantic 稳定链真实执行，收窄无保真证据的路径声明 |
| P9 | 待启动 | SSIM 与 PDF/OFD/扫描件视觉质量证据 |

## 当前可验证证据

- Web 与核心回归：`npm test`，含 46 组核心 smoke、Worker、浏览器、桌面壳、安全、资源与发布门禁。
- Web release 暂存：`npm run release:prepare` 生成 `release/trans2former-2.2.0/`，该目录保持 git ignored。
- Windows 桌面构建：`npm run desktop:build` 生成 `src-tauri/target/release/bundle/msi/Trans2Former_2.2.0_x64_en-US.msi` 与 `src-tauri/target/release/bundle/nsis/Trans2Former_2.2.0_x64-setup.exe`。

## 当前不足

- Windows 安装包尚未完成签名、安装后人工 smoke、自动更新与文件关联验证。
- macOS 与 Linux 的安装包和平台 smoke 尚未在对应系统完成。
- PDF / OFD / 扫描件版面恢复仍缺可运行视觉比较与真实质量基线。
- `public/app.js` 仍偏大；后续扩展桌面权限、自动更新或 P9 质量视图前应继续拆职责。

## 下一阶段顺序

1. P8-B：校准 reader/writer 实际模型能力，接入首批 `SemanticDoc <-> WorkbookModel` 可执行 mapper，并准确分类 PPTX/OFD 高风险路径。
2. P9-A：以校准后的路径分类为基线，把 `scripts/visual-comparison-test.js` 从占位框架推进为可运行的 PDF 图像比较。
3. P7-B：建立签名、安装后 smoke、自动更新和跨平台构建验证清单，并在具备平台环境时执行。

## 路线约束

- 产品继续采用 Tauri + Web-GUI + 本地转换核心，不引入 Electron 或云端转换。
- 文档处理阶段继续禁止联网，核心增强不改回插件安装或插件分发模式。
- 任一阶段结束必须更新 `DEVELOPMENT_TASKS.md`，并运行其固定验收命令。
