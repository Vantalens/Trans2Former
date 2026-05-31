# P9-D.1 PP-OCRv5 高级 OCR 引擎骨架

状态：生效
日期：2026-05-29
前置基础：[2026-05-29-p9d-advanced-ocr-research.md](2026-05-29-p9d-advanced-ocr-research.md)（方向已确认：高级 OCR = PP-OCRv5 ONNX/WebGPU）/ P9-A.1 OCR 契约 / P9-A.2 tesseract 骨架 / S3 model-cache
后续阶段：P9-D.2 ONNX runtime vendor + WebGPU / P9-D.3 模型按需下载 + UI / P9-D.4 接入转换链

## 目标

按「骨架先行」节奏（同 P9-A.2 tesseract）落地 PP-OCRv5 高级 OCR 的**引擎契约 + manifest 登记 + Node 不可用回退**，不引入运行时依赖、不实跑推理。同时把方向文档从「PaddleOCR-VL / MinerU 内置」修订为「PP-OCRv5 (ONNX/WebGPU) 内置；VLM 远期/外部」。

落地后：
- `paddleOcrEngine` 实现现有 `OCREngine` 接口，注册到 `defaultOCRRegistry`；Node/未就位时 `isAvailable()===false`，`recognize()` 三阶段拒绝（vendor-not-ready / model-missing / runtime-not-wired）。
- PP-OCRv5 ONNX 模型集（det+rec+cls）以 ModelManifest 登记到 `defaultModelCache`，状态 `not-downloaded`。
- 复用 P9-A 的 registry/manifest/Storage、P9-B 的 FixedLayoutModel、P9-C 的 OCR 回读检验（后续 P9-D.2+ 接真实推理后自然受益）。

## 新增 / 改造模块

| 文件 | 职责 |
| --- | --- |
| `public/core/ocr/paddle-ocr-engine.js` | `paddleOcrEngine`（id `paddleocr-v5`，taskCapabilities `["ocr-text","ocr-layout"]`，manifestId `ocr-text.paddleocr.v5`）：`isAvailable()` = vendorReady(`__t2fPaddleOcrVendorReady`) && modelReady；`recognize()` 三阶段拒绝（`OCR_UNAVAILABLE` / `OCR_ENGINE_FAILED`）；`markPaddleOcrVendorReady(ready)` + `ensureProbe()`。**不引入 onnxruntime，不实跑推理**。 |
| `public/core/ocr/paddle-ocr-bootstrap.js` | 副作用 import：注册 `paddleOcrEngine` 到 `defaultOCRRegistry`（在 tesseract 之后）+ 注册 PP-OCRv5 ModelManifest（`engine: "paddleocr"`，int8，det/rec/cls perFile 占位）到 `defaultModelCache`（`STATUS_NOT_DOWNLOADED`）。 |
| `public/browser-transformer.js` | 顶层 import `paddle-ocr-bootstrap`（tesseract-bootstrap 之后）+ export `paddleOcrEngine` / `PADDLE_OCR_MANIFEST_ID` / `markPaddleOcrVendorReady` / `ensurePaddleOcrBootstrap`。 |
| `scripts/ocr-baseline-test.js` | 更新两处 `pickForTask` 回退集合断言加入 `paddleocr-v5`；新增 paddle 骨架断言（注册 / isAvailable false / manifest 登记 / recognize 三阶段拒绝 / markPaddleOcrVendorReady）。 |
| `scripts/local-security-test.js` | 两个新模块加 ALLOWED + STRICT。 |
| `scripts/local-model-direction-test.js` | multiModel 守门加 `PP-OCRv5` / `ONNX` / `WebGPU` / `paddleOcrEngine`；保留既有「不默认内置 PaddleOCR-VL/MinerU」负断言。 |
| 方向文档（`DEVELOPMENT_TASKS` / `DESKTOP_APP_ARCHITECTURE` / `DESKTOP_RELEASE_PLAN` / `RESOURCE_BUDGET` / `PRODUCT_STRATEGY` / `MULTI_MODEL_ARCHITECTURE` / `CONVERSION_ROUTING`） | 把高级 OCR 内置目标改为 PP-OCRv5 (ONNX/WebGPU)，VLM(PaddleOCR-VL/MinerU) 标注为远期/外部资源（与研究 spec 一致）。 |

## pickForTask 优先级说明

`OCREngineRegistry.pickForTask` 返回注册顺序中第一个 available 的 engine；都不可用时返回最后一个候选。本轮 paddle 注册在 tesseract 之后 → 都不可用时回退候选变为 paddle（已更新测试断言）。

「paddle 可用时优先于 tesseract」的偏好排序留给 **P9-D.4**（届时通过 priority 字段或调整注册顺序实现）；P9-D.1 paddle 恒不可用，偏好排序不影响当前行为。

## 验收

1. `npm test` 全 24 个脚本通过；既有 placeholder/tesseract 断言不破坏（仅扩展回退集合）。
2. paddle 引擎注册、`isAvailable()===false`、manifest 登记、recognize 三阶段拒绝均被覆盖。
3. 方向文档与研究 spec 一致；`local-model-direction-test` 正负断言全过。
4. `git diff --check` / `npm run release:prepare` 通过；无新增运行时 npm 依赖。

## 本轮不做

- 不引入 onnxruntime-web / 不实跑 PP-OCRv5 推理（P9-D.2）。
- 不做模型按需下载 / 安全中心 UI（P9-D.3）。
- 不改 pickForTask 偏好排序 / 不接转换链（P9-D.4）。
- 不接 VLM 内嵌 / 不引入 Python sidecar。
