# P9-A.2 Tesseract Runtime Design (vendor + 骨架 + CSP)

状态：生效
日期：2026-05-28
前置基础：P9-A.1 OCR 契约与占位 / S3 Model Cache / UI-A 三视图重构 / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-A.2.b tessdata IDB + UI 启用 + 真实 OCR / P9-A.3 端到端 PNG + 扫描 PDF

## 目标

为 OCR 链路接入第一条真实 runtime 候选——`tesseract.js`，但本轮**只完成 vendor 同步 + Engine 骨架 + CSP 调整**，不实现 tessdata 持久化、UI 启用流程或真实推理。落地后：

- 在 `public/vendor/tesseract/` 中静态存放 `tesseract.js` core / wasm / worker 文件（约 4–6 MB），与 `pdfjs-dist` 同样的 vendor 模式。
- `defaultOCRRegistry` 中除了 placeholder，还多了一条 `tesseractOCREngine`；后者 `isAvailable()` 依据 vendor 资源 + storage 中是否存在 tessdata 共同决定，A.2 阶段始终为 false。
- `defaultModelCache` 多注册一条 `ocr-text.tesseract.5.0.0` manifest，status 为 `not-downloaded`；安全中心立刻显示「Tesseract.js OCR」条目并提示导入 tessdata。
- Tauri CSP 加 `'wasm-unsafe-eval'` 让 wasm 在 WebView 中可实例化；其他指令保持不变。
- `OCRStorage` 接口抽象 + `InMemoryStorage` 实现 + `createIndexedDBStorage(dbName)` 工厂占位（A.2 阶段仍回退到 InMemoryStorage）；P9-A.2.b 替换工厂内部即可接入真实 IndexedDB。

## 新增模块

| 文件 | 职责 |
| --- | --- |
| [`scripts/sync-tesseract-vendor.js`](../../../scripts/sync-tesseract-vendor.js) | 从 `node_modules/tesseract.js/dist/` + `node_modules/tesseract.js-core/` 同步资源到 `public/vendor/tesseract/{core,worker}/`；缺包时打印警告并 exit 0，不阻塞 CI / release:prepare |
| [`public/core/ocr/ocr-storage.js`](../../../public/core/ocr/ocr-storage.js) | `OCRStorage` 接口 + `InMemoryStorage` + `createIndexedDBStorage(dbName)` 工厂 + `defaultOCRStorage` 单例 |
| [`public/core/ocr/tesseract-engine.js`](../../../public/core/ocr/tesseract-engine.js) | `tesseractOCREngine` 实现 OCREngine 接口；`isAvailable` 检查 vendor 标志 `globalThis.__t2fTesseractVendorReady` + storage 中是否有 tessdata；`recognize` 当前仅完成拒绝路径（vendor-not-ready / tessdata-missing / runtime-not-wired），P9-A.2.b 接入真实推理 |
| [`public/core/ocr/tesseract-bootstrap.js`](../../../public/core/ocr/tesseract-bootstrap.js) | 副作用 import：注册 manifest 到 `defaultModelCache`（status: not-downloaded）+ 注册 engine 到 `defaultOCRRegistry`；必须在 `ocr-bootstrap.js`（placeholder）之后 import |

`browser-transformer.js` 顶层 `import "./core/ocr/tesseract-bootstrap.js"` 触发副作用并导出全部 API。

## OCRStorage 抽象

```js
{
  has(key): Promise<boolean>,
  get(key): Promise<ArrayBuffer | null>,
  put(key, value, meta = { sha256 }): Promise<void>,
  delete(key): Promise<boolean>,
  list(): Promise<{ key, size, sha256, updatedAt }[]>,
  clear(): Promise<void>,
}
```

- `InMemoryStorage` —— 基于 Map，供 Node 测试与浏览器降级。
- `createIndexedDBStorage(dbName)` —— A.2 阶段仍回退 `InMemoryStorage`，A.2.b 在工厂内部接入真实 IDB（不改外部签名）。
- `defaultOCRStorage` —— 浏览器/Tauri 环境检测到 `globalThis.indexedDB` 时返回 `createIndexedDBStorage()`，否则 `InMemoryStorage`。

错误编号：`OCR_STORAGE_INVALID_KEY` / `OCR_STORAGE_INVALID_VALUE`。

## TesseractEngine 状态机

```
vendorReady? = globalThis.__t2fTesseractVendorReady
tessdataReady? = await defaultOCRStorage.has("tesseract/chi_sim.traineddata"
                                            || "tesseract/eng.traineddata")

isAvailable() === vendorReady && _tessdataReady
                            │
                            └── _tessdataReady 由 ensureProbe() 异步刷新
```

recognize 拒绝路径（A.2 阶段）：
- `!vendorReady` → `OCR_UNAVAILABLE` (reason: `vendor-not-ready`)
- `!language found in storage` → `OCR_UNAVAILABLE` (reason: `tessdata-missing`)
- `!image` → `OCR_ENGINE_FAILED` (reason: `missing-image`)
- 通过以上检查 → `OCR_ENGINE_FAILED` (reason: `runtime-not-wired`)，提示 P9-A.2.b 接入。

A.2.b 接入路径：替换 `runtime-not-wired` 分支为：动态 import `/vendor/tesseract/...` → 初始化 worker → 读 tessdata blob → recognize → 包装为 OCRResult。

## Tauri CSP

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';   ← P9-A.2 新增 wasm-unsafe-eval
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
frame-src 'self' blob:;
worker-src 'self' blob:;                ← P9-A.1 已存在
connect-src 'self';                     ← 不加 wasm 远程；wasm 仅同源加载
object-src 'none';
base-uri 'self'
```

`'wasm-unsafe-eval'` 是允许 `WebAssembly.instantiate`/`WebAssembly.compile` 的 CSP 关键字，对应 tesseract.js wasm 初始化路径。`connect-src 'self'` 保留 —— vendor 资源同源、tessdata 由用户本地选择文件 / IDB 读取，不联网。

## Vendor 同步

`sync-tesseract-vendor.js` 流程：
1. 检测 `node_modules/tesseract.js` 是否存在。缺失 → 打印警告并 exit 0（与 `optionalDependencies` 兼容；CI 环境不安装 OCR 时不阻塞）。
2. 创建 `public/vendor/tesseract/{core,worker}/`。
3. 从 `node_modules/tesseract.js/dist/` 拷贝 `.js`/`.mjs`/`.map`：以 `worker` 开头的进 `worker/`，其余进 `core/`。
4. 从 `node_modules/tesseract.js-core/`（含 `dist/` 子目录的情况兼容）拷贝 `.js`/`.wasm`/`.map` 到 `core/`。
5. 打印同步结果摘要（`worker=true|false, core=true|false`）。

`release:prepare` 现在顺序执行 `sync-pdfjs-vendor.js` → `sync-tesseract-vendor.js` → `prepare-release.js`。

## 守门

`scripts/ocr-baseline-test.js` 扩展为 15 组断言（在原 10 组基础上 +5）：
- TesseractEngine 注册到 registry + ID/taskCapabilities/manifestId 正确 + `isAvailable() === false`。
- Manifest 在 `defaultModelCache` 中 status 为 `not-downloaded`。
- `recognize` 在三个阶段（vendor-not-ready / tessdata-missing / runtime-not-wired）抛对应 code 与 reason；用 `markTesseractVendorReady` + `_storage.put` 模拟状态切换。
- `InMemoryStorage` 完整 CRUD + 错误用例（空 key、非 buffer value）。
- `defaultOCRStorage` 在 Node 环境是 InMemoryStorage 实例。

`scripts/local-security-test.js` 把 `public/core/ocr/{ocr-storage,tesseract-engine,tesseract-bootstrap}.js` 加入 `ALLOWED_PUBLIC_FILES`（IDB / 同源 vendor fetch 合规使用）+ `STRICT_LOCAL_ONLY_FILES`（守门：不得出现远程协议字符串）。`public/vendor/tesseract/**` 通过扩展的 `isLocalVendorAsset` 例外处理。

`scripts/local-model-direction-test.js` multiModel 关键词扩展：`TesseractEngine` / `defaultOCRStorage` / `tesseract.js`。

## 不引入

- 不实际跑 OCR 推理。
- 不实现 tessdata IndexedDB 真实 I/O（A.2.b）。
- 不增加「导入 tessdata」UI 按钮（A.2.b）。
- 不修改 fixed-layout 或扫描 PDF 路径（P9-B）。
- 不引入 npm 依赖以外的运行时 package；仅 optionalDependencies 加 `tesseract.js@^5.1.1`，缺包时 vendor 与 npm install 都不阻塞。

## 未来扩展（A.2.b / A.3）

- `createIndexedDBStorage` 工厂内部接入真实 IDB（用 native API，避免引入 `idb` / `dexie` 等额外依赖）。
- 安全中心「模型缓存」card 加「导入 tessdata」按钮：`<input type="file" accept=".traineddata">` → `sha256Hex(buffer)` → `defaultOCRStorage.put("tesseract/{lang}.traineddata", buffer, { sha256 })` → `setStatus(STATUS_AVAILABLE)`。
- `TesseractEngine.recognize` 接入真实推理：动态 import `/vendor/tesseract/core/tesseract.min.js` → 初始化 worker（worker.min.js）→ 加载 wasm + tessdata → recognize → 包装为 OCRResult。
- 真实 PNG fixture（10–20 KB 含中英文）驱动端到端测试。
- 扫描 PDF 渲染（pdfjs canvas → toBlob → recognize）。
- `summarizeOCRResult` 回填 Repair Engine 的 `modelReview`，让 QualityReport 携带 OCR 证据。
