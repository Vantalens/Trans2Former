# 安装与运行

Trans2Former 现在定位为浏览器 Web 应用，不再依赖 Electron，也不再发布桌面 exe 壳。

核心转换默认在本机浏览器中执行，不上传用户文件。后期 GUI/PWA/桌面外壳也必须保持本地优先路线。

## 系统要求

- Node.js 18 或更高版本
- npm 9 或更高版本
- 现代浏览器：Chrome、Edge、Firefox 或 Safari

## 本地运行

```bash
npm install
npm start
```

启动后打开：

```text
http://localhost:3000
```

当前 Node.js 服务只负责承载 Web 页面，转换逻辑在浏览器端执行。后续目标是支持静态部署。

浏览器自检页：

```text
http://localhost:3000/smoke-test.html
```

## 验证

```bash
npm test
```

当前测试会检查：

- 浏览器端转换核心
- 固定转换快照
- 静态页面和浏览器自检入口
- 本地安全策略，防止默认前端引入上传、遥测或持久化用户内容
- 资源预算策略，防止重依赖进入默认核心路径

## 开发文档

- 文档总目录：[docs/README.md](docs/README.md)
- 当前任务看板：[DEVELOPMENT_TASKS.md](DEVELOPMENT_TASKS.md)
- 产品策略：[docs/PRODUCT_STRATEGY.md](docs/PRODUCT_STRATEGY.md)
- 格式路线：[docs/FORMAT_ROADMAP.md](docs/FORMAT_ROADMAP.md)
- 基础格式质量：[docs/BASIC_FORMAT_QUALITY.md](docs/BASIC_FORMAT_QUALITY.md)
- 插件安全模型：[docs/PLUGIN_SECURITY_MODEL.md](docs/PLUGIN_SECURITY_MODEL.md)
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

1. PDF 当前使用浏览器打印/另存为 PDF。
2. DOCX、XLSX、EPUB、PDF text extraction、PPTX input 已完成 P3；OFD 的浏览器端转换尚未实现。
3. 不需要安装 Office、LibreOffice、Pandoc、Playwright 或桌面壳程序。
4. 不提供远程 OCR、远程转写、远程 AI 增强或云端文档处理；本地模型只可能作为远期可删除插件。

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

选择输出 PDF 后，点击“浏览器打印 / 另存为 PDF”，在浏览器打印窗口中选择“保存为 PDF”。
