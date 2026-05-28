# PNG 样例

| 文件 | 说明 |
| --- | --- |
| `tiny-red.data-url.txt` / `tiny-green.data-url.txt` / `tiny-blue.data-url.txt` | 1×1 像素的纯色 PNG data URL，用于基础格式 reader 校验，不适用于 OCR。 |
| `t2f-sample.data-url.txt` | 80×24 黑底白字 "T2F" 字样的灰度 PNG data URL（实际像素：白底黑字），约 118 字节 base64 ≈ 182 字符；用于 OCR pipeline 端到端 stub 测试。 |

## 在浏览器手动验证 OCR 端到端

1. 安装 Tesseract.js：`npm install tesseract.js && npm run vendor:tesseract`。
2. 启动 `npm start`，在浏览器打开工作台。
3. 进入「安全中心 → 模型缓存 → Tesseract.js OCR」点击「导入 eng.traineddata」（从 [tessdata](https://github.com/tesseract-ocr/tessdata_best) 下载 `eng.traineddata`）。
4. SHA-256 校验通过后状态切到「已就绪」。
5. 回到工作台，把 `t2f-sample.data-url.txt` 中的 data URL 粘贴到上传区，输入格式选 PNG，输出格式选 Markdown。
6. 点击「转换」（PNG 路径自动走 `convertContentAsync`）。输出 Markdown 应该包含 OCR 识别出的「T2F」之类文本（精确程度取决于字体与 tessdata）。
7. 转换结果 `quality.modelReview.ocr` 字段会记录 `engine` / `lineCount` / `averageConfidence` 等真实证据。

## CI 测试策略

`scripts/ocr-baseline-test.js` 用 stub OCR engine 覆盖 `convertContentAsync` 端到端代码路径——不依赖真实 Tesseract.js 推理。真实 OCR 验证靠手动浏览器测试（步骤如上）。
