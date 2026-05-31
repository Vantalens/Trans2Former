# Multi-Model Architecture

版本：v0.1.0
状态：方案落地，分阶段实施（P8-M1 ~ M6）
最后更新：2026-05-12

## 设计原则

Trans2Former 的转换核心从"单一 `DocumentModel`"升级为**五个并列规范模型 + 一个共享资产图**。每个模型只承载它擅长的对象语义，不再硬塞跨类对象到同一个 9-block 容器里。

- **规范模型不是文件**：是 reader/writer 之间的内存对象，不存盘、不序列化为 docx/html 文件作为中转。
- **不写 N×N 直连**：reader 输出某个规范模型，writer 消费某个规范模型，跨模型走显式 mapper。
- **降级显式可见**：跨模型 mapper 必发 warning，质量等级写入 `qualityReport`，不静默丢信息。
- **本地优先不变**：所有规范模型在 worker / 主线程内部流转，不走网络；文档图像、文字、版面和表格能力采用核心本地内置模型（代码内置，模型资源按需下载到本地 model-cache，不进入默认安装包），不恢复插件安装路线。默认安装包目标体积 30–80 MB；默认包不含 GB 级模型。
- **自动修复有边界**：模型只输出结构化质量问题和修复动作，Repair Engine 执行已注册动作并触发修复后复核，不允许模型直接替换文件字节。

## 五个规范模型

### SemanticDoc

承载流式语义文档：标题、段落、列表、引用、表格、代码、行内格式（粗体/斜体/链接/行内代码）、脚注、交叉引用。

| 字段 | 含义 |
|---|---|
| `title` | 文档标题 |
| `lang` | 语言标记，影响换行与字体 fallback |
| `blocks[]` | 块级节点：heading / paragraph / list / quote / code / table / image / asset / raw |
| `inlines[]` | 行内节点（嵌在 paragraph/heading 等里）：strong / em / link / code-inline / del / sup / sub |
| `footnotes[]` | 脚注定义，与正文中的 `{type:"footnote-ref", id}` 配对 |
| `metadata` | warnings / sourceSpan / qualityReport / provenance |

**reader 来源**：md, html, txt, json, xml, docx, epub, doc。
**writer 目标**：md, html, txt, json, xml, docx, epub。

### WorkbookModel

承载工作簿：sheet、cell、merge、formula cache、style hint。

| 字段 | 含义 |
|---|---|
| `sheets[]` | 工作表数组 |
| `sheets[].name` | 工作表名 |
| `sheets[].cells[]` | 单元格 `{ref, value, formula, style, type}` |
| `sheets[].merges[]` | 合并单元格区域 `{from, to}` |
| `sheets[].columns[]` | 列宽和样式 |
| `definedNames[]` | 命名区域 |
| `metadata` | 同 SemanticDoc |

**reader 来源**：csv, xlsx。
**writer 目标**：csv, xlsx。

### SlideModel

承载演示稿：slide、shape、speaker notes、layout slot。

| 字段 | 含义 |
|---|---|
| `slides[]` | 幻灯片数组 |
| `slides[].layout` | 布局名 |
| `slides[].shapes[]` | 形状节点 `{type, bbox, text, asset, style}` |
| `slides[].notes` | 演讲者备注（SemanticDoc） |
| `master` | 母版引用 |
| `metadata` | 同 SemanticDoc |

**reader 来源**：pptx。
**writer 目标**：pptx。

### FixedLayoutModel

承载固定页面：page、textRun、glyph、bbox、annotation、signature。

| 字段 | 含义 |
|---|---|
| `pages[]` | 页面数组 |
| `pages[].size` | `{width, height, unit}` |
| `pages[].textRuns[]` | 文本块 `{text, bbox, fontSize, fontWeight, fontFamily}` |
| `pages[].annotations[]` | 注释/链接 `{type, bbox, target}` |
| `pages[].signatures[]` | 签章占位 |
| `pages[].assets[]` | 页内图像引用 |
| `metadata` | 同 SemanticDoc，含 `provenance.engine`（pdfjs / ofdrw / ocr-plugin / ...） |

**reader 来源**：pdf, ofd, png（经 OCR/layout 插件）。
**writer 目标**：pdf, png。

### AssetGraph

跨模型共享的资产图，把图片、字体、媒体、附件、来源溯源统一管理。

| 字段 | 含义 |
|---|---|
| `assets{id}` | 资产对象 `{mime, bytes, hash, sourceRef}` |
| `references{}` | 哪些模型块在引用这个资产 |
| `provenance{}` | 每个资产的来源溯源（哪个 reader、哪个文件、哪一页） |

不再像旧 `DocumentModel.assets[]` 那样挂在每个模型里，而是顶层共享。同一份图片在 docx 正文和 pptx 备注里出现时不重复存储。

## DocumentModel 兼容别名

旧代码里的 `DocumentModel` 保留为 `SemanticDoc` 的别名。`createDocumentModel(...)` / `createParagraph(...)` / `createHeading(...)` 等 API 行为不变，内部转新结构。**外部调用方零改动**。

需要使用 inline 节点时调用新 API：

```js
import { createInlineStrong, createInlineLink } from "./core/models/semantic-doc.js";
createParagraph([
  "Hello ",
  createInlineStrong("world"),
  ", visit ",
  createInlineLink({ text: "site", href: "https://example.com" })
]);
```

字符串入参仍然支持，自动包裹成 plain inline。

## 跨模型 Mapper

不写 N×N 直连函数，跨模型走显式 mapper。每个 mapper 必带降级 warning：

| Mapper | 方向 | 损耗等级 | 强制 warning |
|---|---|---|---|
| `semanticToWorkbook` | SemanticDoc.table → WorkbookModel | low | `MODEL_NO_FORMULA_INFO` |
| `workbookToSemantic` | WorkbookModel → SemanticDoc.table | low | `MODEL_STYLE_DROPPED`, `MODEL_FORMULA_AS_VALUE` |
| `semanticToSlide` | SemanticDoc.heading/list → SlideModel | medium | `MODEL_LAYOUT_AUTO_GENERATED` |
| `slideToSemantic` | SlideModel.shapes → SemanticDoc | medium | `MODEL_VISUAL_LAYOUT_DROPPED` |
| `semanticToFixedLayout` | SemanticDoc → FixedLayoutModel（程序化排版） | medium | `MODEL_PAGINATION_AUTO_GENERATED` |
| `fixedLayoutToSemantic` | FixedLayoutModel → SemanticDoc | high | `MODEL_VISUAL_FIDELITY_LOST`, `MODEL_TEXT_ORDER_HEURISTIC` |
| `workbookToFixedLayout` | WorkbookModel → FixedLayoutModel（仅打印路径） | medium | `MODEL_SHEET_TO_PAGE_PRINT_ONLY` |
| `slideToFixedLayout` | SlideModel → FixedLayoutModel（导出 PDF） | medium | `MODEL_ANIMATION_DROPPED` |

反向 mapper 不全：`fixedLayoutToWorkbook` / `fixedLayoutToSlide` 不实现，必须先 `fixedLayoutToSemantic` 再目标转换，明确双重 warning。

## 与现有架构的关系

| 现有组件 | 在新架构中的位置 |
|---|---|
| `public/core/document-model.js` | 改名为 `models/semantic-doc.js`；旧文件保留为兼容 re-export |
| `public/core/document-audit.js` | 升级为模型无关：所有 5 个模型共用 audit 字段 |
| `public/core/asset-store.js` | 演化为 `models/asset-graph.js`，跨模型共享 |
| `public/core/format-registry.js` | 升级为 Capability Registry，详见 [CONVERSION_ROUTING.md](CONVERSION_ROUTING.md) |
| `public/core/warnings.js` | 不变，仍然是 info / lossy / unsupported / security / performance 五级 |
| 核心本地重能力模块 | 后续承载 OCR / layout / table / quality-reviewer 等核心本地内置模型（代码内置 + 模型资源按需下载到 model-cache），详见 [RESOURCE_BUDGET.md](RESOURCE_BUDGET.md) |
| Repair Engine | 执行结构化修复动作，记录 before/after、confidence、modelVersion 和修复后复核结果 |

## Repair Engine 实现接口

S2 已落地为 `public/core/repair-engine.js`、`public/core/repair-actions.js`、`public/core/repair-handlers.js`、`public/core/repair-validators.js` 四个模块，并由 `ConverterRegistry.convert()` 在 writer 之后挂入运行。具体接口：

- `class RepairEngine` 提供 `registerValidator(fn)` / `registerHandler(actionType, fn)` / `proposeActions(model, ctx)` / `applyActions(...)` / `reverifyModel(...)` / `reverifyRoundTrip(...)` / `runCycle(...)`。`defaultRepairEngine` 在模块顶层注册下方默认 validator/handler。
- `REPAIR_ACTION_TYPES` 锁定 7 类动作：`replaceTextRun`、`insertTextRun`、`reorderBlocks`、`restoreTableGrid`、`adjustBoundingBox`、`regeneratePageLayout`、`selectFallbackRoute`。`createRepairAction` 返回冻结对象；`validateRepairAction` 在缺字段、未知 `actionType` 或 `confidence ∉ [0,1]` 时抛 `ConversionError(code: "REPAIR_ACTION_INVALID")`。
- 默认 validator 两个：`detectLossyRepairHints` 把 `metadata.warnings[*].details.repairAction` 中结构化建议提取为候选动作（让未来真实模型审核可以通过这种约定接入）；`detectRouteClassDegradation` 对 `metadata.conversion.routeClass ∈ {generated, restricted}` 路径建议更保守的输出格式。
- 默认 handler 两个真实实现：`replaceTextRun` 在 SemanticDoc `block.text / code / items[N]` 上做字符串级替换并返回深拷贝模型；`selectFallbackRoute` 默认仅写入 `autoRepair.recommendations`，只有 `options.repair.applyFallback === true` 时才真正切换 writer 并替换 output。其余 5 类 handler 注册为占位 reject，等 S3/S4 落地。
- `runCycle` 在 apply 完成后执行 model-level 复核（`ensureDocumentAudit` 重算 `qualityReport`，要求 `warningCount` / `downgradeCount` 不增加）；当 `from === to` 且格式属于 `md/html/json/csv/txt/xml` 自映射时再跑 writer→reader→model 指纹 round-trip diff，结果写入 `metadata.autoRepair.roundTripDelta`，非白名单路径记 `skipped: "format-not-round-trip-safe"`。
- `finalDecision ∈ {verified, degraded, failed-quality-gate}` 由 cycle 决定：无候选动作或复核通过 → `verified`；候选全被 reject → `degraded`；apply 后复核失败 → `failed-quality-gate`。
- `convert()` 返回 `{ ...writerOutput, quality: { qualityReport, modelReview, autoRepair, conversion } }`；`options.repair === false` 跳过 cycle 并保留旧返回结构，给 legacy 测试和未来需要纯净输出的调用方留口子。

## Model Cache 模块（S3 落地）

`public/core/model-cache/` 是 P9-A 即将接入的本地模型 manifest + 校验 + 状态机基础设施，详见 [docs/superpowers/specs/2026-05-28-on-demand-model-cache-design.md](superpowers/specs/2026-05-28-on-demand-model-cache-design.md)。要点：

- `createModelManifest({ manifestId, task, engine, modelVersion, bundleSize, ... })` 返回冻结的 `ModelManifest`，`validateModelManifest` 在缺字段、未知 task/engine、非 SHA-256 等情况下抛 `MODEL_MANIFEST_INVALID`。
- `MODEL_TASKS = ["ocr-text", "ocr-layout", "ocr-table", "quality-reviewer"]`；`MODEL_ENGINES = ["tesseract", "paddleocr", "paddleocr-vl", "mineru", "custom"]`。
- `sha256Hex` / `verifyChecksum` 用 `crypto.subtle.digest`，模型导入后必须经过 SHA-256 校验才能进入 `available` 状态。
- `defaultModelCache`（`ModelCacheRegistry` 单例）维护 `manifestId → { manifest, status, detail }` 内存状态机，状态包括 `not-downloaded / importing / verifying / available / degraded / disabled`；`onChange` 让 UI 实时刷新。
- `getCacheDirectory({ task, engine, modelVersion })` 统一返回 `model-cache/<task>/<engine>/<modelVersion>`，绝不写入用户数据或动态时间戳。
- 安全中心 dialog 的「模型缓存」card 自动渲染当前注册的 manifest 列表；S3 阶段无 register 调用，显示空状态。

## OCR Engine 模块（P9-A.1 落地）

`public/core/ocr/` 是 P9-A.2 接入真实 OCR 运行时的契约层，详见 [docs/superpowers/specs/2026-05-28-p9a-ocr-baseline-design.md](superpowers/specs/2026-05-28-p9a-ocr-baseline-design.md)。要点：

- `createOCRResult` / `validateOCRResult` / `summarizeOCRResult` 定义 OCRResult 数据契约（含 language / pages / lines / confidence / bbox / runtimeMs / engine / modelVersion）。
- `OCREngine` 接口：`{ id, taskCapabilities, manifestId?, isAvailable(): boolean, recognize(): Promise<OCRResult> }`。
- `defaultOCRRegistry`（`OCREngineRegistry` 单例）维护已注册 engine；`pickForTask("ocr-text")` 优先返回 `isAvailable() === true` 的 engine，都不可用时 fallback 到最后一条。
- `placeholderOCREngine` 总是 unavailable，`recognize` 抛 `OCR_UNAVAILABLE`；`ocr-bootstrap.js` 在 import 时把它注册到 registry 与 defaultModelCache（status: disabled）。
- `OCR_UNAVAILABLE` (info) / `OCR_LOW_CONFIDENCE` (lossy) / `OCR_ENGINE_FAILED` (lossy) / `OCR_DEGRADED_ROUTE` (info) 是 OCR 链路的统一 warning 编号。
- PNG reader 在 engine 不可用时注入 `OCR_UNAVAILABLE`，但保留 image asset + heading 流程，不阻塞 md/txt/html 输出。
- P9-A.2 真实 engine 接入只需 `defaultOCRRegistry.register(engine)`；reader 流程、warning 编号、UI 显示路径都保持不变。

### Tesseract Runtime（P9-A.2 落地）

`public/core/ocr/tesseract-engine.js` 与 `tesseract-bootstrap.js` 提供第一条 OCR runtime 候选，详见 [docs/superpowers/specs/2026-05-28-p9a2-tesseract-runtime-design.md](superpowers/specs/2026-05-28-p9a2-tesseract-runtime-design.md)。要点：

- `tesseractOCREngine.id = "tesseract-zh-en"`，`manifestId = "ocr-text.tesseract.5.0.0"`。
- `isAvailable()` 同步检查 `globalThis.__t2fTesseractVendorReady` + storage 中是否有 tessdata；A.2 阶段始终返回 false（A.2.b 接入 IDB 与 UI 启用按钮后才会变 true）。
- `recognize` 三段拒绝路径：vendor-not-ready / tessdata-missing / runtime-not-wired；A.2.b 替换 runtime-not-wired 分支为真实推理。
- `OCRStorage` 抽象：`InMemoryStorage`（Node 测试 + 浏览器降级）+ `createIndexedDBStorage(dbName)`（A.2 占位，A.2.b 接入真实 IDB I/O）+ `defaultOCRStorage` 单例。
- vendor 资源通过 `scripts/sync-tesseract-vendor.js` 同步到 `public/vendor/tesseract/{core,worker}/`；缺包时 exit 0 不阻塞。
- Tauri CSP 增加 `'wasm-unsafe-eval'` 让 wasm 实例化；`connect-src 'self'` 保留，vendor 资源同源加载、tessdata 由用户本地选择文件，不联网。

### tessdata IndexedDB 持久化 + 安全中心启用流程（P9-A.2.b）

- `IndexedDBStorage` (`public/core/ocr/indexeddb-storage.js`) 实现 `OCRStorage` 接口；单数据库 `trans2former-ocr-cache`，`tessdata` 存 ArrayBuffer + `metadata` 存 `{ size, sha256, updatedAt }`，put 单事务原子写两 store。
- `createIndexedDBStorage` 现在返回 `LazyIndexedDBStorage`（dynamic import IDB 实现）；Node / 无 IDB 环境继续回退 `InMemoryStorage`。
- `loadTesseractRuntime` (`public/core/ocr/tesseract-runtime.js`) 动态 import `/vendor/tesseract/core/tesseract.min.js`；失败抛 `OCR_VENDOR_LOAD_FAILED`。`createTesseractWorker` 用 vendor 路径 + tessdata blob URL 实例化 worker；`runRecognize` 把 tesseract data 映射成 `OCRResult`。
- `TesseractEngine.recognize` 真实接入：`loadTesseractRuntime → defaultOCRStorage.get tessdata → createTesseractWorker → runRecognize → disposeWorker`。错误统一抛 `OCR_ENGINE_FAILED` 含 cause。
- 安全中心「模型缓存」card 对 tesseract 行渲染三个按钮：「导入 chi_sim.traineddata」/「导入 eng.traineddata」/「清除缓存」。点击导入按钮 → `<input type=file>` → `arrayBuffer` → `sha256Hex` → `defaultOCRStorage.put` → `tesseractOCREngine.ensureProbe()` → `markTesseractVendorReady(true)` → `setStatus(STATUS_AVAILABLE)`。
- `enhanceWithOCR(model, { engine })` (`public/core/ocr/png-ocr.js`) 作为独立函数提供：找第一个 image asset → engine.recognize → 追加 paragraph blocks + 写 `metadata.modelReview` 含 `summarizeOCRResult` + 在 `metadata.ocr.lines` 持久化每条 line 的 confidence/bbox/blockId；低置信度发 `OCR_LOW_CONFIDENCE`、engine 不可用发 `OCR_UNAVAILABLE`。

### PNG 异步 OCR 管线 + Repair Engine OCR 入口（P9-A.3 落地）

- `ConverterRegistry.convertAsync(payload)` + `convertContentAsync(payload)` 顶层 export：与 sync `convert()` 同入口校验，但 PNG 输入 + `options.ocr.enabled !== false` 时自动 `await runOCRStage(model, ctx)` 注入 OCR enhancement；其后走与 sync convert 共享的 `_wrapWithRepairCycle` helper。**现有 sync `convert()` / `convertContent()` 完全不变**。
- `runOCRStage(model, ctx)` (`public/core/ocr/ocr-stage.js`) 包一层 `enhanceWithOCR`，错误兜底为 `OCR_ENGINE_FAILED` warning 返回原 model，不阻塞 writer。
- `detectOCRLowConfidence` (`public/core/ocr/ocr-validator.js`) 现在是 `defaultRepairEngine` 的默认 validator：从 `metadata.ocr.lines` 取 confidence < 0.55 的行生成 `replaceTextRun` 候选 action，evidence 含 engineId / language / bbox / pageIndex / lineIndex；每页最多 8 条。P9-B 真模型审核接入后这些候选可以自动 apply 到 SemanticDoc。
- workbench `convertWithWorker` 检测 PNG 输入时改走 `convertContentAsync`，让用户上传 PNG → 转 md/txt/html 时自动包含 OCR 文本（前提：已通过安全中心导入 tessdata）。
- 真实 PNG fixture：`samples/png/t2f-sample.data-url.txt`（80×24 灰度 PNG）用于 stub 测试与浏览器端手动 OCR 验证。

### 扫描 PDF OCR 管线（P9-A.4 落地）

- `isScannedPdf(content, options)` (`public/core/ocr/pdf-rasterizer.js`)：基于 `expandPdfContentForTextExtraction` 检测 PDFJS_PAYLOAD 标记是否存在 + 提取字符数 < 阈值（默认 300）双重启发式；不带 payload → 扫描；带 payload 但低于阈值 → 扫描；其余 → 文本 PDF。
- `PdfPageRasterizer` 抽象 + `defaultPdfPageRasterizer` 单例（Node 默认抛 `OCR_RASTERIZER_UNAVAILABLE`）+ `setPdfPageRasterizer(impl)` / `resetPdfPageRasterizer()` 让测试注入 stub；真实浏览器端 pdfjs canvas 渲染留给 P9-B。
- `runScannedPdfOCRStage(model, ctx)` (`public/core/ocr/scan-pdf-stage.js`)：拿 rasterizer + engine → countPages → 循环 rasterize 每页 → engine.recognize → 把多页 paragraph blocks 追加到 model + `metadata.ocr.lines` 含 `pageIndex` / `blockId` + `metadata.modelReview.ocr` 总览。错误统一注入 `OCR_ENGINE_FAILED` warning 返回原 model。
- `convertContentAsync({ from: "pdf", to: "..." })` 自动检测扫描 PDF 并接 OCR stage；文本 PDF 沿用 P8-B 路径。Repair Engine 的 `detectOCRLowConfidence` validator 自动复用扫描 PDF 输出。

### FixedLayoutModel 接入 + 浏览器 rasterize 真实化（P9-B 落地）

- `ocrResultToFixedLayoutPage(result, options)` (`public/core/ocr/ocr-to-fixed-layout.js`)：单页 OCR result → FixedLayoutModel.page，textRuns 按 bbox.y → bbox.x 排序、携带 confidence、`readingOrderHint = "heuristic-yx"`。
- `mergeOCRResultsToFixedLayout(results)`：多页 OCR result 合并为 FixedLayoutModel，写 `metadata.readingOrder` + `metadata.ocr` 总览（pageCount / textRunCount / averageConfidence / runtimeMs / engine / language）。
- `runScannedPdfOCRStage` 收集每页 pageResult 后调上面构造 FixedLayoutModel，挂到 `model.fixedLayout`；再用现有 `fixedLayoutToSemantic` 派生 paragraph blocks 追加到 `model.blocks`。同时发两条 info warning：`MODEL_VISUAL_FIDELITY_LOST`（OCR 不还原版面） + `MODEL_TEXT_ORDER_HEURISTIC`（阅读顺序是粗糙启发式）。`metadata.modelReview.ocr.fixedLayout = getFixedLayoutSummary(...)` 附摘要。
- `defaultPdfPageRasterizer` 重构为分层 fallback：`inject (setPdfPageRasterizer)` → 浏览器自动（首次调用时 dynamic import `pdf-rasterizer-browser.js`，工厂 `createBrowserPdfPageRasterizer` 内部 dynamic import `/vendor/pdfjs/pdf.min.mjs` + canvas + page.render + canvas.toDataURL）→ throw `OCR_RASTERIZER_UNAVAILABLE`。Node 测试用 stub；浏览器/Tauri 自动加载。
- `createTextRun` 新增 `confidence` 字段（clamp 到 [0,1]）；`createPage` 新增 `readingOrderHint` 字段。
- 不实现高级阅读顺序（multi-column / heading detection）——留给 P9-C / P9-D。

### 转换后检验三层 · 规则 diff 层（P9-C.1 落地）

转换后检验是项目核心差异化能力，三层组合（规则 diff + SSIM 视觉对比 + OCR 回读）统一写入 `qualityReport`。P9-C.1 落地第一层规则 diff 与统一编排骨架：

- `runVerificationStage({ model, output, ctx })` (`public/core/verification/verification-stage.js`)：在 Repair Engine `runCycle` 之后跑的独立验证阶段，只读不改 output，结果写入 `qualityReport.ruleDiff` 与 `qualityReport.verification` envelope（`eligible / reason / layers / skipped / runtimeMs`）。层名列表 `layers` 当前只含 `"rule-diff"`，P9-C.2 加 `"ssim"`、P9-C.3 加 `"ocr-readback"`。
- `diffSemanticDocs(original, readBack)` (`public/core/verification/rule-diff.js`)：在原始 SemanticDoc 与 writer→reader 回读 model 之间做字段级 diff，输出 `{ identical, blockCounts, changedBlocks, addedBlocks, removedBlocks, fidelity, overallScore }`。`fidelity` ∈ `exact / minor-drift / major-drift / broken`；`overallScore` 由 `MAJOR_WEIGHT / MINOR_WEIGHT / STRUCTURAL_PENALTY` 加权惩罚算出。
- 共享指纹模块 `public/core/verification/block-fingerprint.js`：`blockFingerprint` / `modelFingerprint`（从 Repair Engine 抽出，行为不变）+ `getBlockKey` / `extractBlockFields` / `BLOCK_FIELDS_BY_TYPE` 字段子集 + `ROUND_TRIP_FORMATS` 单一来源。Repair Engine 的 `reverifyRoundTrip` / `roundTripDelta` 改 import 共享 `modelFingerprint`，作为粗粒度兼容层与细粒度 `ruleDiff` 并存。
- 资格判断：from/to 都在 text-canonical 集合（md/html/json/csv/txt/xml）且 `output.data` 为字符串才跑；同格式直接回读 diff，跨格式仅首批开放 `md ↔ html` 回环；其余 writer（PDF/DOCX/XLSX/PPTX/PNG/OFD/EPUB）记 `eligible: false, reason: "writer-not-text-canonical"`，不阻塞转换。
- 失败兜底：回读抛错发 `RULE_DIFF_READBACK_FAILED`（info）；`fidelity !== "exact"` 发 `RULE_DIFF_DRIFT`（info），details 含 from/to/fidelity/score/added/removed/changed 摘要。
- 本阶段不让 Repair Engine 消费 `ruleDiff`（避免循环依赖），UI 验证卡片留给 P9-C.2 落地后统一做。

### 转换后检验三层 · SSIM 视觉回环层（P9-C.2 落地）

第二层 SSIM 视觉对比采用**视觉回环**语义：对视觉保真型输入（PDF / PNG），把输入页与输出页各自栅格化为像素做结构相似度对比，写入 `qualityReport.ssim`，衡量「这次转换是否保住视觉外观」。

- `computeSSIM(grayA, grayB, width, height, opts)` (`public/core/verification/ssim.js`)：纯函数、零依赖、非重叠窗口均值 SSIM（C1=6.5025 / C2=58.5225）；配套 `rgbaToGrayscale` / `resampleGrayscale`（box 重采样到公共网格）/ `compareImages`（两图归一后算分）。Node / 浏览器均可运行、完整可测。
- `runVerificationStageAsync({ model, output, ctx })` (`public/core/verification/verification-stage.js`)：异步编排，先调同步 `runVerificationStage` 拿 rule-diff 基底，再跑 `runSsimLayer` 视觉回环，合并 `layers` / `skipped` / `warnings` / `runtimeMs` + `ssim` 字段。同步 `runVerificationStage` 不变，供 sync `convert()` 用（其 `qualityReport.ssim` 恒为 `null`）。
- `runSsimLayer({ ctx, output })`：资格判断 `ctx.from ∈ {pdf,png}` 且 `ctx.to ∈ {pdf,png}`（当前实际命中 `pdf→pdf` / `png→pdf`）；经 `defaultPageImageSource` 取源图 + 输出图像素 → `compareImages` → `qualityReport.ssim = { score, threshold, passed, width, height, pageIndex, sourceFormat, outputFormat }`；低于阈值（默认 0.85）发 info 级 `SSIM_VISUAL_DRIFT`。
- 像素源抽象 `public/core/verification/page-image-source.js`：`defaultPageImageSource`（Node 抛 `VERIFICATION_IMAGE_SOURCE_UNAVAILABLE`；浏览器首次调用 dynamic import `page-image-source-browser.js` 用 vendor pdfjs + canvas `getImageData` 取 RGBA）+ `setPageImageSource` / `resetPageImageSource` 让测试注入 stub。
- `format-registry.js` 抽出 `_runRepairCycle` / `_assembleQuality` 共享，`convert()`（sync）走 `_wrapWithRepairCycle`（rule-diff），`convertAsync()` 走 `_wrapWithRepairCycleAsync`（rule-diff + SSIM）。`options.repair === false` 仍短路整个验证阶段。
- 注意：Trans2Former 的 `pdf → pdf` 走「reader 抽文本 → writer 重排版」，视觉本就不保真，SSIM 偏低是**诚实信号**，故仅发 info warning，不判失败、不阻塞。本轮渲染 stub-only（Node 无 canvas；真实 PDF/PNG 渲染 fixture + 浏览器端端到端验证留给后续）。

### 转换后检验三层 · OCR 回读层（P9-C.3 落地）

第三层也是收口层 OCR 回读：把转换输出（当前仅 PDF）栅格化后用 OCR 引擎读回文本，与原始 SemanticDoc 文本对照，写入 `qualityReport.ocrReadback`，回答「转成视觉格式后文字还认得回来吗」。

- `compareText(original, recognized)` (`public/core/verification/ocr-readback.js`)：纯函数、零依赖、**字符级多重集** recall / precision / f1（配 `normalizeText` NFKC + 小写 + 去空白）。字符级对中英文混排与 OCR 噪声稳健，无需分词。
- `extractModelText(model)`：拼接 block 文本（heading/paragraph/quote/list/table/code/content）。
- `runOcrReadbackLayer({ model, output, ctx, engine?, rasterizer? })`：资格 `ctx.to === "pdf"` 且原文非空 且 OCR engine 可用；经 OCR `defaultPdfPageRasterizer` 栅格化输出 PDF → `engine.recognize` → `compareText` → `qualityReport.ocrReadback = { recall, precision, f1, threshold, passed, engineId, originalLength, recognizedLength, averageConfidence }`；低于阈值（默认 f1 ≥ 0.7）发 info `OCR_READBACK_DRIFT`；engine/rasterizer 不可用或 recognize 抛错 → eligible:false（`OCR_READBACK_FAILED` info），不抛、不阻塞。
- `runVerificationStageAsync` 末尾 dynamic import `ocr-readback.js` 跑第三层，合并进 envelope；`qualityReport.ocrReadback` 同步路径恒 `null`。
- 命中路径：`md/html/txt/json/xml/docx/doc/epub/csv/xlsx → pdf`（凡产出 PDF 的文本路径），engine 复用已注册的 `ocr-text`（tesseract，需用户导入 tessdata）。
- 本轮 stub-only（Node 无 canvas/tessdata；真实 OCR 回读端到端留给浏览器手动验证）；不让 Repair Engine 消费 `ocrReadback`；高级 OCR 属 P9-D。

至此 P9-C 三层检验（rule-diff + ssim + ocr-readback）齐备，统一写入 `qualityReport.{ ruleDiff, ssim, ocrReadback }` + `qualityReport.verification` envelope。

### 高级 OCR · PP-OCRv5 (ONNX/WebGPU)（P9-D 方向 + P9-D.1 骨架）

调研结论（[2026-05-29-p9d-advanced-ocr-research.md](superpowers/specs/2026-05-29-p9d-advanced-ocr-research.md)）：**PaddleOCR-VL（0.9B VLM）/ MinerU** 在「浏览器/Tauri 本地 + 零云端 + 30–80MB 轻量默认包」约束下当前不可内嵌（VLM 无成熟 ONNX/WebGPU 路径、需 ~500MB + 1–2GB VRAM 或 vLLM 服务；MinerU 是 Python/vLLM 工具）。因此 **P9-D 高级 OCR 的内置目标改为 PP-OCRv5（ONNX Runtime + WebGPU，WASM 回退）**；PaddleOCR-VL / MinerU 标注为**远期/外部资源**，不作为内置路径。

P9-D.1 骨架（同 tesseract 骨架先行）：

- `paddleOcrEngine`（`public/core/ocr/paddle-ocr-engine.js`，id `paddleocr-v5`，taskCapabilities `["ocr-text","ocr-layout"]`）实现现有 `OCREngine` 契约，注册到 `defaultOCRRegistry`；`isAvailable()` 检查 vendor 就位 + det/cls/rec 模型在本地缓存，Node/未就位恒 false；`recognize()` 三阶段拒绝（vendor-not-ready / model-missing / runtime-not-wired）。
- `paddle-ocr-bootstrap.js` 注册 PP-OCRv5 ONNX ModelManifest（`engine: "paddleocr"`，int8，det/cls/rec perFile 占位）到 `defaultModelCache`，状态 `not-downloaded`，按需下载到 `model-cache`。
- P9-D.1 本轮不引入 onnxruntime-web、不实跑推理。

P9-D.2 接入 onnxruntime-web 运行时骨架：`onnxruntime-web` 作为 optionalDependency + `scripts/sync-onnxruntime-vendor.js`（缺包 exit 0）同步到 `public/vendor/onnxruntime/`；`public/core/ocr/paddle-ocr-runtime.js` 提供 `loadOnnxRuntime`（dynamic import 同源 vendor ORT，设 `ort.env.wasm.wasmPaths` 同源、Node 抛 `OCR_VENDOR_LOAD_FAILED`）、`pickExecutionProviders`（`navigator.gpu` → `["webgpu","wasm"]`，否则 `["wasm"]`）、`createOcrSession`/`disposeOcrSession` 骨架。`paddleOcrEngine.recognize` 第三阶段经 `loadOnnxRuntime()`，浏览器装好 vendor + 模型后以 `pipeline-not-wired` 拒绝（det/cls/rec 推理管线 + CTC 解码留给 P9-D.2.b）。Tauri CSP 已含 `wasm-unsafe-eval` + `worker-src blob:` + `connect-src 'self'`，无需改动。后续：P9-D.4 接入转换链并让 paddle 在可用时优先于 tesseract。

P9-D.3 模型导入与安全中心管理：复用 tesseract tessdata 的**本地导入**模式（禁联网，不做远程 fetch）。安全中心「模型缓存」对 PP-OCRv5 行渲染导入 det/cls/rec onnx + 清除按钮；导入走 file picker → `sha256Hex` → `defaultOCRStorage.put("paddleocr/v5/<file>")` → `paddleOcrEngine.ensureProbe()`，三件齐全才 `markPaddleOcrVendorReady(true)` + 状态 `available`。**同时修复一个潜伏 bug**：`paddleOcrEngine` / `tesseractOCREngine` 的就绪状态原先存在 `Object.freeze` 后的实例属性上，`ensureProbe()` 赋值在严格模式（ES module）下抛 `Cannot assign to read only property`，会让安全中心导入流程静默失败；改为模块级可变变量持有就绪状态，引擎对象仍冻结。

P9-D.2.b 推理管线：`public/core/ocr/paddle-ocr-pipeline.js` 提供纯函数 `parseCharDictionary` / `preprocessForDetection`（ImageNet 归一化 + 32 倍数 + limit_side_len）/ `preprocessForRecognition`（高 48 + [-1,1] 归一化）/ `dbPostProcess`（阈值二值化 + 4-连通域 + 轴对齐 bbox + box 分数过滤 + 缩放回原图）/ `ctcGreedyDecode`（逐时刻 argmax → 折叠连续重复 → 去 blank → 映射字典）/ `cropImageData` / `resizeRgba`，以及编排器 `runPaddlePipeline({ ort, detSession, clsSession, recSession, imageData, dictionary, options })` → OCRResult。`paddleOcrEngine.recognize` 在浏览器把 image 解码为 RGBA（Image+canvas，不用 fetch）→ 从本地缓存取 det/cls/rec 模型 + 可选字典 `paddleocr/v5/dict.txt` → `createOcrSession` ×3 → `runPaddlePipeline`；Node/未就位仍在 `loadOnnxRuntime` 前置拒绝。纯函数 + 编排器（mock session）在 Node 完整单测，真实模型端到端为浏览器手动。本轮不做 cls 角度旋转校正、不做 minAreaRect+unclip 高精度框。

P9-D.4 接入转换链（路由偏好）：`OCREngineRegistry.pickForTask` 改为**优先级感知**——候选按 `priority` 降序挑第一个 available（缺省 0），无可用时回退末位。引擎优先级 `placeholderOCREngine=0` / `tesseractOCREngine=10` / `paddleOcrEngine=20`，因此 PP-OCRv5 可用时优先于 tesseract。PNG / 扫描 PDF stage（`enhanceWithOCR` / `runScannedPdfOCRStage`）经 `defaultOCRRegistry.pickForTask("ocr-text")` 取引擎，自动选到可用的最高优先级引擎，无需改动。至此 P9-D PP-OCRv5 本地高级 OCR 链路（契约 → 运行时 → 模型导入 → 推理管线 → 路由偏好）齐备，剩真实模型 + 字典导入后的浏览器端端到端验证。

## 不做什么（明确边界）

- **不引入 DOCX / HTML / PDF 文件级 pivot**：pivot 是内存对象，不是落盘文件。
- **不在首屏核心路径引入 LibreOffice / Pandoc / OCR**：核心本地内置模型代码可以核心打包，但模型资源必须按需下载到 model-cache，不能阻塞启动路径，也不进入默认安装包。
- **不破坏 local-only / no-network processing**：所有模型流转在浏览器内或桌面 worker 内。
- **不允许任何 mapper 静默丢信息**：跨模型必发 warning，并写入 qualityReport。
- **不强求 14×11 矩阵全可用**：UI 显示不推荐路径但加严重 warning，不"假装能用"。

## 阶段实施

详细 milestone 见 [DEVELOPMENT_TASKS.md](../DEVELOPMENT_TASKS.md) P8。每个 M1-M6 独立可验收，不破坏旧路径。
