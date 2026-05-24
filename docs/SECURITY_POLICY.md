# Trans2Former Security Policy

版本：v0.2.2
状态：生效
最后更新：2026-04-30

## 底线

Trans2Former 的文档处理必须在用户设备本地执行。项目不提供云端文档处理、远程转换、远程 OCR、远程转写或远程 AI 增强。用户文档、图片、转换结果、编辑内容、文件名、文档片段和错误详情不得上传、遥测或留存。

## 默认模式

- 默认模式是 `local-only`。
- 浏览器端核心转换只允许使用本地能力：File API、Blob URL、Web Worker、Canvas、WASM、IndexedDB、ZIP/XML/JSON/文本解析。
- 默认不得调用远程转换 API、云端 OCR API、云端转写 API、云端 AI API、分析 SDK、遥测 SDK、外部 URL 抓取或远程字体/脚本。
- Express 服务只托管静态资源和 `/api/health`，不得接收文档内容作为转换请求。
- Tauri 桌面壳默认只声明主窗口、打开/保存对话框和文件读写能力；不得默认开放 shell、HTTP、目录扫描或后台网络权限。

## 禁止的云端处理

- 不上传用户文档。
- 不上传转换结果。
- 不上传错误日志。
- 不上传文档片段。
- 不上传文件名。
- 不接入第三方转换 API。
- 不接入云端 OCR、云端转写或云端 AI 增强。
- 不把 URL / YouTube extraction 作为格式能力。

## 核心内置处理

Trans2Former 不提供插件安装模式。文档处理全程在核心包内执行；OFD、PNG/image、PDF、OOXML 等能力作为本地核心模块演进，不要求用户下载或导入插件。

- 不提供插件安装模式，也不在应用内下载转换插件。
- 文档处理全程在核心包内执行，默认不得联网。
- OFD、OCR、layout analysis、table recovery 的后续增强直接并入核心本地能力，继续受资源预算和测试约束。
- Release 包不得包含 `plugin-patches` 或 `.t2f-plugin.json`。

## 错误与诊断

- 错误详情默认只展示 `category`、`code`、`format`、`message`、`warnings`。
- 可能包含用户内容的 raw snippet、source text、stack trace 必须默认隐藏。
- 复制诊断信息不得默认复制用户文档内容。
- 自动测试必须阻止前端引入 `fetch`、`XMLHttpRequest`、`sendBeacon`、`WebSocket` 等网络发送路径。

## 本地缓存

- localStorage、IndexedDB、Cache Storage 只能用于用户明确开启的历史、偏好或离线缓存；当前工作台仅在用户显式开启时保存 Markdown profile 和会话版本历史。
- 必须提供清除入口。
- 默认不得把文档正文、转换结果或错误原文写入持久化存储。

## 变更记录

- v0.2.2：取消产品插件系统；OFD/OCR 等能力改为核心内置路线，不提供插件安装模式。
- v0.2.0：收紧为零云端文档处理。
- v0.1.0：建立本地优先和诊断脱敏规则。
