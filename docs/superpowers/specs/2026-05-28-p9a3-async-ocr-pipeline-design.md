# P9-A.3 PNG 异步 OCR 接入 + Repair Engine OCR 入口

状态：生效
日期：2026-05-28
前置基础：P9-A.2.b tessdata IndexedDB + UI 启用 + 真实 OCR / S2 Repair Engine / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-A.4 扫描 PDF 渲染 + 端到端 / P9-B FixedLayoutModel + 视觉对比 / P9-C 转换后检验三层

## 目标

P9-A.2.b 把 `enhanceWithOCR` / IndexedDB / 安全中心 UI 全部接入，但没有任何代码路径会主动调用 enhanceWithOCR。本轮把 PNG 输入路径自动接到 OCR enhancement stage 上，让 OCR 文本进入 SemanticDoc，并且让 Repair Engine 学会从 OCR 元数据生成低置信度修复候选——为 P9-B 真模型审核打开入口。

P9-A.3 落地后：
- 浏览器/桌面端在导入 tessdata 后，PNG → md/txt/html 的输出会包含 OCR 识别文本；不再只是「OCR_UNAVAILABLE」占位。
- `quality.modelReview.ocr` 字段含 lineCount / averageConfidence / engine / runtimeMs 等真实证据。
- `quality.autoRepair.appliedActions` 或 `recommendations` 会出现 `replaceTextRun` 候选条目（针对低置信度行）；P9-B 真模型审核接入后这些 action 可以自动 apply 到 SemanticDoc。
- 既有 `convert()` / `convertContent()` 同步接口完全不变，所有现有调用方与测试都不受影响。

## 数据流

```
convertContentAsync({ from: "png", to: "md" | "txt" | "html" | "json" | "pdf" })
  → registry.convertAsync(payload)
    → prepareConversionModel(payload)            // sync, 现有 P8-B 路径
    → if options.ocr.enabled !== false && from === "png":
         await runOCRStage(model, ctx)           // dynamic import; engine.recognize → enhance
           ├ defaultOCRRegistry.pickForTask("ocr-text")
           ├ enhanceWithOCR(model, { engine })
           │   ├ resolveAssetData(model)
           │   ├ engine.recognize({ image })  → OCRResult
           │   ├ append paragraph blocks from pages[].lines
           │   ├ metadata.modelReview.ocr = summarizeOCRResult(result)
           │   └ metadata.ocr.lines = [{ pageIndex, lineIndex, text, confidence, bbox, blockId }]
           └ failure → withWarnings([OCR_ENGINE_FAILED]) → 返回原 model
    → write({ model, to, ... })                  // sync, writer 把 OCR paragraphs 一起渲染
    → _wrapWithRepairCycle(...)                  // sync, 与 convert() 共享
      └ defaultRepairEngine.runCycle
         ├ detectLossyRepairHints (S2)
         ├ detectRouteClassDegradation (S2)
         └ detectOCRLowConfidence (P9-A.3 新增)
            └ → replaceTextRun candidates 对 confidence < 0.55 的行
```

## 新增模块

| 文件 | 职责 |
| --- | --- |
| [`public/core/ocr/ocr-stage.js`](../../../public/core/ocr/ocr-stage.js) | `runOCRStage(model, ctx)`：包装 `enhanceWithOCR` + 注入 `OCR_ENGINE_FAILED` warning 兜底；`getDefaultOCRLanguage` 提取语言默认值 |
| [`public/core/ocr/ocr-validator.js`](../../../public/core/ocr/ocr-validator.js) | `detectOCRLowConfidence(model)`：从 `metadata.ocr.lines` 取 confidence < 0.55 的行生成 `replaceTextRun` 候选；每页最多 8 条；evidence 含 engineId / language / bbox / pageIndex / lineIndex |
| `samples/png/t2f-sample.data-url.txt` | 80×24 灰度 PNG（白底黑字 "T2F"）的 data URL，118 字节 base64 后约 182 字符；用于 OCR pipeline 端到端 stub 测试 |
| `samples/png/README.md` | 说明三个 tiny-{color} PNG 和 t2f-sample 的用途，并给出浏览器端真实 OCR 验证步骤 |

## 修改文件

### `public/core/format-registry.js`
- 提取共享 helper：`_buildRepairCtx(...)` 与 `_wrapWithRepairCycle(...)`，让 sync `convert()` 与 async `convertAsync()` 复用同一套 repair / audit 包装代码。
- 新增 `async convertAsync({ content, from, to, title, fileName, options })`：与 `convert()` 同样的入口校验和 prepareConversionModel；当 `options?.ocr?.enabled !== false && fromFormat === "png"` 时 `await dynamic-import runOCRStage(model, ctx)` 注入 OCR enhancement；之后走同一份 `_wrapWithRepairCycle`。

### `public/browser-transformer.js`
- 顶层 export `convertContentAsync(payload)` → `registry.convertAsync(payload)`。
- 顶层 export `runOCRStage` / `getDefaultOCRLanguage` / `detectOCRLowConfidence`。

### `public/core/repair-engine.js`
- `createDefaultRepairEngine()` 在注册 `DEFAULT_VALIDATORS` 之后追加 `engine.registerValidator(detectOCRLowConfidence)`。`replaceTextRun` handler 已存在（S2），自动复用。

### `public/core/ocr/png-ocr.js`
- `enhanceWithOCR` 在追加 paragraph blocks 的同时把 `pages[].lines` 一一展开写入 `model.metadata.ocr.lines`，每条含 `{ pageIndex, lineIndex, text, confidence, bbox, blockId }`，让 `detectOCRLowConfidence` 能用 blockId 反查具体 paragraph。

### `public/app.js`
- import 新增 `convertContentAsync as convertInBrowserAsync`。
- `convertWithWorker(payload)` 在 worker 不可用且 `payload.from === "png"` 时改走 `convertInBrowserAsync(payload)`，其他格式仍走同步 `convertInBrowser(payload)`。

## 错误编号与 warning

| 编号 | 触发 |
| --- | --- |
| `OCR_UNAVAILABLE` | 无可用 engine 或 vendor/tessdata 缺失 |
| `OCR_ENGINE_FAILED` | recognize 抛错 / OCR stage 兜底 |
| `OCR_LOW_CONFIDENCE` | averageConfidence < 0.6 阈值 |
| `OCR_VENDOR_LOAD_FAILED` | dynamic import vendor 失败 |

Repair Engine 用 `replaceTextRun` action 把低置信度行作为候选 —— **P9-A.3 阶段不强制 apply**（默认 confidence = 1 - ocrConfidence 接近 1，会进入 applied 路径，但实际 handler 因 before === after 不会修改文本）；P9-B 真模型审核接入后，validator 会提供差异化 `after`，自动修复才会真实生效。

## 守门

[`scripts/ocr-baseline-test.js`](../../../scripts/ocr-baseline-test.js) 扩展为 26 组断言（原 20 + 6 新增）：
- `convertContentAsync` 在 `options.ocr.enabled = false` 时返回 writer payload（与 sync convert 同 shape）。
- `convertContentAsync` 注册 stub engine 后，输出 markdown / txt 包含 stub OCR 文本。
- `runOCRStage` 持久化 `metadata.ocr.lines`，含 confidence + blockId。
- `detectOCRLowConfidence` 对 confidence < 0.55 的行生成 `replaceTextRun` 候选；高置信度（>= 0.55）不生成。
- `samples/png/t2f-sample.data-url.txt` fixture 通过 `convertContentAsync({ from: "png", to: "txt", options: { ocr: { enabled: false } } })` 不抛错。

[`scripts/local-security-test.js`](../../../scripts/local-security-test.js) 自动覆盖 `public/core/ocr/ocr-stage.js` + `ocr-validator.js`：两者均不含 fetch / localStorage / XHR / WebSocket，符合 local-only 默认规则。

[`scripts/local-model-direction-test.js`](../../../scripts/local-model-direction-test.js) 守门关键词新增 `convertContentAsync` / `runOCRStage` / `detectOCRLowConfidence`（在 multiModel 文件中）。

## 不引入

- 不引入 npm 依赖（无 idb / dexie / canvas polyfill）。
- 不修改 Tauri CSP（A.2 已加 `'wasm-unsafe-eval'`）。
- 不动 reader / writer（PNG reader 同步签名保留；OCR 是独立 async stage）。
- 不修改产品矩阵（PNG 输出仍是 `["html","txt","json","pdf"]`，OCR 文本写入 SemanticDoc 后自动让 txt/html 输出携带）。
- 不真实跑 OCR 在 npm test 中（stub engine 覆盖代码路径；真实 OCR 验证靠手动浏览器）。

## 未来扩展（A.4 / B 之后）

- P9-A.4：把 pdfjs 渲染扫描 PDF 每页为 canvas → `canvas.convertToBlob()` → 调用 `enhanceWithOCR` 多页合并；自动判别扫描型（提取字数 < 阈值则视为扫描）。
- Repair Engine 把高置信度 OCR 文本作为「auto-applied」（语言模型/字典加权后），而非候选。
- 多语言 UI 切换（chi_tra / jpn / kor）。
- 高级 OCR（PaddleOCR-VL / MinerU）作为新 engine 注册；表格 / 公式 / 复杂版面识别。
- Repair Engine 接入语义 fuzzy match：把 OCR 低置信度文本与字典做模糊匹配，自动生成可信的 `after` 文本。
