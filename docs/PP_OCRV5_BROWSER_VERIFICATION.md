# PP-OCRv5 高级 OCR 浏览器端到端验证清单

适用：P9-D 全链路（.1 契约 / .2 onnxruntime-web 运行时 / .3 模型导入 / .2.b 推理管线 / .4 路由偏好）已在 Node 侧以 mock + 纯函数全覆盖。**真实模型推理只能在浏览器/Tauri（WebGPU/WASM）跑**，本清单给出手动验证步骤。

## 前置：准备 vendor 与模型

1. 安装可选依赖并同步 vendor（一次性）：
   ```
   npm install onnxruntime-web
   npm run vendor:onnx        # 同步 ort*.mjs + *.wasm 到 public/vendor/onnxruntime/
   ```
   （`npm install tesseract.js && npm run vendor:tesseract` 同理，可选，用于对比轻量 OCR。）

2. 准备 PP-OCRv5 ONNX 模型与字典：
   ```
   npm run vendor:paddle   # 从钉定来源下载 det/rec + 字典，SHA-256 校验后写入 public/vendor/paddleocr/
   ```
   - `det.onnx`（DB 文本检测）—— **必选**，随包同步
   - `rec.onnx`（CTC 文本识别）—— **必选**，随包同步
   - `dict.txt`（PP-OCRv5 keys）—— **必选**，随包同步（默认字典已随包，无需手动导入）
   - `cls.onnx`（方向分类，180°）—— **可选**，不随包；管线缺它也能跑（跳过方向校正）。如需启用，在安全中心导入键名 `paddleocr/v5/cls.onnx`

   说明：`vendor:paddle` 来源与校验和钉死在 [scripts/paddleocr-models.manifest.json](../scripts/paddleocr-models.manifest.json)（`ppu-paddle-ocr-models`，Apache-2.0，onnx 源自 paddleocr.ai）。模型文件被 `.gitignore` 忽略、不入库，随 `release:prepare` 从磁盘打进发布包。下载仅发生在构建期；转换/识别阶段零联网、零上传。

## 步骤：浏览器/Tauri 内验证

1. 启动：`npm start`（浏览器）或 `npm run desktop:dev`（Tauri）。
2. 打开**安全中心** → 「模型缓存」card，找到 **PP-OCRv5 高级 OCR (ONNX/WebGPU)** 行：
   - 若已跑过 `npm run vendor:paddle`，det/rec/dict 随包，启动即自动载入、状态直接 **可用**，无需手动导入。
   - 手动覆盖/替换：点「导入 det.onnx / rec.onnx」选择对应文件；**必选 det+rec 齐全**后状态即变 **可用**（SHA-256 校验通过）。cls.onnx 为可选导入（方向校正）。
   - （字典：默认 `dict.txt` 已随包，无需手动导入。自定义字典暂无专用按钮——可临时在 console 调 `defaultOCRStorage.put("paddleocr/v5/dict.txt", buf, {sha256})`；专用按钮列为已知后续。）
3. 验证**引擎优先级**：在 console 执行
   ```js
   const m = await import("/browser-transformer.js");
   m.defaultOCRRegistry.pickForTask("ocr-text").id;   // 期望 "paddleocr-v5"（paddle 可用时优先于 tesseract）
   ```
4. 验证**真实识别**：上传一张含文字的 PNG，转换到 `txt` / `md`：
   - 期望输出包含识别出的文字。
   - 期望「转换检验报告」面板出现，`ocrReadback` 行显示 f1/recall（若 OCR 引擎可用）。
5. 验证**扫描 PDF**：上传扫描型 PDF（无文本层），转换：
   - 期望经 `isScannedPdf` 检测 → rasterize → PP-OCRv5 识别 → 文本输出 + FixedLayoutModel。
6. 验证**禁联网**：打开 DevTools Network 面板，整个导入 + 识别过程**不应有任何远程请求**（仅同源 vendor / blob / dataURL）。安全中心「对外部请求监控」应为空。

## 通过标准

- 必选 det+rec（+随包 dict）就位后 PP-OCRv5 行为「可用」，`pickForTask` 选中 `paddleocr-v5`；cls 为可选（仅影响 180° 方向校正）。
- 含文字 PNG / 扫描 PDF 经高级 OCR 得到合理识别文本（精度取决于所用模型）。
- 三层检验报告出现，rule-diff 恒在文本路径触发，ocrReadback 在 OCR 可用时触发。
- 全程无远程网络请求。

## 已知后续（不阻塞本验证）

- 字典导入专用按钮（当前可用 console 兜底）。
- cls 角度旋转校正、minAreaRect+unclip 高精度框、多栏阅读顺序（精度增强）。
- 真实 PDF/PNG 渲染 baseline 与 SSIM/OCR 回读 fixture 入库。
