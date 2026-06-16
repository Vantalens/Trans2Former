# Cost And Resource Governance

版本：v0.2.0
状态：生效  
最后更新：2026-06-15

## 正式开发方向

Trans2Former 采用模块化设计，但基础包必须覆盖热门、轻量、高频格式的免下载转换能力。核心包提供基础文档模型、注册表、热门基础格式、Worker 协议、安全策略、UI 框架以及必要的 OCR/layout/table/verification 代码；大模型和重资源通过 `model-cache` 按需下载或本地导入。

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
  Markdown / HTML / TXT / JSON / CSV / XML / PNG input / DOCX input/output / PDF input/output

format-enhanced
  PDF input / DOCX / PPTX / XLSX / EPUB / advanced image formats / OFD L0-L4 capability

model-cache
  local OCR / local layout analysis / local table recovery model resources
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
- DOCX / PDF output；PNG / JPEG output 必须等真实视觉渲染器和回归测试达标后再开放

格式晋升为 `format-basic` 必须同时满足：

- 市场高频或核心流程高频
- 体积和依赖在默认预算内
- 可在浏览器本地运行
- 不需要默认网络访问
- 有样例、快照、warnings 和安全测试

DOCX、PPTX、XLSX、PDF input、EPUB 等热门能力可以评估进入基础免下载层，但必须受核心预算和安全边界约束。OFD 已作为核心 reader 登记的早期预览能力推进，高保真解析、渲染、质量报告和回归样例必须继续受资源预算和 warning 门禁约束。

## 模型资源 manifest 必填字段

- `schemaVersion`: 必须为 `trans2former.model-manifest.v1`
- `manifestId`
- `task`: `ocr-text` / `ocr-layout` / `ocr-table` / `quality-reviewer`
- `engine`: `tesseract` / `paddleocr` / `fixed-layout-stub` / `quality-reviewer-rules`
- `modelVersion`
- `bundleSize`: 模型资源总字节数，必须为正数
- `quantization`: `none` / `int8` / `int4` / `fp16`
- `minMemoryMB`: 非负数
- `sources`: 每个来源必须声明 `kind` 和 `path`
- `checksums.algorithm`: 必须为 `SHA-256`
- `checksums.digest`: 非空 SHA-256 hex
- `checksums.perFile`: 分文件 SHA-256 映射
- `fallback.onFailure`: `skip-task` / `use-placeholder` / `block-conversion`
- `fallback.message`
- `ui.label`
- `ui.description`
- `ui.enableHint`

模型资源 manifest 必须通过 `public/core/model-cache/manifest.js`
中的 `validateModelManifest` 校验；不得复用已取消插件体系的
读写能力、入口文件和插件完整性字段作为模型资源契约。

## 加载规则

- `format-basic` 默认内置，承担热门格式免下载体验。
- `format-enhanced` 可以核心内置，但不得默认拉取重资源。
- `model-cache` 默认按需下载或本地导入，必须用户显式启用。
- 模型资源下载必须由用户操作触发，UI 必须说明大小、用途和安全模式。
- 资源获取模式可以联网下载模型文件，但不能接触用户文档。
- 文档处理模式可以接触用户文档，但必须禁联网。
- 模型资源加载失败不能破坏核心转换流程。
- 模型资源更新不能改变已缓存转换结果的含义。

## 性能规则

- 核心包不因新增模型资源变大。
- 首屏只加载 `core + format-basic`，不加载 model-cache 重资源。
- 模型资源加载后应可复用，不重复下载。
- 大文件转换必须优先走 Worker、分片、流式和动态分块。
- 插件应复用 `DocumentModel`、`ConversionContext`、`AssetStore` 和统一 warnings。

## 质量规则

每个增强能力或模型资源必须提供：

- 样例文件
- 快照或 smoke test
- 降级说明
- 资源预算声明
- 安全声明
- 失败降级路径

## 禁止行为

- 增强能力绕过 `DocumentModel` / 专属模型契约形成私有格式直连。
- 模型资源或增强能力默认上传用户内容。
- PDF/OCR/Office/AI 重依赖进入默认核心路径。
- 模型资源无 manifest、无预算、无测试进入主流程。

## 变更记录

- v0.2.0：同步核心内置能力 + model-cache 资源治理方向，移除已取消的插件叙事。
- v0.1.0：确立模块化插件、热门基础格式免下载、按需下载和资源治理方向。
