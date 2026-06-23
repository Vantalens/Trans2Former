# Release Prep

版本：v0.2.0
状态：生效
最后更新：2026-05-27

本文记录 Trans2Former 上传 GitHub 与后续 GitHub release 的准备规则。

## 发布底线

- 发布包必须保持 `local-only` 路线，不引入云端文档处理、远程转换、远程 OCR、远程转写或远程 AI。
- 发布前必须运行 `npm test`。
- OFD、PNG/image、PDF 和 OOXML 等转换能力作为 core local capabilities 随核心包提供，不再发布或安装插件补丁包。
- 发布包不得包含 `node_modules/`、`.git/`、`.local/`、日志、缓存、用户文档、测试截图或临时导出文件。
- release 包只包含源码、样例、测试、开发文档、静态浏览器应用资源和核心本地转换能力。

## 本地准备命令

```bash
npm run release:prepare
```

该命令会生成：

```text
release/trans2former-<version>/
release/trans2former-<version>/RELEASE_MANIFEST.json
```

`release/` 是本地发布暂存目录，默认不提交 GitHub。后续需要发布 GitHub release 时，从该目录打包或上传。格式增强能力直接随核心包发布，降低安装和使用复杂度。

## GitHub release 流程

1. 确认 `DEVELOPMENT_TASKS.md`、README、CHANGELOG、CONTRIBUTING、INSTALL、COMMIT_CHECKLIST 已同步。
2. 运行 `npm test`。
3. 运行 `npm run release:prepare`。
4. 检查 `release/trans2former-<version>/RELEASE_MANIFEST.json`。
5. 提交源码到 GitHub。
6. 在 GitHub release 中使用本地 `release/` 目录生成的包作为 release asset 发布素材。

## P7 桌面发布

桌面安装包、签名、checksum、平台 smoke、自动更新和文件关联规则见 [operations/DESKTOP_RELEASE_PLAN.md](DESKTOP_RELEASE_PLAN.md)。

Windows 桌面安装包基线验证命令：

```bash
npm run desktop:build
```

2026-05-27 已验证该命令生成 `Trans2Former_2.2.0_x64_en-US.msi` 与 `Trans2Former_2.2.0_x64-setup.exe`。生成成功不替代签名、安装后 smoke 或跨平台验证。

## 每次对话同步要求

- 如果本轮改动影响功能、格式、安全策略、资源预算、测试或发布材料，必须同步更新任务看板和相关 docs。
- 如果 release 包结构发生变化，必须同步更新本文和 `scripts/prepare-release.js`。
