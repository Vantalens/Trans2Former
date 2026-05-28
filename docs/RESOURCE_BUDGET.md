# Resource Budget

版本：v0.2.2
状态：生效
最后更新：2026-05-09

## 目标

Trans2Former 必须保持 core 小、默认依赖少、重能力按需加载。格式数量会继续增长，但不能按 `N * N` 路线增长，也不能引入云端文档处理。

正式方向：采用核心内置模块化设计。基础包内置热门轻量格式，保证常见转换免下载即可使用；OFD、OCR、版面分析、表格恢复和高保真渲染等重能力进入核心本地能力路线，可以在本地按需加载，但不再提供插件安装。

## 分层

```text
core
  DocumentModel / registry / schema / errors / worker protocol / safety tests

format-basic
  Markdown / HTML / TXT / JSON / CSV / XML / PNG input / DOCX input/output / XLSX input / EPUB input / PDF input/output / PPTX input

format-heavy-core
  OFD / local OCR / local layout analysis / local table recovery / high-fidelity renderers / advanced image formats
```

## 默认包规则

- 默认只包含 `core + format-basic` 的启动路径。
- `format-basic` 必须保持小而可用，内置热门轻量格式，不能退化为空壳。
- DOCX/XLSX/EPUB/PDF/PPTX 的 P3 输入能力已作为基础路径进入 `format-basic`。
- PDF 文本抽取允许使用 optional `pdfjs-dist` + 本地 vendored `/public/vendor/pdfjs/`，但必须保持本地加载、低于当前 public 总预算，且不得变成默认 `dependencies`。
- 高保真输出、OCR、本地模型、OFD 和重渲染器必须作为核心本地模块按需加载。
- 云端文档处理、远程转换、远程 OCR、远程转写、远程 AI 增强不提供。
- 不再提供插件安装，也不发布 `plugin-patches` 或 `.t2f-plugin.json`。
- Release 的 `RELEASE_MANIFEST.json` manifest 必须记录核心本地能力、样例、预算和生成时间。
- 文档处理、预览、编辑和导出阶段必须禁联网。

## 轻量核心预算

- `public/core`: <= 0.25 MB
- `public/formats`: <= 0.50 MB
- `public/workers`: <= 0.10 MB
- `scripts`: <= 0.50 MB
- `public` total: <= 2.00 MB
- production dependencies: <= 5 个
- `pdfjs-dist`: 只能在 `optionalDependencies` 中出现，并由 `scripts/sync-pdfjs-vendor.js` 同步到本地 vendor。

这些预算是当前阶段的护栏，不是最终能力上限。未来引入重格式时，应放入核心按需加载目录，并同步调整预算。

## 模型增强桌面包预算

模型增强桌面包是正式安装包形态，不与轻量 Web-GUI core 预算混用。模型资源随安装包交付，但不得进入首屏启动路径；只有当前任务需要 OCR、layout、table、质量审核或 Repair Engine 自动修复时才按需加载。

- 模型资源随安装包交付，必须记录 manifest、checksum、量化方式、任务范围、最低内存和 fallback。
- 交付包只包含推理资源，不包含训练检查点、优化器状态、标注数据或调试样本。
- OCR、layout、table、quality-reviewer 共享资源必须去重，避免重复打包 tokenizer、字典、字体、运行库或视觉 backbone。
- Windows 安装包构建后必须报告应用本体、推理运行时、模型资产和压缩后总包体积。
- 具体 MB/GB 上限以首个可运行模型构建后的质量、速度、内存和体积测试确定，不沿用轻量核心预算。

## 核心重能力预算原则

- 重能力依赖不得进入默认 `dependencies`，除非该能力转为 `format-basic` 并通过资源预算评审。
- 本地 vendor、WASM、worker 或模型资源必须可定位、可删除、可重新同步，且不能保存用户文档内容。
- 核心重能力加载失败必须返回可解释错误，不影响 `format-basic` 转换。
- 单个重能力模块必须在文档或 manifest 中记录预估体积、运行内存、安全模式、加载方式和失败降级路径。

## 基础格式晋升原则

热门格式可以进入 `format-basic` 免下载使用，但必须满足：

- 高频需求明确。
- 新增体积不突破默认预算。
- 不引入 OCR/Office/AI 等重依赖；PDF.js 作为 PDF 基础文本抽取的例外，必须 optional + local vendor + 受预算测试约束。
- 可完全本地运行，不需要默认网络访问。
- 有样例、快照、warnings、安全测试和质量基准。

成本与资源治理见 [development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md](development-standards/07_COST_AND_RESOURCE_GOVERNANCE.md)。

安全边界见 [SECURITY_POLICY.md](SECURITY_POLICY.md)。
