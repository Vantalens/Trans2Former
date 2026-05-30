# PP-OCRv5 高级 OCR 浏览器端到端验证清单

适用：P9-D 全链路（.1 契约 / .2 onnxruntime-web 运行时 / .3 模型导入 / .2.b 推理管线 / .4 路由偏好）已在 Node 侧以 mock + 纯函数全覆盖。**真实模型推理只能在浏览器/Tauri（WebGPU/WASM）跑**，本清单给出手动验证步骤。

## 前置：准备 vendor 与模型

1. 安装可选依赖并同步 vendor（一次性）：
   ```
   npm install onnxruntime-web
   npm run vendor:onnx        # 同步 ort*.mjs + *.wasm 到 public/vendor/onnxruntime/
   ```
   （`npm install tesseract.js && npm run vendor:tesseract` 同理，可选，用于对比轻量 OCR。）

2. 准备 PP-OCRv5 ONNX 模型与字典（本地获取，**不入库**）：
   - `det.onnx`（DB 文本检测）
   - `cls.onnx`（方向分类，可选——管线缺它也能跑）
   - `rec.onnx`（CTC 文本识别）
   - 字典文件（PP-OCRv5 keys，每行一个字符），导入键名 `paddleocr/v5/dict.txt`

   说明：模型从 PaddleOCR 官方 ONNX 导出或社区 `ppu-paddle-ocr` 资源获取。文件留在本地，转换/识别阶段零联网、零上传。

## 步骤：浏览器/Tauri 内验证

1. 启动：`npm start`（浏览器）或 `npm run desktop:dev`（Tauri）。
2. 打开**安全中心** → 「模型缓存」card，找到 **PP-OCRv5 高级 OCR (ONNX/WebGPU)** 行：
   - 点「导入 det.onnx / cls.onnx / rec.onnx」分别选择对应文件；三件齐全后状态变 **可用**（SHA-256 校验通过）。
   - （字典：当前 UI 未单列字典导入按钮——可临时用 `det/cls/rec` 同入口或在 console 调 `defaultOCRStorage.put("paddleocr/v5/dict.txt", buf, {sha256})`；字典缺失时识别仍跑但输出为索引占位。dict 导入按钮可在后续小迭代补。）
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

- 三件模型导入后 PP-OCRv5 行为「可用」，`pickForTask` 选中 `paddleocr-v5`。
- 含文字 PNG / 扫描 PDF 经高级 OCR 得到合理识别文本（精度取决于所导入模型）。
- 三层检验报告出现，rule-diff 恒在文本路径触发，ocrReadback 在 OCR 可用时触发。
- 全程无远程网络请求。

## 已知后续（不阻塞本验证）

- 字典导入专用按钮（当前可用 console 兜底）。
- cls 角度旋转校正、minAreaRect+unclip 高精度框、多栏阅读顺序（精度增强）。
- 真实 PDF/PNG 渲染 baseline 与 SSIM/OCR 回读 fixture 入库。
