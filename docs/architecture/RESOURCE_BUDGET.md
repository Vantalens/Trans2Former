# Resource Budget

版本：v0.3.0
状态：生效
最后更新：2026-06-13

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

- `public/core`: <= 320 KB（v0.3.0 扩容：OCR 结构识别、Repair Engine 扩展）
- `public/formats`: <= 0.50 MB
- `public/workers`: <= 0.10 MB
- `scripts`: <= 0.50 MB
- `public` total（排除 vendor）: <= 2.00 MB
- `public/vendor`: <= 96 MB（含 onnxruntime ~25MB + tesseract ~30MB + PP-OCRv5 ~21MB）
- production dependencies: <= 5 个
- `pdfjs-dist`, `tesseract.js`, `onnxruntime-web`: 只能在 `optionalDependencies` 中出现，并由 `scripts/sync-*-vendor.js` 同步到本地 vendor。

这些预算是当前阶段的护栏，不是最终能力上限。未来引入重格式时，应放入核心按需加载目录，并同步调整预算。

## OCR 模型缓存目录预算

OCR / 版面 / 表格能力的代码核心内置，但**模型资源不进入默认安装包**。默认安装包目标体积 30–80 MB；模型资源仅在用户首次启用对应能力时下载到本地 model-cache 目录。

- 默认安装包构建后必须报告主程序、轻量依赖、空 model-cache 占位的分项体积总和，目标 30–80 MB。
- 任何 GB 级模型（PaddleOCR-VL / Qwen-VL / MinerU 等）不得进入默认 dependencies 或安装包本体。
- model-cache 目录必须支持：manifest 记录每个模型资产的版本、checksum、量化方式、任务范围、最低内存和 fallback；用户可见的缓存路径、清理入口、禁用入口；断网降级提示与失败 fallback。
- 缓存包只保存推理资源，不保存训练检查点、优化器状态、标注数据、调试样本或任何用户文档内容。
- OCR、layout、table、quality-reviewer 共享资源必须去重，避免重复下载 tokenizer、字典、字体、运行库或视觉 backbone。
- 轻量 OCR（Tesseract.js）与高级 OCR（PP-OCRv5 ONNX/WebGPU）使用独立缓存条目；高级 OCR 启用前展示体积、运行内存、降级路径和失败提示。PaddleOCR-VL / MinerU 等 VLM 为远期/外部资源，不进入默认 dependencies 或安装包本体。
- 具体 MB/GB 上限以首个可运行 OCR 模型构建后的质量、速度、内存测试结果确定，不沿用默认安装包预算。

### model-cache 目录结构

S3 已经落地 `public/core/model-cache/` 模块骨架。所有模型资源必须遵守统一目录约定 `model-cache/<task>/<engine>/<modelVersion>/<file>`，task ∈ `{ocr-text, ocr-layout, ocr-table, quality-reviewer}`，engine ∈ `{tesseract, paddleocr, paddleocr-vl, mineru, custom}`，由 `getCacheKey` / `getCacheDirectory` / `getCacheFilePath` 统一推导，禁止使用 `..` / 绝对路径 / 反斜杠。Manifest 强制 SHA-256 checksum，校验前状态停留在 `verifying`；校验失败进入 `degraded` 并保留可清理入口。详见 [docs/superpowers/specs/2026-05-28-on-demand-model-cache-design.md](superpowers/specs/2026-05-28-on-demand-model-cache-design.md)。

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
