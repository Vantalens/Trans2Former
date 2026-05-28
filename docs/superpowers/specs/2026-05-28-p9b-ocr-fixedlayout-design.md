# P9-B OCR → FixedLayoutModel + 浏览器端 rasterize 真实化

状态：生效
日期：2026-05-28
前置基础：P9-A.4 扫描 PDF OCR 检测 + Rasterizer 骨架 / P9-A.3 PNG 异步 OCR / S2 Repair Engine / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-C 转换后检验三层 / P9-D 高级 OCR

## 目标

P9-A.4 已经把扫描 PDF 检测 + PdfPageRasterizer 抽象 + 多页 OCR stage 接好，但 OCR 结果**没有进入 FixedLayoutModel** 这条规范模型路径，浏览器/Tauri 端 `defaultPdfPageRasterizer` 也仍是 Node throw 占位。本轮把这两块同步拼上，让扫描 PDF 转换产物携带真实 FixedLayoutModel + SemanticDoc 双视图，且浏览器端开箱即用。

P9-B 落地后：
- 扫描 PDF 输入 → `runScannedPdfOCRStage` → OCR 多页结果 → `mergeOCRResultsToFixedLayout` 产 FixedLayoutModel（含 bbox / confidence / readingOrderHint）→ `fixedLayoutToSemantic` 派生 paragraph blocks。
- `model.fixedLayout` 暴露给 writer / Repair Engine / UI；`metadata.modelReview.ocr.fixedLayout` 含 `getFixedLayoutSummary`。
- 浏览器/Tauri 端首次 rasterize/countPages 自动 dynamic import `pdf-rasterizer-browser.js`，再 dynamic import `/vendor/pdfjs/pdf.min.mjs`，用 canvas + page.render 渲染每页 → toDataURL；Node 仍抛 `OCR_RASTERIZER_UNAVAILABLE`，stub 测试零回归。
- 同步 `convert()` / PNG enhance / Repair Engine handlers 完全不动。

## 数据流

```
convertContentAsync({ from: "pdf", to: "txt" })
  → registry.convertAsync(payload)
    → prepareConversionModel(payload)                    // sync, P8-B
    → isScannedPdf(content)? if true:
        runScannedPdfOCRStage(model, ctx)
          ├ defaultPdfPageRasterizer.countPages(...)
          ├ for pageIndex in 0..min(maxScanPages, pageCount):
          │   defaultPdfPageRasterizer.rasterize({ pageIndex })  ← 浏览器自动加载 pdf-rasterizer-browser
          │   engine.recognize({ image: dataUrl })
          │   collect pageResult
          ├ mergeOCRResultsToFixedLayout(pageResults) → FixedLayoutModel
          │     ├ ocrResultToFixedLayoutPage(...) per page (y → x 排序 + confidence)
          │     └ metadata.readingOrder = "heuristic-yx"
          ├ enhanced.fixedLayout = FixedLayoutModel
          ├ fixedLayoutToSemantic(fixedLayout) → SemanticDoc blocks
          ├ enhanced.blocks.push(...semanticFromLayout.blocks)
          ├ warnings: MODEL_VISUAL_FIDELITY_LOST + MODEL_TEXT_ORDER_HEURISTIC (info)
          ├ metadata.ocr.lines (Repair Engine 兼容)
          └ metadata.modelReview.ocr.fixedLayout = getFixedLayoutSummary(fixedLayout)
    → write({ model, to, options })                      // sync, writer 看到完整 blocks
    → _wrapWithRepairCycle(...)                          // sync, 与 convert() 共享
```

## 新增 / 改造模块

| 文件 | 职责 |
| --- | --- |
| [`public/core/ocr/ocr-to-fixed-layout.js`](../../../public/core/ocr/ocr-to-fixed-layout.js) | `ocrResultToFixedLayoutPage(result, { pageNumber, pageIndex })`：按 bbox.y → bbox.x 排序 textRuns + 附 confidence；`mergeOCRResultsToFixedLayout(results)`：多页合并为 FixedLayoutModel + `metadata.readingOrder = "heuristic-yx"` + `metadata.ocr` 总览。复用 `createFixedLayoutModel` / `createPage` / `createTextRun`。 |
| [`public/core/ocr/pdf-rasterizer-browser.js`](../../../public/core/ocr/pdf-rasterizer-browser.js) | `createBrowserPdfPageRasterizer({ vendorUrl })`：dynamic import `/vendor/pdfjs/pdf.min.mjs` → `getDocument({ data })` → `pdf.getPage(n)` → `page.getViewport({ scale })` → 创建 `<canvas>` + `page.render({ canvasContext, viewport })` → `canvas.toDataURL("image/png")` → `{ dataUrl, width, height }`；失败抛 `OCR_RASTERIZER_FAILED` 含 cause；浏览器 runtime 检测在 `ensureBrowserRuntime`。 |
| [`public/core/ocr/pdf-rasterizer.js`](../../../public/core/ocr/pdf-rasterizer.js) | 重构 `defaultPdfPageRasterizer`：缓存 `_injectedRasterizer`（setter）+ `_autoBrowserImpl`（lazy dynamic import `pdf-rasterizer-browser.js`）；`rasterize/countPages` 优先级 inject → auto-browser → throw `OCR_RASTERIZER_UNAVAILABLE`；`resetPdfPageRasterizer` 清两个缓存。 |
| [`public/core/ocr/scan-pdf-stage.js`](../../../public/core/ocr/scan-pdf-stage.js) | 收集每页 OCR result → `mergeOCRResultsToFixedLayout` → `model.fixedLayout` + `fixedLayoutToSemantic` 派生 blocks + 发 `MODEL_VISUAL_FIDELITY_LOST` / `MODEL_TEXT_ORDER_HEURISTIC` info warning + `metadata.modelReview.ocr.fixedLayout = getFixedLayoutSummary(...)`；`metadata.ocr.lines` 仍为 Repair Engine validator 提供。 |
| [`public/core/models/fixed-layout.js`](../../../public/core/models/fixed-layout.js) | `createTextRun` 新增 `confidence`（默认 0，clamp 到 [0,1]）；`createPage` 新增 `readingOrderHint`（默认 ""）。不破坏现有 OFD / PDF reader 调用。 |

## 阅读顺序启发式

`ocrResultToFixedLayoutPage` 内部对每页 lines 做：

```js
lines.sort((a, b) => {
  if (a.bbox.y !== b.bbox.y) return a.bbox.y - b.bbox.y;  // 上 → 下
  return a.bbox.x - b.bbox.x;                              // 左 → 右
});
```

简单 y → x 启发式不区分多栏，但配合 `MODEL_TEXT_ORDER_HEURISTIC` info warning 让上层（用户 / Repair Engine）知道这是粗糙顺序；后续 P9-C/D 可以扩展为 multi-column detection / heading 推断。

## 浏览器端 rasterize 自动加载

```js
// pdf-rasterizer.js (P9-B 重构后)
async function tryLoadBrowserRasterizer() {
  if (_autoBrowserImpl) return _autoBrowserImpl;
  if (_autoBrowserLoadFailed) return null;
  if (!isBrowserRuntime()) { _autoBrowserLoadFailed = true; return null; }
  try {
    const mod = await import("./pdf-rasterizer-browser.js");
    _autoBrowserImpl = mod.createBrowserPdfPageRasterizer();
    return _autoBrowserImpl;
  } catch (error) {
    _autoBrowserLoadFailed = true;
    return null;
  }
}

defaultPdfPageRasterizer.rasterize(args) →
  injected? injected.rasterize :
  auto-browser? autoImpl.rasterize :
  throw OCR_RASTERIZER_UNAVAILABLE
```

测试通过 `setPdfPageRasterizer(stub)` 始终优先 inject；`resetPdfPageRasterizer()` 同时清两个缓存（让下个测试重新走 fallback 路径）。

## 错误编号

复用：`OCR_RASTERIZER_UNAVAILABLE` / `OCR_RASTERIZER_FAILED` / `OCR_RASTERIZER_INVALID` / `OCR_UNAVAILABLE` / `OCR_ENGINE_FAILED` / `OCR_LOW_CONFIDENCE`。

新 warning：`MODEL_VISUAL_FIDELITY_LOST`（info） / `MODEL_TEXT_ORDER_HEURISTIC`（info）—— 由 `runScannedPdfOCRStage` 发出。

## 守门

[`scripts/ocr-baseline-test.js`](../../../scripts/ocr-baseline-test.js) 扩展为 34 组断言（原 30 + 4 新增）：
- `ocrResultToFixedLayoutPage` 把 OCRResult 转为 textRuns 按 y/x 排序的 FixedLayoutModel.page，confidence 字段被携带。
- `mergeOCRResultsToFixedLayout` 多页合并 + `getFixedLayoutSummary` 计数正确 + `fixedLayoutToSemantic` 派生 blocks。
- `runScannedPdfOCRStage` stub 端到端后：`enhanced.fixedLayout.pages.length === 2`、`metadata.modelReview.ocr.fixedLayout.pageCount === 2`、`warnings` 含 `MODEL_VISUAL_FIDELITY_LOST` + `MODEL_TEXT_ORDER_HEURISTIC`。
- `defaultPdfPageRasterizer` 优先级：Node + 无 inject → 抛；inject stub → stub 生效；reset → 抛回去。

[`scripts/local-security-test.js`](../../../scripts/local-security-test.js) 把 `ocr-to-fixed-layout.js` + `pdf-rasterizer-browser.js` 加入 `ALLOWED_PUBLIC_FILES` + `STRICT_LOCAL_ONLY_FILES`。

[`scripts/local-model-direction-test.js`](../../../scripts/local-model-direction-test.js) 守门关键词新增 `ocrResultToFixedLayoutPage` / `mergeOCRResultsToFixedLayout` / `createBrowserPdfPageRasterizer` / `MODEL_TEXT_ORDER_HEURISTIC`。

## 不引入

- 不实现高级阅读顺序算法（multi-column / heading detection）：留给 P9-C / P9-D。
- 不在仓库加真实扫描 PDF fixture：用最小 PDF 头 + stub rasterizer + stub engine 覆盖代码路径。
- 不引入 npm 依赖：pdfjs-dist 仍 optionalDependency；canvas 用浏览器原生 API。
- 不修改 Tauri CSP（A.2 已加 `'wasm-unsafe-eval'`）。
- 不动同步 `convert()` / PNG enhance / Repair Engine handlers / 转换核心 / 其它 reader writer / UI 路由。
- 不修改产品矩阵；PDF 输出仍是 `["md","html","txt","json","xml","docx","pdf"]`。

## 未来扩展（P9-C / D）

- 真实扫描 PDF fixture（约 10 KB 含中英文）入库 + 浏览器端 OCR 回归测试（需要 tessdata，留给手动浏览器）。
- 阅读顺序进阶：multi-column 检测、heading 推断、table 区域识别。
- FixedLayoutModel 写出：PDF / OFD writer 直接消费 `model.fixedLayout`，不经过 SemanticDoc 降级。
- 视觉对比（SSIM）：原始 PDF 渲染 vs 输出回 PDF 渲染做 SSIM 对比，写入 `qualityReport.layoutFidelity / visualFidelity`（P9-C 工作）。
- 高级 OCR runtime（PaddleOCR-VL / MinerU）作为新 engine 注册到 `defaultOCRRegistry`，覆盖表格 / 公式 / 复杂版面。
