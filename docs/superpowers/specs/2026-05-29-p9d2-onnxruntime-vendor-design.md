# P9-D.2 PP-OCRv5 onnxruntime-web vendor + 运行时加载骨架

状态：生效
日期：2026-05-29
前置基础：[2026-05-29-p9d1-paddle-ocr-skeleton-design.md](2026-05-29-p9d1-paddle-ocr-skeleton-design.md) / P9-A.2 tesseract vendor 骨架（同节奏）
后续阶段：P9-D.2.b 真实 det/cls/rec 推理管线 + CTC 解码 / P9-D.3 模型按需下载 + UI / P9-D.4 接入转换链

## 目标

按「vendor + 运行时骨架」节奏（同 P9-A.2 tesseract）接入 PP-OCRv5 的 ONNX Runtime（onnxruntime-web）：optionalDependency + vendor 同步脚本 + 运行时加载器 + 执行后端（WebGPU/WASM）选择。**本轮不实现 det/cls/rec 推理管线与 CTC 解码**（留 P9-D.2.b，需真实模型 + 字典）。

落地后：
- `onnxruntime-web` 作为 optionalDependency 声明；缺失不阻塞（vendor 脚本 exit 0）。
- `paddle-ocr-runtime.js` 提供 `loadOnnxRuntime`（dynamic import 同源 vendor ORT，Node 抛 `OCR_VENDOR_LOAD_FAILED`）、`pickExecutionProviders`（`navigator.gpu` → `["webgpu","wasm"]`，否则 `["wasm"]`）、`createOcrSession` / `disposeSession` 骨架、`PADDLE_VENDOR_PATHS`。
- `paddleOcrEngine.recognize` 第三阶段改为真实尝试 `loadOnnxRuntime()`：浏览器装好 vendor + 模型则加载 ORT，再以 `pipeline-not-wired` 拒绝（P9-D.2.b 接管线）；Node 在 model-missing 阶段已先行拒绝。

## CSP 现状（无需改动）

Tauri CSP 已是 `script-src 'self' 'wasm-unsafe-eval'` + `worker-src 'self' blob:` + `connect-src 'self'`，足够 onnxruntime-web 同源加载 wasm/worker 与实例化；WebGPU 无需额外 CSP。本轮不动 CSP。

## 新增 / 改造模块

| 文件 | 职责 |
| --- | --- |
| `scripts/sync-onnxruntime-vendor.js` | 模仿 sync-tesseract-vendor：从 `node_modules/onnxruntime-web/dist/` 同步 `ort*.mjs` + `*.wasm` 到 `public/vendor/onnxruntime/`；缺包 exit 0 不阻塞。 |
| `public/core/ocr/paddle-ocr-runtime.js` | `loadOnnxRuntime(vendorUrl)`（dynamic import，Node 抛 `OCR_VENDOR_LOAD_FAILED`，设 `ort.env.wasm.wasmPaths`）+ `pickExecutionProviders()` + `createOcrSession({ ort, modelBuffer, providers })` + `disposeSession` + `PADDLE_VENDOR_PATHS`。 |
| `public/core/ocr/paddle-ocr-engine.js` | recognize 第三阶段经 `loadOnnxRuntime()` → 暂以 `pipeline-not-wired`（`OCR_ENGINE_FAILED`）拒绝。 |
| `package.json` | `onnxruntime-web` 加 optionalDependencies；`vendor:onnx` script；`release:prepare` 加入 onnx vendor sync。 |
| `public/browser-transformer.js` | export `loadOnnxRuntime` / `pickExecutionProviders` / `createOcrSession` / `disposeOcrSession` / `PADDLE_VENDOR_PATHS`。 |
| `scripts/local-security-test.js` | `isLocalVendorAsset` 识别 `public/vendor/onnxruntime/`；`paddle-ocr-runtime.js` 加 ALLOWED + STRICT。 |
| `scripts/local-model-direction-test.js` | multiModel 守门加 `onnxruntime-web`。 |
| `scripts/ocr-baseline-test.js` | `pickExecutionProviders()` Node 返回 `["wasm"]`；`loadOnnxRuntime()` Node 抛 `OCR_VENDOR_LOAD_FAILED`。 |
| docs / DEVELOPMENT_TASKS | P9-D.2 条目与状态行。 |

## 验收

1. `npm test` 全 24 个脚本通过；paddle 骨架（P9-D.1）断言不破坏。
2. `pickExecutionProviders` Node 返回 `["wasm"]`；`loadOnnxRuntime` Node 抛 `OCR_VENDOR_LOAD_FAILED`。
3. `npm run release:prepare` 包含 onnx vendor sync（缺包 exit 0）。
4. 守门白名单/关键词覆盖；`git diff --check` 通过；onnxruntime-web 仅 optionalDependency，缺失不阻塞。

## 本轮不做

- 不实现 det/cls/rec 推理管线 / DB 后处理 / CTC 解码（P9-D.2.b，需真实模型 + 字典）。
- 不做模型按需下载 / 安全中心 UI（P9-D.3）。
- 不接转换链 / 不改 pickForTask 偏好（P9-D.4）。
- 不强制安装 onnxruntime-web（仅声明 optionalDependency，npm test 在 Node 用拒绝路径覆盖）。
