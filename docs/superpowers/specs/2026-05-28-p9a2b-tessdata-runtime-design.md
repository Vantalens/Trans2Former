# P9-A.2.b tessdata IndexedDB + UI 启用 + 真实 OCR 接入

状态：生效
日期：2026-05-28
前置基础：P9-A.2 Tesseract Runtime Vendor + 骨架 / S3 Model Cache / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-A.3 端到端 PNG + 扫描 PDF / P9-B OCR→FixedLayoutModel

## 目标

把 P9-A.2 留在「骨架」状态的三块拼上：

1. **真实 IDB I/O** — `createIndexedDBStorage` 返回真正读写 `trans2former-ocr-cache` 数据库的 `IndexedDBStorage`；Node / 无 IDB 环境 fallback 到 `InMemoryStorage`。
2. **UI 启用流程** — 安全中心「模型缓存」card 的 Tesseract 行新增「导入 chi_sim.traineddata」「导入 eng.traineddata」「清除缓存」三个按钮；走 `<input type=file>` → ArrayBuffer → `sha256Hex` → `defaultOCRStorage.put` → `defaultModelCache.setStatus(STATUS_AVAILABLE)`。
3. **真实推理路径** — `TesseractEngine.recognize` 完整接入 `loadTesseractRuntime` + `createTesseractWorker` + `runRecognize`，把 tesseract.js 返回的结构映射成 `OCRResult`。

但本轮**仍不挂入 convert pipeline**——`enhanceWithOCR(model, { engine })` 作为独立函数提供，PNG reader 保持同步签名；A.3 接入 convert async stage 时再挂。

## 数据流

```
┌──────────────────────┐    ┌──────────────────────┐
│ 用户上传 PNG / 扫描 PDF │ →  │ formats/png.js reader │ → SemanticDoc (image asset)
└──────────────────────┘    └─────────┬─────────────┘
                                      │
                                      │ async enhanceWithOCR(model)
                                      ▼
        ┌───────────────────────────────────────────────────┐
        │ defaultOCRRegistry.pickForTask("ocr-text")          │
        │   → tesseractOCREngine.isAvailable()? if no:        │
        │     return model + OCR_UNAVAILABLE warning           │
        └───────────────────────────────────────────────────┘
                                      │ yes
                                      ▼
        ┌───────────────────────────────────────────────────┐
        │ loadTesseractRuntime() → import('/vendor/...')      │
        │ defaultOCRStorage.get("tesseract/chi_sim...")       │
        │ createTesseractWorker({ namespace, language, buf }) │
        │ runRecognize(worker, image)                         │
        │ mapTesseractResultToOCR(...) → OCRResult            │
        └─────────────────────────┬─────────────────────────┘
                                  │
                                  ▼
        ┌───────────────────────────────────────────────────┐
        │ model.blocks.push(paragraphs from OCR.fullText)     │
        │ model.metadata.modelReview = summarizeOCRResult(…) │
        │ warnings: low-confidence / engine-failed           │
        └───────────────────────────────────────────────────┘
```

## 新增 / 改造模块

| 文件 | 职责 |
| --- | --- |
| [`public/core/ocr/indexeddb-storage.js`](../../../public/core/ocr/indexeddb-storage.js) | `IndexedDBStorage` 类；单数据库 + 双 object store（`tessdata`, `metadata`）；put 用单事务原子写两个 store；错误统一抛 `OCR_STORAGE_IDB_ERROR` |
| [`public/core/ocr/ocr-storage.js`](../../../public/core/ocr/ocr-storage.js) | `createIndexedDBStorage` 改为返回 `LazyIndexedDBStorage`（dynamic import `indexeddb-storage.js`），无 `globalThis.indexedDB` 时 fallback 到 `InMemoryStorage` |
| [`public/core/ocr/tesseract-runtime.js`](../../../public/core/ocr/tesseract-runtime.js) | `loadTesseractRuntime` 动态 import `/vendor/tesseract/core/tesseract.min.js`，失败抛 `OCR_VENDOR_LOAD_FAILED`；`createTesseractWorker` 用 vendor 路径 + tessdata blob URL；`runRecognize` 把 tesseract data 映射成 `OCRResult` |
| [`public/core/ocr/tesseract-engine.js`](../../../public/core/ocr/tesseract-engine.js) | `recognize` 真实接入：vendor + storage 检查 → `createTesseractWorker` → `runRecognize` → `disposeWorker`；失败统一抛 `OCR_ENGINE_FAILED` |
| [`public/core/ocr/png-ocr.js`](../../../public/core/ocr/png-ocr.js) | `enhanceWithOCR(model, { engine })` 函数：解析第一个 image asset → 调用 engine.recognize → 追加 paragraph blocks + `metadata.modelReview`；engine 不可用时返回原 model + `OCR_UNAVAILABLE`；低置信度发 `OCR_LOW_CONFIDENCE` |

## UI 接入（安全中心）

[`public/security-center.js`](../../../public/security-center.js) `renderModelCache` 渲染每条 manifest 时，对 `task === "ocr-text" && engine === "tesseract"` 追加：
- 「导入 chi_sim.traineddata」按钮（`data-import-tessdata data-language="chi_sim"`）
- 「导入 eng.traineddata」按钮（`data-import-tessdata data-language="eng"`）
- 「清除缓存」按钮（`data-clear-tessdata`），仅当状态为 `available` 时启用

事件委托在 `init()` 的 `dialog.addEventListener("click")` 中：
- `[data-import-tessdata]` → `importTessdata(dialog, target)`：
  1. 把 `<input id="modelCacheFileInput" type="file" accept=".traineddata">` 显式 `.click()` 打开。
  2. 收到 `change` 事件 → `file.arrayBuffer()` → `sha256Hex(buffer)` → `defaultOCRStorage.put("tesseract/{lang}.traineddata", buffer, { sha256 })`。
  3. `tesseractOCREngine.ensureProbe()` 刷新 `_tessdataReady`；`markTesseractVendorReady(true)` 让 `isAvailable()` 在 vendor 已同步时返回 true。
  4. `defaultModelCache.setStatus(manifestId, STATUS_AVAILABLE, { language, sha256, size })`。
  5. 状态消息显示在 `[data-model-cache-status]` 区域，分 `info/success/error` 三个 level。
- `[data-clear-tessdata]` → `clearTessdata(dialog, target)`：循环 delete chi_sim/eng，刷新 probe，`setStatus(STATUS_NOT_DOWNLOADED)`。

UI 改动仅在安全中心，不动 workbench 或路由。

## 错误编号

新增：
- `OCR_VENDOR_LOAD_FAILED` —— tesseract.js vendor 资源加载失败（包含缺包、版本不兼容、缺 createWorker）。
- `OCR_STORAGE_IDB_ERROR` —— IndexedDB 操作失败。

复用：
- `OCR_UNAVAILABLE` (info) —— engine 未启用 / vendor 未就位 / tessdata 缺失。
- `OCR_ENGINE_FAILED` (lossy) —— worker 初始化失败 / recognize 抛错。
- `OCR_LOW_CONFIDENCE` (lossy) —— averageConfidence < 0.6 阈值。

## 测试覆盖

[`scripts/ocr-baseline-test.js`](../../../scripts/ocr-baseline-test.js) 扩展到 20 组断言（原 15 组 + 5 组新增）：
- `loadTesseractRuntime` 在 Node 环境抛 `OCR_VENDOR_LOAD_FAILED`（验证 dynamic import 失败路径）。
- `tesseractOCREngine.recognize` 在 tessdata 已 put 但 vendor 仍未就位时抛 `OCR_VENDOR_LOAD_FAILED`（验证真实链路第一步生效）。
- `enhanceWithOCR` 无可用 engine → 返回原 model + `OCR_UNAVAILABLE`。
- `enhanceWithOCR` 用 stub engine → 追加 paragraph + 写入 `metadata.modelReview.ocr`。
- `enhanceWithOCR` 低置信度 → 发 `OCR_LOW_CONFIDENCE`。
- `sha256Hex` + `InMemoryStorage.put/list` 元数据正确（验证 UI 导入流程使用的 SHA-256 计算）。

[`scripts/local-security-test.js`](../../../scripts/local-security-test.js) 把 `indexeddb-storage.js` / `tesseract-runtime.js` / `png-ocr.js` 加入 `ALLOWED_PUBLIC_FILES` + `STRICT_LOCAL_ONLY_FILES`。`public/vendor/tesseract/**` 已通过 P9-A.2 的 `isLocalVendorAsset` 例外处理。

## 不引入

- 不引入 npm 依赖（`idb` / `dexie` / `fake-indexeddb` 等都不引入）。
- 不挂 `enhanceWithOCR` 进 `format-registry.convert()`；A.3 接入 async pre-stage。
- 不修改扫描 PDF 路径（pdfjs canvas → toBlob → recognize 是 A.3 工作）。
- 不创建 PNG / tessdata fixture（npm test 用 stub engine 覆盖代码路径；真实 OCR 验证靠手动浏览器）。
- 不持久化 manifest 状态：刷新浏览器后通过 `tesseractOCREngine.ensureProbe()` 重新检查 IDB 中是否有 tessdata，自动恢复 status。

## 验证

- `node scripts/ocr-baseline-test.js` —— 20 组断言全通过。
- `npm test` —— 20 个原脚本（含扩展 ocr-baseline-test）全量通过。
- `npm install tesseract.js` + `npm run vendor:tesseract` + `npm start` 浏览器端：进入安全中心，「模型缓存」card 显示 Tesseract 条目并出现三个按钮；点击「导入 chi_sim.traineddata」→ file picker → 选择本地 `.traineddata` 文件 → 状态切到「已就绪」+ 状态消息显示 sha256 前缀；点击「清除缓存」→ 状态回到「未启用」。
- 浏览器控制台手动调用 `import("/browser-transformer.js").then(m => m.enhanceWithOCR(model, { engine }))` 可观察到 OCR enhance 真实跑通（前提：vendor + tessdata 都就位）。

## 未来扩展（A.3+）

- 把 `enhanceWithOCR` 挂进 `format-registry.convert()` 作为 PNG 输入路径的 async pre-stage（让 PNG → md/txt 等转换自动包含 OCR 文本）。
- 扫描 PDF：把 pdfjs 渲染到 canvas → `canvas.toBlob()` → 调用 `enhanceWithOCR` 多页合并。
- Repair Engine：把 `OCRResult` 中低置信度行（line.confidence < threshold）转成 `replaceTextRun` 候选 action，让用户/上层决定是否替换。
- 多语言：支持用户在 UI 中选择 chi_sim / chi_tra / eng / jpn 等多种语言，传给 `engine.recognize({ language })`。
- 高级 OCR：把 PaddleOCR-VL / MinerU 作为新 engine 注册到 `defaultOCRRegistry`，复用 manifest + Storage 抽象。
