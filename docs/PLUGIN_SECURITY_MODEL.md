# Plugin Security Model

版本：v0.1.0
状态：P2 生效
最后更新：2026-04-30

本文定义 Trans2Former 模块插件系统的安全边界。插件可以下载，但文档处理阶段必须本地执行且禁止联网。

## 核心原则

- 插件安装模式可以使用网络，但不得接触用户文档。
- 文档处理模式可以接触用户文档，但必须 `local-only-no-network`。
- 插件不得声明 `remote-api`，不得调用第三方转换 API、云端 OCR、云端转写或云端 AI。
- 插件必须声明权限、资源预算、完整性哈希、安全模式和失败降级路径。
- 本地模型只能作为手动安装、手动启用、可删除的 `local-model-plugin`。

## 两种模式

| 模式 | 允许联网 | 允许接触用户文档 | 允许权限 |
| --- | --- | --- | --- |
| install | 是 | 否 | `install-network`, `cache-plugin` |
| processing | 否 | 是 | `process-document`, `read-assets`, `write-output` |

## Manifest

机器可读 schema：

```text
docs/plugin-manifest.schema.json
```

运行时策略入口：

```js
import {
  validatePluginManifest,
  assertPluginModeAllows,
  verifyPluginIntegrity,
} from "./core/plugin-policy.js";
```

## 资源预算

| kind | 下载体积上限 | 运行内存上限 |
| --- | ---: | ---: |
| `format-plugin` | 10 MB | 1024 MB |
| `optional-plugin` | 50 MB | 2048 MB |
| `local-model-plugin` | 500 MB | 4096 MB |

超过预算的插件必须拆分、延后或重新归类，不得进入默认核心包。

## 完整性校验

插件 manifest 必须提供：

```json
{
  "integrity": {
    "sha256": "..."
  }
}
```

安装后、处理前必须校验插件代码内容的 SHA-256。校验失败时不得执行插件，必须走 `fallback`。

## 基础格式晋升规则

一个格式从插件晋升到 `format-basic` 必须同时满足：

- 高频、轻量、市场常用。
- 不引入云端能力。
- 默认依赖和核心体积不突破预算。
- 有样例、快照、warnings、质量说明和安全测试。
- 对免下载体验有明确收益。

## 验收

`npm test` 包含 `scripts/plugin-security-test.js`，覆盖 manifest、权限隔离、processing no-network、完整性校验、资源预算和本地模型插件规则。
