# Cost And Resource Governance

版本：v0.1.0  
状态：生效  
最后更新：2026-04-26

## 正式开发方向

Trans2Former 采用模块化设计，但基础包必须覆盖热门、轻量、高频格式的免下载转换能力。核心包提供基础文档模型、注册表、热门基础格式、Worker 协议、安全策略和 UI 框架；高级格式和重能力通过模块插件按需下载或加载。

目标：

- 降低默认硬盘和内存占用
- 降低初次加载时间
- 避免 `N * N` 转换路线和依赖爆炸
- 根据用户当前需求加载对应能力
- 提升转换效率和长期扩展能力
- 保证首次使用时常见格式无需下载即可完成转换

## 分层

```text
core
  DocumentModel / registry / schema / errors / worker protocol / security / base UI

format-basic
  Markdown / HTML / TXT / JSON / CSV / XML / PNG input / PDF-print

format-plugin
  PDF input / DOCX / PPTX / XLSX / EPUB / advanced image formats / OFD research

optional-plugin
  local OCR / local layout analysis / local table recovery / local model plugins
```

## 基础包热门格式原则

`format-basic` 是用户体验层，不是最小到无法使用的空壳。它必须内置高频、轻量、低风险格式，保证用户打开应用后不用下载插件即可完成常见转换。

当前基础包包括：

- Markdown
- HTML
- TXT
- JSON
- CSV
- XML
- PNG input
- PDF-print

格式晋升为 `format-basic` 必须同时满足：

- 市场高频或核心流程高频
- 体积和依赖在默认预算内
- 可在浏览器本地运行
- 不需要默认网络访问
- 有样例、快照、warnings 和安全测试

DOCX、PPTX、XLSX、PDF input、EPUB 等即使热门，也先以 `format-plugin` 进入；只有在不破坏核心预算和安全边界时，才允许评估是否晋升为基础能力。OFD 归为 P4+ 远期政务格式研究。

## 插件 manifest 必填字段

- `id`
- `name`
- `version`
- `formats`
- `canRead`
- `canWrite`
- `sizeBudgetKb`
- `dependencies`
- `localOnly`
- `networkRequired`
- `remoteCapable`
- `defaultEnabled`
- `loadMode`: `bundled` / `on-demand` / `external`
- `entry`
- `integrity`
- `warnings`

## 加载规则

- `format-basic` 默认内置，承担热门格式免下载体验。
- `format-plugin` 默认按需加载。
- `optional-plugin` 默认关闭，必须用户显式启用。
- 插件下载必须由用户操作触发，UI 必须说明大小、用途和安全模式。
- 插件安装模式可以联网下载代码和资源，但不能接触用户文档。
- 文档处理模式可以接触用户文档，但必须禁联网。
- 插件加载失败不能破坏核心转换流程。
- 插件更新不能改变已缓存转换结果的含义。

## 性能规则

- 核心包不因新增插件变大。
- 首屏只加载 `core + format-basic`，不加载 `format-plugin` 或 `optional-plugin`。
- 插件加载后应可复用，不重复下载。
- 大文件转换必须优先走 Worker、分片、流式和动态分块。
- 插件应复用 `DocumentModel`、`ConversionContext`、`AssetStore` 和统一 warnings。

## 质量规则

每个插件必须提供：

- 样例文件
- 快照或 smoke test
- 降级说明
- 资源预算声明
- 安全声明
- 失败降级路径

## 禁止行为

- 插件绕过 `DocumentModel` 形成私有格式直连。
- 插件默认上传用户内容。
- 插件把 PDF/OCR/Office/AI 重依赖带入核心包。
- 插件无 manifest、无预算、无测试进入主流程。

## 变更记录

- v0.1.0：确立模块化插件、热门基础格式免下载、按需下载和资源治理方向。
