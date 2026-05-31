# P9-D.4 高级 OCR 接入转换链（路由偏好）

状态：生效
日期：2026-05-29
前置基础：P9-D.1 引擎契约 / P9-D.2 ORT 运行时 / P9-D.3 模型导入 / P9-D.2.b 推理管线
后续阶段：真实模型 + 字典导入后的浏览器端端到端验证（手动）

## 目标

P9-D 收口：让 `paddleOcrEngine`（PP-OCRv5）在**可用时优先于** tesseract 被选用，且 PNG / 扫描 PDF 的 OCR stage 自动受益（它们经 `pickForTask("ocr-text")` 选引擎）。当前 `pickForTask` 返回注册顺序中第一个 available；paddle 注册在 tesseract 之后，两者都可用时会错选 tesseract。引入**优先级感知**选择修正。

## 设计

`OCREngineRegistry.pickForTask(task)`：
- 候选 = 注册引擎中 `taskCapabilities.includes(task)` 的。
- 在候选中**按 `priority`（降序）挑第一个 available**（`priority` 缺省 0）；都不可用时回退到最后注册的候选（行为不变）。
- 引擎 `priority`：`placeholderOCREngine` = 0（缺省）、`tesseractOCREngine` = 10、`paddleOcrEngine` = 20（最高，优先）。

PNG / 扫描 PDF stage 无需改动：`enhanceWithOCR` / `runScannedPdfOCRStage` 经 `defaultOCRRegistry.pickForTask("ocr-text")` 取引擎，自动选到可用的最高优先级引擎（有 paddle 用 paddle，否则 tesseract，否则 placeholder/降级 warning）。

## 新增 / 改造

| 文件 | 改动 |
| --- | --- |
| `public/core/ocr/ocr-engine.js` | `pickForTask` 改为优先级感知：候选按 `priority` 降序挑首个 available；无可用回退末位。 |
| `public/core/ocr/paddle-ocr-engine.js` | engine 加 `priority: 20`。 |
| `public/core/ocr/tesseract-engine.js` | engine 加 `priority: 10`。 |
| `scripts/ocr-baseline-test.js` | 第 38 组：自建 registry 两 available stub（priority 高/低）→ pickForTask 返回高优先级；默认 registry 同时让 paddle + tesseract available → pickForTask("ocr-text") 返回 `paddleocr-v5`，清理后回到 false。 |
| docs / DEVELOPMENT_TASKS | P9-D.4 章节与状态行。 |

## 验收

1. `npm test` 全 25 个脚本通过；既有 pickForTask 回退断言（无可用时）不破坏。
2. 两引擎都可用时 `pickForTask("ocr-text")` 选 `paddleocr-v5`；仅 tesseract 可用时选 tesseract。
3. `git diff --check` / `npm run release:prepare` 通过。

## 本轮不做

- 不改 PNG / 扫描 PDF stage 代码（经 pickForTask 自动受益）。
- 不在 Node 跑真实 ONNX；真实模型端到端为浏览器手动验证。
- 不做 cls 旋转校正 / 高精度框（精度提升属后续）。
