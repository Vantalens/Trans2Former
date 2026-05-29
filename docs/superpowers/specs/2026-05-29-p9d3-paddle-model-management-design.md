# P9-D.3 PP-OCRv5 模型导入与安全中心管理

状态：生效
日期：2026-05-29
前置基础：[2026-05-29-p9d2-onnxruntime-vendor-design.md](2026-05-29-p9d2-onnxruntime-vendor-design.md) / P9-A.2.b tesseract tessdata 导入流程（同模式）/ S3 model-cache
后续阶段：P9-D.2.b 真实 det/cls/rec 推理管线 + CTC 解码 / P9-D.4 接入转换链

## 目标

让用户能在安全中心把 PP-OCRv5 的 det/cls/rec ONNX 模型导入本地缓存，使 `paddleOcrEngine` 从「model-missing」走向就绪。**复用 tesseract tessdata 的本地导入（file picker + SHA-256 + IndexedDB）模式**——项目禁联网/STRICT 守门禁止任何远程 URL，所谓"按需下载"在本项目中即"用户本地导入模型文件"，不做自动远程 fetch。

落地后：
- 安全中心「模型缓存」card 对 `engine === "paddleocr"` 行渲染三个导入按钮（det/cls/rec onnx）+ 清除按钮。
- 导入：file picker → `arrayBuffer` → `sha256Hex` → `defaultOCRStorage.put("paddleocr/v5/<file>")` → `paddleOcrEngine.ensureProbe()`；三件齐全 → `markPaddleOcrVendorReady(true)` + 状态 `available`。
- 清除：删除三个键 + `ensureProbe` + 状态回 `not-downloaded`。

## 新增 / 改造

| 文件 | 改动 |
| --- | --- |
| `public/security-center.js` | import `paddleOcrEngine` / `markPaddleOcrVendorReady` / `PADDLE_OCR_MODEL_FILES`；`renderModelCache` 对 paddle 行调 `renderPaddleActions`；新增 `importPaddleModel(dialog, button)`（按 `data-file` 导入到 `paddleocr/v5/<file>`，全部就绪才 `markPaddleOcrVendorReady(true)` + `STATUS_AVAILABLE`，否则保持 `STATUS_VERIFYING`/部分提示）+ `clearPaddleModels`；click 委托加 `[data-import-paddle]` / `[data-clear-paddle]`。 |
| `public/browser-transformer.js` | 已 export 所需 API（P9-D.1/D.2），无需新增。 |
| `scripts/ocr-baseline-test.js` | 第 37 组：手动把三件模型 put 进 `paddleOcrEngine._storage` + `markPaddleOcrVendorReady(true)` + `ensureProbe()` → `isAvailable()===true`；删任一件 → `false`（验证就绪逻辑，不依赖 UI/ORT）。 |
| `scripts/browser-smoke-test.js` | 断言 index.html `#modelCacheFileInput` 存在（导入复用同一隐藏 file input，已存在）；无新 DOM 需要。 |
| `docs/MULTI_MODEL_ARCHITECTURE.md` / `DEVELOPMENT_TASKS.md` | P9-D.3 章节 + 状态行 + 验收条目。 |

## 关键点

- 存储键 `paddleocr/v5/det.onnx` / `cls.onnx` / `rec.onnx`，与 `paddle-ocr-engine.js` 的 `MODEL_KEY_PREFIX` + `PADDLE_OCR_MODEL_FILES` 对齐。
- 就绪判定：`paddleOcrEngine.ensureProbe()` 检查三件齐全；安全中心仅在三件齐全后置 `STATUS_AVAILABLE`，否则提示「还需导入 X」。
- `markPaddleOcrVendorReady(true)` 表示 ORT vendor 就位（浏览器已 `npm run vendor:onnx`）；与模型导入解耦，但导入流程在三件齐全时一并置位，保持与 tesseract 体验一致。
- 不触网：复用现有 `#modelCacheFileInput` 隐藏 file input；导入是本地文件，不发起任何请求。security-center.js 已在 ALLOWED 白名单。

## 验收

1. `npm test` 全 24 个脚本通过；paddle 就绪/清除逻辑被覆盖（不依赖 ORT/UI）。
2. `git diff --check` / `npm run release:prepare` 通过。
3. 浏览器手动：安全中心对 PP-OCRv5 行显示导入 det/cls/rec + 清除；导入三件后状态变「可用」。

## 本轮不做

- 不实现 det/cls/rec 推理 + CTC 解码（P9-D.2.b）。
- 不做自动远程下载（违反禁联网；坚持本地导入）。
- 不接转换链 / 偏好排序（P9-D.4）。
