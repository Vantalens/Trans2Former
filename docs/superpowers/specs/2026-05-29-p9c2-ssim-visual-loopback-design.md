# P9-C.2 SSIM 视觉对比 · 视觉回环层

状态：生效
日期：2026-05-29
前置基础：[2026-05-29-p9c-three-layer-verification-design.md](2026-05-29-p9c-three-layer-verification-design.md) / P9-C.1 规则 diff / P9-B 浏览器 rasterize / [2026-05-27-pdf-single-page-visual-regression-design.md](2026-05-27-pdf-single-page-visual-regression-design.md)
后续阶段：P9-C.3 OCR 回读 / P9-D 高级 OCR

## 目标

P9-C 三层检验的第二层：SSIM 视觉对比，采用**视觉回环**语义——对视觉保真型输入（PDF / PNG），把**输入页**与**输出页**各自栅格化为像素，做结构相似度（SSIM）对比，写入 `qualityReport.ssim`，衡量「这次转换是否保住了视觉外观」。

落地后：

- `convertContentAsync({ from: "pdf", to: "pdf" })` / `convertContentAsync({ from: "png", to: "pdf" })` 在 image source 可用时，`result.quality.qualityReport.ssim = { score, threshold, passed, width, height, pageIndex, sourceFormat, outputFormat }`。
- 非视觉保真路径（`md → pdf` 无源图、`pdf → md` 输出不可栅格化）记 `qualityReport.ssim = null` + `verification.skipped` 带 reason，不阻塞。
- SSIM 算法**自实现、零新依赖**：纯函数 `computeSSIM` 操作灰度像素缓冲，Node 完全可测。
- 渲染本轮 **stub-only**：Node 无 canvas/pdfjs runtime，`defaultPageImageSource` 默认抛 `VERIFICATION_IMAGE_SOURCE_UNAVAILABLE`；浏览器/Tauri 自动 dynamic import canvas 实现；测试用注入 stub image source + 合成像素覆盖代码路径，真实 PDF 渲染 fixture 留给后续。

## 为什么是异步层

栅格化（dynamic import vendor pdfjs + canvas.render + Image 解码）本质异步，而同步 `convert()` 被大量同步调用方依赖（`convertContent` sync）。因此：

- 同步 `runVerificationStage`（P9-C.1）保持不变，只跑 rule-diff 层，供 sync `convert()` 用。
- 新增异步 `runVerificationStageAsync`：先调同步 `runVerificationStage` 拿 rule-diff 基底 envelope，再跑 SSIM 层，合并 layers / skipped / warnings / runtimeMs + `ssim` 字段。供 `convertAsync()` 用。
- `format-registry.js` 抽出 `_assembleQuality({ cycle, verification, ... })` 共享组装；`convert()` 走同步 verification，`convertAsync()` 走异步 verification。
- envelope 字段 `qualityReport.ssim` 在同步路径恒为 `null`（同步不跑 SSIM），异步路径在 eligible 时填充。

## 数据流

```
convertContentAsync({ from, to })
  → prepareConversionModel + (OCR stage 若适用) + write
  → _wrapWithRepairCycleAsync
      ├ defaultRepairEngine.runCycle (S2)
      ├ verification = await runVerificationStageAsync({ model, output, ctx })
      │   ├ base = runVerificationStage(...)            // rule-diff（同步）
      │   └ ssim = await runSsimLayer({ ctx, output })  // 视觉回环（异步）
      │       ├ gate: ctx.from ∈ {pdf,png} && ctx.to ∈ {pdf,png}
      │       ├ srcImage = getPageImage({ format: ctx.from, content: ctx.content })
      │       ├ outImage = getPageImage({ format: ctx.to,   content: output.data })
      │       ├ compareImages(srcImage, outImage) → score
      │       └ passed = score >= threshold; warning SSIM_VISUAL_DRIFT if !passed
      └ _assembleQuality → quality.qualityReport.{ ruleDiff, ssim } + verification envelope
```

## 新增 / 改造模块

| 文件 | 职责 |
| --- | --- |
| `public/core/verification/ssim.js` | 纯 SSIM 核心：`rgbaToGrayscale` / `resampleGrayscale`（box 重采样到公共网格）/ `computeSSIM(grayA, grayB, w, h, opts)`（非重叠窗口均值 SSIM，C1/C2 标准常量）/ `compareImages(imgA, imgB, opts)`（两图归一到公共网格后算分）。常量 `SSIM_C1` / `SSIM_C2` / `DEFAULT_WINDOW_SIZE` / `DEFAULT_TARGET_WIDTH` 暴露。 |
| `public/core/verification/page-image-source.js` | 像素源抽象：`defaultPageImageSource`（Node 抛 `VERIFICATION_IMAGE_SOURCE_UNAVAILABLE`；浏览器首次调用 dynamic import browser 实现）+ `setPageImageSource(impl)` / `resetPageImageSource()`。契约 `getPageImage({ format, content, pageIndex, dpi })` → `{ pixels: RGBA, width, height }`。错误码 `VERIFICATION_IMAGE_SOURCE_UNAVAILABLE` / `VERIFICATION_IMAGE_SOURCE_FAILED`。 |
| `public/core/verification/page-image-source-browser.js` | 浏览器实现：PDF → `createBrowserPdfPageRasterizer` 得 dataUrl → `Image` → canvas → `getImageData` 取像素；PNG → dataUrl/bytes → `Image` → canvas → `getImageData`。STRICT local-only。 |
| `public/core/verification/verification-stage.js` | 增 `runVerificationStageAsync` + `runSsimLayer` + warning 常量 `SSIM_VISUAL_DRIFT` / `SSIM_SOURCE_UNAVAILABLE`。同步 `runVerificationStage` 不变。 |
| `public/core/format-registry.js` | 抽 `_assembleQuality`；`_wrapWithRepairCycle`（sync）+ 新 `_wrapWithRepairCycleAsync`；`convertAsync` 改用 async wrap。 |
| `public/browser-transformer.js` | 顶层 export `computeSSIM` / `compareImages` / `rgbaToGrayscale` / `resampleGrayscale` / `runVerificationStageAsync` / `defaultPageImageSource` / `setPageImageSource` / `resetPageImageSource` / `SSIM_VISUAL_DRIFT` / `VERIFICATION_IMAGE_SOURCE_UNAVAILABLE` 等。 |
| `scripts/ssim-verification-test.js` | 断言：SSIM core（相同图=1、全黑全白≈0、加噪声单调下降、resample 尺寸）+ compareImages 不同尺寸归一 + runSsimLayer 注入 stub image source 端到端 + 非视觉路径 eligible:false + defaultPageImageSource Node 抛错 + runVerificationStageAsync 合并 rule-diff + ssim 双层。 |
| `package.json` | test 链插入 `ssim-verification-test.js`（在 `rule-diff-test.js` 之后）。 |
| `scripts/local-security-test.js` | 四个新模块加 ALLOWED + STRICT。 |
| `scripts/local-model-direction-test.js` | 守门关键词加 `computeSSIM` / `runVerificationStageAsync` / `SSIM_VISUAL_DRIFT`。 |
| `docs/MULTI_MODEL_ARCHITECTURE.md` / `DEVELOPMENT_TASKS.md` | 同步章节、状态行、验收条目；脚本计数 21 → 22。 |

## SSIM 算法

- 输入：两张 `{ pixels: Uint8ClampedArray (RGBA), width, height }`。
- `rgbaToGrayscale`：`0.299R + 0.587G + 0.114B`，输出 `Uint8ClampedArray` 长度 w*h。
- `resampleGrayscale`：box 平均重采样到目标网格（默认 `DEFAULT_TARGET_WIDTH = 256`，高度按 imgA 宽高比推导），两图强制到同一网格；尺寸/宽高比不匹配自然拉低分值。
- `computeSSIM`：非重叠 `windowSize=8` 窗口，逐窗算 `(2μxμy+C1)(2σxy+C2)/((μx²+μy²+C1)(σx²+σy²+C2))`，取所有窗口均值。`C1=(0.01·255)²=6.5025`，`C2=(0.03·255)²=58.5225`。
- 不重叠窗口 + 固定网格保证确定性，跨平台稳定，零依赖。

## 资格与阈值

- SSIM 层 eligible 条件：`ctx.from ∈ {pdf, png}` 且 `ctx.to ∈ {pdf, png}`（即有源图、输出可栅格化）。
- 当前产品矩阵实际命中：`pdf → pdf`、`png → pdf`。`ofd` 源图本轮不支持（无 OFD 渲染）→ 记 reason `format-not-rasterizable`。
- 默认阈值 `0.85`（可经 `options.verification.ssimThreshold` 调）。注意：Trans2Former 的 `pdf → pdf` 走「reader 抽文本 → writer 重排版」，视觉本就不保真，SSIM 偏低是**诚实信号**，故默认仅发 info 级 `SSIM_VISUAL_DRIFT`，不判失败、不阻塞。
- image source 不可用（Node 默认 / 浏览器 vendor 缺失）→ `eligible: false, reason: "image-source-unavailable"`，不抛、不阻塞转换。

## 验收门槛

1. `npm test` 全 22 个脚本通过；P9-C.1 `rule-diff-test` 与 `repair-engine-test` 不漂移。
2. SSIM core 纯函数在 Node 完整覆盖（相同图=1、退化、resample）。
3. `runSsimLayer` 注入 stub image source 端到端跑通，写出 `qualityReport.ssim`。
4. `convertContent`（sync）行为不变：`qualityReport.ssim === null`，rule-diff 字段不动。
5. 守门关键词 + 白名单覆盖四个新模块；docs 同步。
6. `git diff --check` / `npm run release:prepare` 通过。

## 本轮不做

- **不做** OCR 回读（P9-C.3）。
- **不入库** 真实 PDF/PNG 渲染 baseline（stub-only，真实 fixture + 浏览器端 canvas 像素 wiring 的端到端验证留给后续/手动）。
- **不引入** 新 npm 依赖（不加 canvas / sharp / ssim.js / pixelmatch）。
- **不支持** OFD 源图渲染；不做多页（仅第 1 页）；不做跨平台像素级 baseline 承诺。
- **不改** 同步 `convert()` 语义 / `options.repair === false` 短路。
- **不改** UI（验证卡片渲染留给三层齐备后统一做）。
