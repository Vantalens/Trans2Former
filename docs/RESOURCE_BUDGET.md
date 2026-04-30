# Resource Budget

版本：v0.2.0
状态：生效
最后更新：2026-04-26

## 目标

Trans2Former 必须保持核心包小、默认依赖少、重能力插件化。格式数量会继续增长，但不能按 `N * N` 路线增长，也不能把 PDF/OCR/Office/AI 重依赖塞进默认包。

正式方向：采用模块化设计。基础包内置热门轻量格式，保证常见转换无需下载即可使用；重格式和可选能力针对用户需求按需下载或加载对应模块插件，以降低资源占用、减少初次加载成本，并提升常用转换路径的效率与性能。

## 分层

```text
core
  DocumentModel / registry / schema / errors / worker protocol / safety tests

format-basic
  Markdown / HTML / TXT / JSON / CSV / XML / PNG input / DOCX input / XLSX input / EPUB input / PDF text input / PPTX input / PDF-print

format-plugin
  high-fidelity Office/PDF output / advanced image formats / OFD research / heavy renderers

optional-plugin
  local OCR / local layout analysis / local table recovery / local model plugins
```

## 默认包规则

- 默认只包含 `core + format-basic`。
- `format-basic` 必须保持小而可用，内置热门轻量格式，不能退化为空壳。
- DOCX/XLSX/EPUB/PDF/PPTX 的 P3 输入能力已作为轻量、无重依赖路径进入 `format-basic`。
- 高保真输出、OCR、本地模型、OFD 和重渲染器必须插件化或按需加载。
- `optional-plugin` 必须默认关闭。
- 云端文档处理、远程转换、远程 OCR、远程转写、远程 AI 增强不提供。
- 插件下载必须由用户操作或明确需求触发，不能在首屏默认下载所有格式能力。
- 插件必须提供 manifest，声明体积、依赖、安全模式、加载方式、完整性哈希和失败降级路径。
- 插件安装模式可以联网，文档处理模式必须禁联网。

## 当前预算

- `public/core`: <= 0.25 MB
- `public/formats`: <= 0.50 MB
- `public/workers`: <= 0.10 MB
- `scripts`: <= 0.50 MB
- `public` total: <= 2.00 MB
- production dependencies: <= 5 个

这些预算是当前阶段的护栏，不是最终能力上限。未来引入重格式时，应放入插件包或按需加载目录，并同步调整预算。

## 插件预算原则

- 单个插件必须声明 `resources.downloadBytes` 和 `resources.maxRuntimeMemoryMb`。
- 插件依赖不得进入默认 dependencies，除非该插件转为 `format-basic` 并通过资源预算评审。
- 插件缓存应可清理，且不能保存用户文档内容。
- 插件加载失败必须返回可解释错误，不影响核心基础格式转换。

## 插件预算分层

| kind | 下载体积上限 | 运行内存上限 | 规则 |
| --- | ---: | ---: | --- |
| `format-plugin` | 10 MB | 1024 MB | 重格式解析/写入能力，按需加载。 |
| `optional-plugin` | 50 MB | 2048 MB | 可选增强能力，不进入常用路径。 |
| `local-model-plugin` | 500 MB | 4096 MB | 本地模型，必须手动安装、可删除、不得上传数据。 |

运行时校验入口为 `public/core/plugin-policy.js`，机器可读 schema 为 `docs/plugin-manifest.schema.json`。

## 基础格式晋升原则

热门格式可以进入 `format-basic` 免下载使用，但必须满足：

- 高频需求明确。
- 新增体积不突破默认预算。
- 不引入 PDF/OCR/Office/AI 等重依赖。
- 可完全本地运行，不需要默认网络访问。
- 有样例、快照、warnings、安全测试和质量基准。

成本与资源治理见 [development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md](development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md)。

插件安全模型见 [PLUGIN_SECURITY_MODEL.md](PLUGIN_SECURITY_MODEL.md)。
