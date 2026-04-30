# Release Prep

版本：v0.1.0
状态：生效
最后更新：2026-04-30

本文记录 Trans2Former 上传 GitHub 与后续 GitHub release 的准备规则。

## 发布底线

- 发布包必须保持 `local-only` 路线，不引入云端文档处理、远程转换、远程 OCR、远程转写或远程 AI。
- 发布前必须运行 `npm test`。
- 发布包不得包含 `node_modules/`、`.git/`、`.local/`、日志、缓存、用户文档、测试截图或临时导出文件。
- release 包只包含源码、样例、测试、开发文档和静态浏览器应用资源。

## 本地准备命令

```bash
npm run release:prepare
```

该命令会生成：

```text
release/trans2former-<version>/
release/trans2former-<version>/RELEASE_MANIFEST.json
```

`release/` 是本地发布暂存目录，默认不提交 GitHub。后续需要发布 GitHub release 时，从该目录打包或上传。

## GitHub release 流程

1. 确认 `DEVELOPMENT_TASKS.md`、README、CHANGELOG、CONTRIBUTING、INSTALL、COMMIT_CHECKLIST 已同步。
2. 运行 `npm test`。
3. 运行 `npm run release:prepare`。
4. 检查 `release/trans2former-<version>/RELEASE_MANIFEST.json`。
5. 提交源码到 GitHub。
6. 在 GitHub release 中使用本地 `release/` 目录生成的包作为发布素材。

## 每次对话同步要求

- 如果本轮改动影响功能、格式、安全策略、资源预算、测试或发布材料，必须同步更新任务看板和相关 docs。
- 如果 release 包结构发生变化，必须同步更新本文和 `scripts/prepare-release.js`。
