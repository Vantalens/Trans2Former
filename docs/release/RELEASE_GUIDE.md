# Trans2Former 发布指南

本文档说明如何发布 Trans2Former 新版本到 GitHub。

---

## 📋 发布前检查清单

### 1. 代码检查
- [ ] 所有测试通过（npm test）
- [ ] 代码审查完成
- [ ] 无遗留的 TODO 或 FIXME
- [ ] 无调试代码（console.log, debugger）
- [ ] Git 工作区干净

### 2. 文档检查
- [ ] README.md 已更新
- [ ] CHANGELOG.md 已更新
- [ ] RELEASE_NOTES 已创建
- [ ] THIRD_PARTY_NOTICES.md 已更新（如有新依赖）
- [ ] 所有文档链接有效

### 3. Release 包检查
- [ ] Release 包已生成（npm run release:prepare）
- [ ] RELEASE_MANIFEST.json 正确
- [ ] 核心本地能力已包含
- [ ] 样例文件已包含

### 4. Git 检查
- [ ] 所有更改已提交
- [ ] Git tag 已创建
- [ ] 提交历史清晰

---

## 🚀 发布步骤

### 步骤 1: 推送代码和 tag

```bash
# 推送所有提交
git push origin main

# 推送 tag（替换 <version> 为实际版本号，如 v2.3.0）
git push origin <version>
```

### 步骤 2: 创建 GitHub Release

1. 访问 GitHub 仓库
2. 点击 "Releases" → "Draft a new release"
3. 填写以下信息：

**Tag version**: 选择刚推送的 tag

**Release title**: `Trans2Former <version> - <版本描述>`

**Description**: 复制 RELEASE_NOTES 的内容

**Assets**: 上传以下文件
- `release/trans2former-<version>.zip`（压缩 release 包）
- `release/trans2former-<version>.zip.sha256`（校验和）

### 步骤 3: 压缩 Release 包

```powershell
# 进入 release 目录
Set-Location release

# 压缩 release 包（替换 <version> 为实际版本号）
Compress-Archive -Path .\trans2former-<version> -DestinationPath .\trans2former-<version>.zip -Force

# 生成 SHA-256 校验和
(Get-FileHash .\trans2former-<version>.zip -Algorithm SHA256).Hash | Set-Content .\trans2former-<version>.zip.sha256 -Encoding ascii

# 返回项目根目录
Set-Location ..
```

### 步骤 4: 上传 Assets

在 GitHub Release 页面上传：
1. `release/trans2former-<version>.zip` - 主 release 包
2. `release/trans2former-<version>.zip.sha256` - 校验和文件
说明：`npm run release:prepare` 只生成主 release 包和 manifest；OFD、OCR 等增强路线进入核心本地能力，不再单独上传扩展包。

### 步骤 5: 发布

1. 勾选 "Set as the latest release"
2. 点击 "Publish release"

---

## 📝 Release Description 模板

```markdown
# Trans2Former <version> - <版本描述>

🎉 **核心更新**: <本版本主要改进>

## ✨ 核心特性

- ✅ **23 种输入格式** - Markdown, HTML, TXT, JSON, CSV, XML, DOCX, XLSX, EPUB, PDF, PPTX, PNG, DOC, OFD, YAML, TOML, IPYNB, RTF, LaTeX, ODT, JPEG, WebP, SVG
- ✅ **16 种输出格式** - Markdown, HTML, TXT, JSON, CSV, XML, DOCX, XLSX, EPUB, PDF, PPTX, YAML, TOML, IPYNB, LaTeX, ODT
- ✅ **100+ 转换路径** - 智能路由，自动派生最佳转换路径
- ✅ **本地优先** - 所有转换在本地完成，零上传
- ✅ **核心本地能力** - PP-OCRv5, Tesseract.js, KaTeX, Repair Engine, 三层验证

## 🎯 本版本新增/改进

<列出本版本的具体功能改进>

## 🐛 Bug 修复

<列出修复的主要 bug>

## 📦 下载

- **主包**: trans2former-<version>.zip

## 🚀 快速开始

\`\`\`bash
# 下载并解压
unzip trans2former-<version>.zip
cd trans2former-<version>

# 安装依赖
npm install

# 启动应用
npm start
\`\`\`

## 📚 文档

- [README.md](README.md) - 项目介绍
- [INSTALL.md](docs/development/INSTALL.md) - 安装指南
- [CHANGELOG.md](CHANGELOG.md) - 更新日志
- 完整 Release Notes

## 🧪 测试结果

✅ `npm test` 全链路通过
✅ 所有发布门槛测试通过（release-readiness / local-security / resource-budget）

## 🛡️ 数据安全

- ✅ 所有转换在本地完成
- ✅ 不上传任何数据
- ✅ 文档处理阶段禁止联网

---

**Made with ❤️ by Trans2Former Team**
```

---

## 🔍 发布后验证

### 1. 检查 Release 页面
- [ ] Release 标题正确
- [ ] Release 描述完整
- [ ] Assets 已上传
- [ ] 标记为 latest release

### 2. 测试下载
- [ ] 下载 zip 文件
- [ ] 验证 SHA-256 校验和
- [ ] 解压并测试运行

### 3. 更新文档
- [ ] 更新 README.md 中的版本号
- [ ] 更新安装指南链接

---

## ✅ 发布验证记录

### v2.5.0 — 2026-10-23（commit `0ec31f4`，CI + Enhanced CI 双绿）

本次发布端到端跑通并修复了以下腐烂点，后续发布前请逐项复查：

1. **`npm run release:prepare` 必须提前跑通**。`prepare-release.js` 的 `INCLUDE_PATHS` 按根路径硬编码文档文件；文档搬入 `docs/` 子目录后会 ENOENT 崩溃（本次修复见 `b43d34a`）。文档目录再调整时同步更新该清单。
2. **vendor 同步会产生真实提交**。`release:prepare` 开头的 sync 脚本会把 `public/vendor/pdfjs` 等对齐到 lockfile 解析版本（本次 6.3.289 → 6.4.299）。若 `git status` 出现 vendor 改动：先对浏览器链路复测（pdf-reader / browser-smoke / ui-conversion-e2e / release-user-path-e2e），再单独提交，不要混入功能 commit。
3. **CI 覆盖率门禁会被「断言断链」放大**。`npm test` 是 `&&` 链，任何一个测试失败会导致后续测试不运行、覆盖率暴跌触发门禁。看到覆盖率 ERROR 时先查链中是否有测试失败，不要直接调阈值。浏览器 e2e 对控制台 404 的过滤是既定约定：CI 全新克隆不含本地 OCR vendor 资产，`det.onnx` 探测 404 属预期噪音。
4. **Windows 控制台执行 curl 中文载荷会乱码**（GBK 代码页破坏 UTF-8，`Problems parsing JSON`）。凡含中文的 API body 一律先写 UTF-8 文件再 `--data @file`。
5. **重建已发布 Release 的流程**（tag 需要指向更新提交时）：DELETE release → DELETE `git/refs/tags/<tag>` → 以相同标题/正文 POST 重建 → 重新上传 assets。发布后尽早完成，避免外部下载后内容漂移。
6. **版本号五处对齐**：`package.json`、`package-lock.json`（`npm version <v> --no-git-tag-version` 一并处理）、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（本包 `trans2former` 条目）、`src-tauri/tauri.conf.json`；CHANGELOG 的 `[Unreleased]` 定版为 `[<v>] - <日期>`。完成后跑 `p7-release-productization` 与 `release-readiness` 验证。
7. 本次 Release 资产：`trans2former-2.5.0.zip`（42 MB）+ `.zip.sha256`，压缩与校验和按步骤 3 的 PowerShell 命令生成。

---

## 📢 发布公告

### GitHub Discussions
在 GitHub Discussions 发布公告：

**标题**: Trans2Former v2.0.0 发布 - 生产就绪版本

**内容**:
```
🎉 Trans2Former v2.0.0 正式发布！

这是一个里程碑版本，完成了所有核心功能开发。

主要特性:
- 23 种输入格式，16 种输出格式
- 100+ 转换路径
- 本地优先，零上传
- 核心本地增强能力

立即下载: https://github.com/Vantalens/Trans2Former/releases/tag/v2.0.0

欢迎试用并反馈！
```

### 社区
在 https://linux.do/ 发布公告。

---

## 🎯 下一步

发布完成后：
1. 监控 Issues 和反馈
2. 准备 v2.1.0 开发计划
3. 开始平台安装包构建
4. 实现 SSIM 视觉对比

---

## 📞 联系方式

如有问题，请联系：
- GitHub Issues: https://github.com/Vantalens/Trans2Former/issues
- GitHub Discussions: https://github.com/Vantalens/Trans2Former/discussions
- 社区: https://linux.do/

---

**发布日期**: 2026-10-23
**版本**: 2.5.0（指南最近验证版本；历史模板示例仍沿用 v2.0.0 文案）
**状态**: ✅ 准备发布
