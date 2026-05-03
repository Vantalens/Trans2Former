# 安装与运行

Trans2Former 现在定位为 Tauri 桌面壳 + Web-GUI 的本地格式转换工作台。当前仓库仍以浏览器 Web 应用运行，用于验证转换核心、前端工作台和本地安全策略。

核心转换默认在本机浏览器中执行，不上传用户文件。后续 Tauri 桌面版本必须复用 Web-GUI 和转换核心，并保持本地优先路线。

## 系统要求

- Node.js 18 或更高版本
- npm 9 或更高版本
- 现代浏览器：Chrome、Edge、Firefox 或 Safari
- 桌面壳真实启动：Rust/Cargo 工具链和 Tauri CLI

## 本地运行

```bash
npm install
npm start
```

启动后打开：

```text
http://localhost:3000
```

当前 Node.js 服务只负责承载 Web 页面，转换逻辑在浏览器端执行。Tauri 桌面壳已建立 scaffold，并复用这套 Web-GUI 和转换核心。

在输出面板的导出设置中，可以切换 Markdown profile、开启“关闭后保留版本历史”并使用“清除历史”入口删除本地保存的会话版本。

浏览器自检页：

```text
http://localhost:3000/smoke-test.html
```

## 桌面壳

没有安装 Rust/Cargo 时，可先检查 Tauri 配置和权限边界：

```bash
npm run desktop:check
```

安装 Rust/Cargo 和 Tauri CLI 后，可启动桌面壳：

```bash
npm run desktop:dev
```

桌面权限边界位于 `src-tauri/capabilities/default.json`，只声明主窗口、打开/保存对话框、文件读写能力，不开放 shell、HTTP 或目录级扫描权限。

## 验证

```bash
npm test
```

当前测试会检查：

- 浏览器端转换核心
- 固定转换快照
- 静态页面和浏览器自检入口
- Tauri 桌面壳 scaffold 和最小权限边界
- 本地安全策略，防止默认前端引入上传、遥测或持久化用户内容
- 资源预算策略，防止重依赖进入默认核心路径

## 开发文档

- 文档总目录：[docs/README.md](docs/README.md)
- 当前任务看板：[DEVELOPMENT_TASKS.md](DEVELOPMENT_TASKS.md)
- 产品策略：[docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)
- 桌面架构：[docs/DESKTOP_APP_ARCHITECTURE.md](docs/DESKTOP_APP_ARCHITECTURE.md)
- 格式路线：[docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)
- 基础格式质量：[docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)
- 插件安全模型：[docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md)
- 插件分发规则：[docs/PLUGIN_DISTRIBUTION.md](docs/PLUGIN_DISTRIBUTION.md)
- 开发规范：[docs/development-standards/00_README.md](docs/development-standards/00_README.md)
- 成本与资源治理：[docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md](docs/development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md)
- 发布准备：[docs/RELEASE_PREP.md](docs/RELEASE_PREP.md)

## Release 准备

```bash
npm run release:prepare
```

生成本地 release 包：

```text
release/trans2former-2.0.0/
```

`release/` 默认不提交 GitHub，用于后续创建 GitHub release 前检查发布素材。

## 当前限制

1. PDF 当前支持程序化二进制输出，不再依赖浏览器打印作为主要路径。
2. DOCX、XLSX、EPUB、PDF text extraction、PPTX input 已完成 P3；DOCX/PDF/PNG/JPEG output 已完成 P4 基线；OFD 已升级为 P5 战略攻坚格式，当前 release 尚未发布 OFD 可用转换功能。
3. 不需要安装 Office、LibreOffice、Pandoc、Playwright 或桌面壳程序。
4. 不提供远程 OCR、远程转写、远程 AI 增强或云端文档处理；本地模型和 OFD 高保真渲染只能作为可删除、可禁用、可回滚的本地插件。

## 升级

```bash
git pull origin main
npm install
npm start
```

## 故障排除

### 启动时出现 Cannot find module

```bash
npm install
npm start
```

### 页面打不开

确认终端输出的地址可访问，默认是：

```text
http://localhost:3000
```

### PDF 如何保存

选择输出 PDF 后，直接点击“下载二进制输出”获取 `.pdf` 文件；也可以点击“打开 PDF 预览”在浏览器中查看。
