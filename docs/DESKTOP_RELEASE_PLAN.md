# Desktop Release Plan

版本：v0.1.0
状态：生效
最后更新：2026-05-08

本文是 P7 的发布产品化控制面，区分 Web preview、桌面开发构建和桌面安装包。OFD、OCR、版面分析等增强能力进入核心本地能力路线，不再发布插件补丁包。

## 发布产物分层

| 类型 | 位置 | 用途 | 是否接触用户文档 |
| --- | --- | --- | --- |
| Web-GUI preview | `release/trans2former-<version>/public/` | 浏览器验证转换核心和 GUI | 否 |
| 桌面开发构建 | `src-tauri/target/` | 本机开发 smoke，不作为正式发布包 | 只在用户选择文件后 |
| 桌面安装包 | GitHub Release assets | Windows/macOS/Linux 用户安装 | 安装/更新阶段否 |

## 桌面安装包命名

正式桌面 release 必须使用可机器校验的命名：

```text
Trans2Former_<version>_windows_x64.msi
Trans2Former_<version>_windows_x64.nsis.exe
Trans2Former_<version>_macos_universal.dmg
Trans2Former_<version>_linux_x64.AppImage
Trans2Former_<version>_linux_x64.deb
Trans2Former_<version>_checksums.sha256
```

## 平台构建计划

1. Windows：优先 MSI/NSIS，要求 Windows WebView2 可用，安装后无网络也能完成基础转换。
2. macOS：优先 `.app`/`.dmg`，验证 macOS WKWebView，正式公开发布前补签名和 notarization。
3. Linux：优先 AppImage/deb，验证 Linux WebKitGTK 依赖提示清晰。
4. 每个平台安装包均生成 SHA-256，并写入 `checksums.sha256`。

## 平台 smoke

每个桌面安装包发布前至少验证：

- 应用可启动到主窗口。
- Markdown -> HTML、TXT -> PDF、CSV -> XLSX 基础路径可转换并下载。
- OFD、PNG/image、PDF、OOXML 等核心本地能力在无插件安装入口的情况下可见。
- 文档处理阶段不发起网络请求。
- 关闭再打开后不会自动恢复用户文档，除非用户显式开启历史持久化。

## 文件关联和权限

- 桌面文件关联先覆盖 `.md`、`.txt`、`.csv`、`.html`、`.json`、`.xml`。
- 最近文件列表只能记录用户显式打开的路径；默认不记录内容摘要。
- 项目保存只能由用户显式触发。
- 输出目录必须由用户选择，不能扫描或自动写入用户目录。
- 核心转换只能访问当前任务输入和用户确认的输出位置。

## 自动更新

- 自动更新属于 install/update mode：可联网，不可读取当前文档、文件名、预览、错误详情或输出。
- 文档处理、预览、编辑和导出阶段不得并发执行更新下载。
- 更新前展示版本、权限变化、资源预算变化、checksum 和回滚入口。
- 更新失败不得影响当前转换任务和旧输出下载链接。

## 核心能力发布规则

- 新增格式转换能力优先并入核心本地模块，必要时通过本地 worker、vendor 或 WASM 按需加载。
- Release 包不得包含 `plugin-patches` 或 `.t2f-plugin.json`。
- OFD、OCR、版面分析、表格恢复等能力必须声明资源预算、fallback 和兼容说明。
- 本地模型资源必须手动安装、可删除、可禁用，不得上传数据。
- 文档处理模式始终禁止网络访问。

## 当前 P7 边界

本仓库已经具备 release preview、桌面壳配置、核心本地能力发布规则。实际跨平台安装包生成仍依赖各平台构建环境、签名证书和发布账号；这些不应伪装成已在本机完成。
