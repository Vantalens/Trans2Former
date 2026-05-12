# Plugin Distribution

版本：v0.2.0
状态：生效
最后更新：2026-05-09

## 结论

Trans2Former 插件下载服务不自建文件分发后端。新增格式转换能力默认做成 `.t2f-plugin.json` 插件补丁包，随 Trans2Former GitHub Release 一起发布到 `plugin-patches/`，用户按需下载和导入。

应用内必须保留两个入口：

- 下载板块：展示插件能力、版本、体积、权限、安全模式和 GitHub Release 跳转入口。
- 更新板块：展示已安装插件的可更新版本、变更摘要、完整性信息和回滚入口。

应用内可以做版本发现、manifest 读取、完整性校验和本地导入，但默认下载动作应打开明确的 release asset 补丁包，不在文档处理阶段联网拉取插件。

## 为什么采用 GitHub Releases

- 成本低：不需要自建对象存储、CDN、签名分发和带宽系统。
- 透明：用户可以看到 release notes、版本、资产、hash、源码和历史记录。
- 可回滚：旧版本插件可以保留在历史 release 中，便于问题回退。
- 易审计：插件包、manifest、hash 和变更说明可公开审查。
- 符合本地优先：下载插件和处理文档可以彻底隔离。

## 分发流程

1. 插件作者或主仓库发布 GitHub Release。
2. Release asset 至少包含 `.t2f-plugin.json` 补丁包；主仓库 release 同步放入 `release/trans2former-<version>/plugin-patches/`。
3. Release notes 必须说明能力、变更、权限、资源预算、兼容版本和已知限制。
4. Trans2Former 的下载板块展示插件元信息和 GitHub Release 链接。
5. 用户按需点击 release asset 插件补丁包；若补丁包随当前 release 本地提供，应用直接读取补丁包。
6. 应用导入补丁包，校验 manifest、版本、兼容性、hash 和资源预算。
7. 校验通过后插件进入 enabled 状态，已安装插件和能力列表立即刷新；处理文档前仍必须通过 processing no-network 校验。

## 浏览器端下载板块

浏览器端不能获得过宽的文件系统权限，因此下载板块采用保守交互：

- 展示官方/可信插件列表和 release 内置补丁包链接。
- 点击随当前 release 提供的 `.t2f-plugin.json` 补丁包时，应用直接读取、校验、导入并启用。
- 外部 GitHub Release asset 仍允许用户下载后，通过“导入本地插件包”选择文件。
- 导入时只读取插件包和 manifest，不读取当前文档队列。
- 浏览器端不得在文档处理阶段自动联网检查更新。

## 桌面端下载和更新板块

桌面端可以提供更完整的插件管理，但必须保持模式隔离：

- 下载板块允许在 install mode 下访问 release asset；如果补丁包已随 release 本地提供，则不需要联网。
- 更新板块允许检查已安装插件的 release metadata，但不得读取当前文档、文件名、预览内容或错误详情。
- 更新前展示权限变化、体积变化、资源预算变化和 breaking changes。
- 更新后保留上一版本，支持禁用、卸载和回滚。
- 文档处理、编辑、预览和导出阶段必须禁联网，不能同时执行插件更新。

## 安全要求

- 插件下载/更新属于 install mode：允许联网，不允许接触用户文档。
- 插件处理属于 processing mode：允许接触用户文档，不允许联网。
- 插件包必须有 manifest、版本号、兼容范围、资源预算、权限声明和 SHA-256。
- 完整性校验失败、权限升级未确认、资源预算超限或兼容版本不匹配时，不得启用插件。
- 诊断信息不得包含用户文件名、文档片段、签章信息、转换结果或错误原文。

## UI 要求

下载板块至少显示：

- 插件名称、版本、类型和支持格式。
- release asset 补丁包链接。
- 下载体积、运行内存预算和依赖说明。
- 权限声明和安全模式。
- 已知限制和失败降级路径。

更新板块至少显示：

- 当前版本、可更新版本和 release notes 摘要。
- 权限变化、资源预算变化和兼容性变化。
- 完整性 hash。
- 更新、跳过、禁用、卸载、回滚入口。

## 不做

- 不自建云端文档处理服务。
- 不接入第三方转换 API。
- 不在文档处理阶段自动下载或更新插件。
- 不上传已安装插件列表、用户文档、文件名、错误日志或转换结果。
- 不把插件下载做成绕过 GitHub Releases 审计的隐藏后台通道。

## 补丁包结构

`.t2f-plugin.json` 必须包含：

- `packageType = "trans2former.plugin.patch.v1"`
- `manifest`：插件 manifest、格式能力、权限、资源预算、安全模式和 fallback。
- `entrySource`：插件入口模块源码，导入时按 manifest SHA-256 校验。

示例发布位置：

```text
release/trans2former-2.0.0/plugin-patches/ofd-local-reader-0.2.0.t2f-plugin.json
release/trans2former-2.0.0/plugin-patches/local-ocr-basic-0.1.0.t2f-plugin.json
```
