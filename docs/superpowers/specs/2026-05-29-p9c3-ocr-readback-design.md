# P9-C.3 OCR 回读 · 转换后检验三层第三层

状态：生效
日期：2026-05-29
前置基础：[2026-05-29-p9c-three-layer-verification-design.md](2026-05-29-p9c-three-layer-verification-design.md) / P9-C.1 规则 diff / P9-C.2 SSIM 视觉回环 / P9-A.2.b tesseract runtime
后续阶段：P9-D 高级 OCR

## 目标

P9-C 三层检验的第三层，也是收口层：OCR 回读。把转换**输出**（当前仅 PDF）栅格化后用 OCR 引擎读回文本，与**原始 SemanticDoc 文本**对照，写入 `qualityReport.ocrReadback`，回答「转成视觉格式后，文字还认得回来吗」。

落地后：

- `convertContentAsync({ from: "md", to: "pdf" })`（以及 html/txt/docx/... → pdf）在 OCR engine 可用时，`result.quality.qualityReport.ocrReadback = { recall, precision, f1, threshold, passed, engineId, originalLength, recognizedLength, averageConfidence }`。
- OCR engine 不可用（Node 默认 placeholder / 用户未导入 tessdata）或输出不可栅格化 → `qualityReport.ocrReadback = null` + `verification.skipped` 带 reason，不阻塞。
- 文本相似度 `compareText` **纯函数、零依赖、字符级多重集**，跨中英文稳健，Node 完全可测。
- 渲染 + OCR 本轮 **stub-only**：Node 无 canvas/tessdata，用注入 stub engine + stub rasterizer 覆盖代码路径；真实 OCR 回读端到端留给浏览器手动验证。

## 为什么是字符级多重集相似度

OCR 输出有噪声，且中文无空格分词。token（空格切分）召回对 CJK 失效。采用**字符级多重集**：

- `originalChars` = 归一化（NFKC + 小写 + 去空白）后原文字符多重集
- `recognizedChars` = OCR 文本同样归一化后的多重集
- `intersection = Σ min(count_original(c), count_recognized(c))`
- `recall = intersection / max(1, |originalChars|)`（原文有多少被读回）
- `precision = intersection / max(1, |recognizedChars|)`（OCR 读到的有多少是原文里的）
- `f1 = 2PR/(P+R)`

字符级对中英文混排、OCR 噪声都稳健，零依赖。

## 数据流

```
convertContentAsync({ from: <text-bearing>, to: "pdf" })
  → ... write → _wrapWithRepairCycleAsync
      └ verification = await runVerificationStageAsync(...)
          ├ base = runVerificationStage(...)              // rule-diff（同步）
          ├ ssim = await runSsimLayer(...)                // 视觉回环
          └ ocrReadback = await runOcrReadbackLayer(...)  // 动态 import ocr-readback.js
              ├ gate: ctx.to === "pdf" 且 原文有文本
              ├ engine = injected || defaultOCRRegistry.pickForTask("ocr-text")；不可用→eligible:false
              ├ rasterizer = injected || OCR defaultPdfPageRasterizer
              ├ raster = await rasterizer.rasterize({ content: output.data, pageIndex: 0 })  // dataURL
              ├ ocr = await engine.recognize({ image: raster.dataUrl, options:{language} })
              ├ recognizedText = ocr.fullText || join(pages.lines.text)
              ├ compareText(originalText, recognizedText) → { recall, precision, f1 }
              └ passed = f1 >= threshold；低于发 info OCR_READBACK_DRIFT
      → _assembleQuality → quality.qualityReport.{ ruleDiff, ssim, ocrReadback }
```

## 新增 / 改造模块

| 文件 | 职责 |
| --- | --- |
| `public/core/verification/ocr-readback.js` | `compareText(original, recognized)` 纯函数（字符多重集 recall/precision/f1 + `normalizeText`）+ `extractModelText(model)`（拼接 block 文本）+ `runOcrReadbackLayer({ model, output, ctx, engine?, rasterizer? })` 异步层。常量 `DEFAULT_OCR_READBACK_THRESHOLD` / warning `OCR_READBACK_DRIFT` / `OCR_READBACK_FAILED`。 |
| `public/core/verification/verification-stage.js` | `runVerificationStageAsync` 末尾 dynamic import `ocr-readback.js` 跑第三层；合并 `layers`/`skipped`/`warnings` + `ocrReadback` 字段。 |
| `public/core/format-registry.js` | `_assembleQuality` 增 `ocrReadback: verification.ocrReadback ?? null`（同步路径恒 null）。 |
| `public/browser-transformer.js` | 顶层 export `compareText` / `extractModelText` / `runOcrReadbackLayer` / `OCR_READBACK_DRIFT` / `DEFAULT_OCR_READBACK_THRESHOLD`。 |
| `scripts/ocr-readback-test.js` | 断言：compareText（相同=1、子集 recall<1/precision=1、CJK、空文本）+ extractModelText + runOcrReadbackLayer（stub engine+rasterizer 端到端 / engine 不可用 eligible:false / 非 pdf 输出 eligible:false / rasterize 抛错兜底）+ runVerificationStageAsync 三层合并 + convertContentAsync md→pdf 注入 stub 填充 ocrReadback。 |
| `package.json` | test 链插入 `ocr-readback-test.js`（在 `ssim-verification-test.js` 之后）。 |
| `scripts/local-security-test.js` | `ocr-readback.js` 加 ALLOWED + STRICT。 |
| `scripts/local-model-direction-test.js` | 守门加 `runOcrReadbackLayer` / `compareText` / `OCR_READBACK_DRIFT`。 |
| `docs/MULTI_MODEL_ARCHITECTURE.md` / `DEVELOPMENT_TASKS.md` | 同步章节、状态行、验收条目；脚本计数 22 → 23。 |

## 资格与阈值

- OCR 回读 eligible 条件：`ctx.to === "pdf"`（当前唯一可栅格化文本 writer）且原文文本非空 且 OCR engine 可用 且 rasterizer 成功。
- 命中路径：`md/html/txt/json/xml/docx/doc/epub/csv/xlsx → pdf`（凡产出 PDF 的文本路径）。
- 默认阈值 `f1 >= 0.7`（OCR 噪声容忍）；低于发 info 级 `OCR_READBACK_DRIFT`，不判失败、不阻塞。
- engine 不可用（Node placeholder / 未导入 tessdata）→ `eligible:false, reason:"ocr-engine-unavailable"`，不抛。
- rasterizer 不可用 → `eligible:false, reason:"rasterizer-unavailable"`；rasterize/recognize 抛错 → `OCR_READBACK_FAILED` info warning + eligible:false。

## 验收门槛

1. `npm test` 全 23 个脚本通过；P9-C.1/C.2、repair-engine、ocr-baseline 不漂移。
2. `compareText` 纯函数 Node 完整覆盖（相同/子集/CJK/空）。
3. `runOcrReadbackLayer` 注入 stub engine + stub rasterizer 端到端，写出 `qualityReport.ocrReadback`。
4. `convertContent`（sync）行为不变：`qualityReport.ocrReadback === null`。
5. 三层 envelope 对齐：`layers` 含 `ocr-readback` ⟺ `qualityReport.ocrReadback` 非 null。
6. 守门 + 白名单 + docs 同步；`git diff --check` / `npm run release:prepare` 通过。

## 本轮不做

- **不入库** 真实 PDF 渲染 + tessdata OCR 回读 fixture（stub-only；浏览器端真实回读手动验证）。
- **不引入** 新 npm 依赖。
- **不让** Repair Engine 消费 `ocrReadback`（避免循环依赖）。
- **不做** 多页回读（仅第 1 页）；不做 OCR→原文的逐块定位（只给聚合 recall/precision/f1）。
- **不改** 同步 `convert()` 语义 / `options.repair === false` 短路 / UI。
- **不接** 高级 OCR（PaddleOCR-VL / MinerU 属 P9-D）；回读复用已注册的 `ocr-text` engine。
