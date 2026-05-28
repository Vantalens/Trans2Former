# P9-A.4 扫描 PDF OCR 检测 + Rasterizer 骨架 + 多页 stage

状态：生效
日期：2026-05-28
前置基础：P9-A.3 PNG 异步 OCR 接入 / P9-A.2.b tessdata IDB + 真实 OCR / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-B OCR → FixedLayoutModel / P9-C 转换后检验三层 / P9-D 高级 OCR

## 目标

P9-A.3 已经把 PNG 路径接入 `convertContentAsync` + `runOCRStage`，但扫描 PDF 仍走 P8-B 文本提取路径——没有页面图像渲染，没有 OCR 调用。本轮在 OCR 模块新增「扫描 PDF 检测 + 页面 rasterize → 多页 OCR enhance」管线，让 `convertContentAsync` 自动识别扫描型 PDF 并接入 OCR 链路。本轮**不实现真实 pdfjs canvas 渲染**（留给 P9-B / 浏览器手动验证），但 stub rasterizer + stub engine 完整覆盖 npm test 端到端代码路径。

P9-A.4 落地后：
- `convertContentAsync({ from: "pdf", to: "txt" })` 检测到扫描 PDF（无 pdfjs payload 或提取字数 < 阈值）时，自动调用 `runScannedPdfOCRStage(model, ctx)`。
- `runScannedPdfOCRStage` 依次 `rasterizer.rasterize({ pageIndex })` 渲染每页为 PNG data URL → `engine.recognize({ image })` → 把多页 OCR paragraphs 追加到 SemanticDoc。
- `metadata.modelReview.ocr.pageCount` / `lineCount` / `averageConfidence` / `runtimeMs` 总览；`metadata.ocr.lines` 持久化每条带 `pageIndex` + `blockId`，Repair Engine 的 `detectOCRLowConfidence` validator 自动复用。
- 现有同步 `convert()` 完全不变；不破坏任何现有测试。

## 数据流

```
convertContentAsync({ from: "pdf", to: "txt" })
  → registry.convertAsync(payload)
    → prepareConversionModel(payload)               // sync, 原有 P8-B 文本提取
    → if options.ocr.enabled !== false && from === "pdf":
         const { isScannedPdf } = await import("./ocr/pdf-rasterizer.js")
         const detection = await isScannedPdf(content)
         if (detection.scanned):
           const { runScannedPdfOCRStage } = await import("./ocr/scan-pdf-stage.js")
           model = await runScannedPdfOCRStage(model, { content, options, from, to })
              ├ rasterizer.countPages({ content })
              ├ for pageIndex in 0..min(maxScanPages, pageCount):
              │   rasterizer.rasterize({ content, pageIndex, dpi })
              │   → { dataUrl, width, height }
              │   engine.recognize({ image: dataUrl })
              │   → OCRResult
              │   model.blocks.push(...paragraphsFromPageResult(result))
              │   metadata.ocr.lines.push({ pageIndex, lineIndex, text, confidence, bbox, blockId })
              ├ metadata.modelReview.ocr = { pageCount, lineCount, averageConfidence, runtimeMs, engine, language }
              └ if averageConfidence < 0.6: OCR_LOW_CONFIDENCE
    → write({ model, to, options })                 // sync, 现有 writer
    → _wrapWithRepairCycle(...)                     // sync, 与 convert() 共享
      └ defaultRepairEngine.runCycle
         ├ detectLossyRepairHints (S2)
         ├ detectRouteClassDegradation (S2)
         └ detectOCRLowConfidence (P9-A.3) → replaceTextRun 候选
```

## 新增模块

| 文件 | 职责 |
| --- | --- |
| [`public/core/ocr/pdf-rasterizer.js`](../../../public/core/ocr/pdf-rasterizer.js) | `isScannedPdf(content, options)` 启发式（基于 `expandPdfContentForTextExtraction` + 检测 `PDFJS_PAYLOAD_MARKER` + 字符阈值）；`PdfPageRasterizer` 抽象 + `defaultPdfPageRasterizer`（Node 默认抛 `OCR_RASTERIZER_UNAVAILABLE`）；`setPdfPageRasterizer(impl)` / `resetPdfPageRasterizer()` 让测试注入 stub |
| [`public/core/ocr/scan-pdf-stage.js`](../../../public/core/ocr/scan-pdf-stage.js) | `runScannedPdfOCRStage(model, ctx)`：多页 rasterize + enhance 合并；任何错误注入 `OCR_ENGINE_FAILED` warning 后返回原 model；`maxScanPages` / `dpi` / `language` 可通过 `options.ocr.*` 调整 |

## isScannedPdf 启发式

```js
async function isScannedPdf(content, options = {}) {
  try {
    const expanded = await expandPdfContentForTextExtraction(content);
    if (!expanded.includes("% Trans2Former PDFJS_TEXT_START")) {
      return { scanned: true, reason: "no-pdfjs-payload" };  // pdfjs 无法解析或返回空
    }
    const model = readPdf({ content: expanded });
    const extractedChars = countModelText(model);  // 去空白后字符数
    return {
      scanned: extractedChars < threshold,  // 默认 300
      extractedChars,
      threshold,
      reason: extractedChars < threshold ? "low-extracted-text" : "text-pdf",
    };
  } catch (error) {
    return { scanned: true, reason: `extraction-failed:${error.message}` };
  }
}
```

- 不带 PDFJS_PAYLOAD 标记 → 视为扫描（pdfjs 解析失败或无文本对象）。
- 带 PDFJS_PAYLOAD 但提取字符 < 300 → 视为扫描（典型扫描页面 + 偶尔字幕/页码）。
- 带 PDFJS_PAYLOAD 且 ≥ 300 字符 → 文本 PDF，不走 OCR。

调用方可通过 `options.ocr.scanPdfThreshold` 调阈值。误判（文本 PDF 走 OCR）的兜底是 `runScannedPdfOCRStage` 在 engine 不可用时返回原 model + `OCR_UNAVAILABLE` warning，不阻塞写出。

## PdfPageRasterizer 接口

```js
{
  rasterize({ content, pageIndex, dpi }): Promise<{ dataUrl, width, height }>,
  countPages({ content }): Promise<number>,
}
```

- `defaultPdfPageRasterizer` 在 Node 默认实现抛 `OCR_RASTERIZER_UNAVAILABLE`。
- 浏览器/Tauri 端**本轮不实现真实 pdfjs canvas 渲染** —— 留给 P9-B（FixedLayoutModel 需要相同的渲染能力）。
- 测试通过 `setPdfPageRasterizer(stubImpl)` 注入桩。

## 错误编号

- `OCR_RASTERIZER_UNAVAILABLE` —— 默认 rasterizer 未实现（Node 环境或未注入实现）。
- `OCR_RASTERIZER_FAILED` —— rasterize 抛出非业务错误。
- `OCR_RASTERIZER_INVALID` —— `setPdfPageRasterizer` 接收的对象缺方法。

复用 `OCR_UNAVAILABLE` / `OCR_ENGINE_FAILED` / `OCR_LOW_CONFIDENCE` 与 PNG 路径一致。

## 守门

[`scripts/ocr-baseline-test.js`](../../../scripts/ocr-baseline-test.js) 扩展为 30 组断言（原 26 + 4 新增）：
- `isScannedPdf` 对无 pdfjs payload 的最小 PDF 头返回 scanned=true。
- `defaultPdfPageRasterizer.rasterize` 在 Node 抛 `OCR_RASTERIZER_UNAVAILABLE`。
- 注入 stub rasterizer（返回固定 dataUrl）+ stub engine（返回 stub OCRResult），`runScannedPdfOCRStage` 2 页输入下追加 2 条 paragraph blocks + 写入 `metadata.modelReview.ocr.pageCount=2` + `metadata.ocr.lineCount=2`。
- `convertContentAsync({ from: "pdf", to: "txt" })` 在 stub rasterizer + stub engine 下产出含 OCR 文本的 txt。

[`scripts/local-security-test.js`](../../../scripts/local-security-test.js) 把 `pdf-rasterizer.js` + `scan-pdf-stage.js` 加入 `ALLOWED_PUBLIC_FILES` + `STRICT_LOCAL_ONLY_FILES`。

[`scripts/local-model-direction-test.js`](../../../scripts/local-model-direction-test.js) 守门关键词加 `isScannedPdf` / `runScannedPdfOCRStage` / `defaultPdfPageRasterizer`。

## 不引入

- 不实现真实浏览器端 pdfjs canvas 渲染（P9-B）。
- 不在仓库加扫描 PDF fixture（用拼接的最小 PDF 字节串覆盖代码路径）。
- 不引入 npm 依赖（pdfjs-dist 仍是 optionalDependency；无 canvas / node-canvas）。
- 不修改 Tauri CSP（A.2 已加 `'wasm-unsafe-eval'`）。
- 不动同步 `convert()` 或 PNG 异步 stage（P9-A.3）。

## 未来扩展（P9-B 之后）

- 真实浏览器端 `defaultPdfPageRasterizer.rasterize` 实现：dynamic import `/vendor/pdfjs/pdf.min.mjs` → `getDocument` → `page.render({ canvasContext })` → `canvas.toBlob()` → 返回 dataUrl。
- 真实扫描 PDF fixture（约 10 KB 含中英文）入库 + 端到端 OCR 验证（需要 tessdata，留给手动浏览器）。
- 多页并发 worker pool：目前是串行渲染 + OCR。
- 混合型 PDF：每页判别扫描 vs 文本，分别处理，输出合并。
- FixedLayoutModel：每页 OCR 结果 + bbox 写入 FixedLayoutModel，供 P9-B 的 layout / table 恢复使用。
- 视觉对比：扫描 PDF OCR 输出 → 渲染回 PDF → SSIM 比对（P9-C）。
