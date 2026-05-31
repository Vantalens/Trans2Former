# P9-D.2.b PP-OCRv5 推理管线（det + cls + rec + CTC）

状态：生效
日期：2026-05-29
前置基础：P9-D.2 onnxruntime-web 运行时骨架 / P9-D.3 模型导入 / P9-A.1 OCRResult 契约
后续阶段：P9-D.4 接入转换链并让 paddle 在可用时优先于 tesseract

## 目标

实现 PP-OCRv5 的真实推理管线，把检测/方向/识别三段 ONNX 前向 + 经典前后处理串成 `OCRResult`。**核心前后处理写成纯函数**（预处理、DB 检测后处理、CTC 贪心解码、字典解析、裁剪），在 Node 用合成张量完整单测；`runPaddlePipeline` 编排器接受**可注入的 session 对象**，因此可在 Node 用 mock session + mock ort 端到端测试，无需真实模型。

`paddleOcrEngine.recognize` 在浏览器把 `image` 解码为 RGBA → 从本地缓存加载 det/cls/rec 模型 + 字典 → 创建 session → 调 `runPaddlePipeline`。Node/未就位仍在 vendor-load / model-missing 前置拒绝。

## 新增 / 改造

| 文件 | 职责 |
| --- | --- |
| `public/core/ocr/paddle-ocr-pipeline.js` | 纯函数：`parseCharDictionary` / `preprocessForDetection` / `preprocessForRecognition` / `dbPostProcess` / `ctcGreedyDecode` / `cropImageData` / `resizeRgba`；编排器 `runPaddlePipeline({ ort, detSession, clsSession, recSession, imageData, dictionary, options })` → `OCRResult`。常量 `DET_LIMIT_SIDE_LEN`/`REC_IMAGE_HEIGHT`/`DET_MEAN`/`DET_STD`。 |
| `public/core/ocr/paddle-ocr-engine.js` | recognize 第三阶段：`loadOnnxRuntime` → `decodeImageToImageData(image)`（浏览器 canvas，Node 抛）→ 从 `_storage` 取 det/cls/rec 模型 buffer + 可选字典 `paddleocr/v5/dict.txt` → `createOcrSession` ×3 → `runPaddlePipeline`；任一步失败抛 `OCR_ENGINE_FAILED`。 |
| `public/browser-transformer.js` | export `runPaddlePipeline` / `parseCharDictionary` / `preprocessForDetection` / `preprocessForRecognition` / `dbPostProcess` / `ctcGreedyDecode` / `cropImageData`。 |
| `scripts/paddle-ocr-pipeline-test.js` | 纯函数单测（字典解析、det/rec 预处理形状与归一、DB 连通域出框、CTC 折叠去重去 blank）+ `runPaddlePipeline` 用 mock ort/session + 合成图端到端出 OCRResult。接入 `npm test`（第 25 个）。 |
| `scripts/local-security-test.js` | `paddle-ocr-pipeline.js` 加 ALLOWED + STRICT。 |
| `scripts/local-model-direction-test.js` | multiModel 守门加 `runPaddlePipeline` / `ctcGreedyDecode`。 |
| docs / DEVELOPMENT_TASKS | P9-D.2.b 章节与状态行；脚本计数 24 → 25。 |

## 管线与契约

```
runPaddlePipeline:
  imageData(RGBA) → preprocessForDetection → ort.Tensor → detSession.run
    → probMap(1,1,H,W) → dbPostProcess(thresh/boxThresh/minSize) → boxes[]
  for box in boxes:
    cropImageData → [clsSession.run（方向，本轮仅调用不旋转）]
    → preprocessForRecognition(H=48) → recSession.run → logits(1,T,C)
    → ctcGreedyDecode(dictionary) → { text, confidence }
  → createOCRResult(pages[0].lines = boxes×decode, fullText, averageConfidence)
```

- **DB 后处理**：阈值二值化 + 4-连通域 BFS + 轴对齐 bbox + box 平均概率打分 + 尺寸/分数过滤 + 按 det→原图比例缩放回坐标。本轮用轴对齐 bbox（非 minAreaRect+unclip），简化但正确，文档标注；多栏/旋转文本精度提升留后。
- **CTC 贪心解码**：逐时刻 argmax 取 idx+conf → 折叠连续重复 → 去 blank(0) → 映射字典 → text + 平均 conf。
- **预处理常量**：det `mean=[0.485,0.456,0.406]/std=[0.229,0.224,0.225]`、`limit_side_len=960`、尺寸取 32 的倍数；rec 高 48、`(x/255-0.5)/0.5`。真实模型精度的端到端校验为浏览器/手动（导入真实 PP-OCRv5 ONNX + 字典后）。

## 验收

1. `npm test` 全 25 个脚本通过；P9-D.1/D.2/D.3 断言不破坏。
2. 纯函数单测覆盖字典/预处理/DB 出框/CTC 折叠；`runPaddlePipeline` mock 端到端出含已知文本的 OCRResult。
3. `git diff --check` / `npm run release:prepare` 通过；无新增运行时依赖（onnxruntime-web 仍仅 optionalDependency）。

## 本轮不做

- 不做 cls 角度旋转校正（仅调用 clsSession 占位；旋转留后）、不做 minAreaRect+unclip 高精度框、不做多栏阅读顺序。
- 不在 Node 跑真实 ONNX（mock session 覆盖编排；真实模型端到端为浏览器手动）。
- 不接转换链 / 偏好排序（P9-D.4）。
