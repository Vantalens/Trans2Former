# Trans2Former v2.3.0

本地优先的多格式文档转换器。本版把**本地 OCR**从骨架做到真机可用，新增 **LaTeX 数学渲染**与**转换后检验三层可视化**，全程零上传、零联网。

## 新增

### 本地 OCR（PP-OCRv5）
图片 / 扫描 PDF 经 **ONNX Runtime + WebGPU**（WASM 回退）在本机识别，应用内置一套 PP-OCRv5 mobile 模型，启动自动载入、开箱即用，可在安全中心导入/替换。完整管线：

- 图像预处理 + **DB 检测后处理（连通域 + unclip 外扩）** + **CTC 解码 + 字典对齐**
- **方向校正**（cls 180°）、**竖排/侧向 90° 试转**
- **任意角倾斜自动纠偏**（错切投影估角 → 旋正重检）
- **自适应去噪**（仅噪图去噪，干净图不受影响）
- **版面结构识别**（按字号/间距归并为标题 + 段落 + 阅读顺序）
- **识别质量评分**（grade / 置信度 / 低置信行 / 纠偏 / 去噪），工作台「转换检验报告」可视

> 真机实测：rec 解词图为 "PAIN"；产品标签 0.978；倒置文档 0.976；+10° 倾斜 8→16 行恢复至 0.970；15% 椒盐噪点 4→16 行恢复。

### LaTeX 数学渲染
`$...$` / `$$...$$` 受保护识别（反斜杠 / 下划线逐字保留，货币不误判），预览用本地 **KaTeX** 排版，零联网。

### 转换后检验三层
规则 diff + SSIM 视觉对比 + OCR 回读，统一写入 `qualityReport` 并在工作台可视；核心算法零依赖、纯函数。

### 其他
- 轻量 OCR（Tesseract.js）可选引擎 + 优先级路由
- Repair Engine + 按需模型缓存（manifest / SHA-256 / 安全中心导入）
- `npm run samples:generate`：全格式、大小不一（≥3MB）测试样例语料生成器

## 修复

- 首页空白（缺 `getKnownInputFormats` re-export）
- OCR 实际不触发（转换绕过 OCR 异步管线）
- 冻结引擎导致安全中心模型导入静默失败
- OCR 识别质量被 Repair Engine 覆盖丢失

## 方向调整

高级 OCR 内置目标从 **PaddleOCR-VL / MinerU（VLM）** 调整为 **PP-OCRv5（ONNX/WebGPU）**——VLM 在浏览器/Tauri 本地 + 零云端 + 轻量默认包约束下不可内嵌，标注为远期/外部资源。

## 升级指南

从 v2.2.x 升级：直接覆盖部署即可，无破坏性 API 变更。运行高级 OCR 需 `npm install onnxruntime-web && npm run vendor:onnx`（应用已内置 PP-OCRv5 模型，开箱即用）。

## 全部测试通过

`npm test` 全套 **28 个脚本**通过；`git diff --check`、`npm run release:prepare` 通过。Windows MSI / NSIS 安装包经真实 `npm run desktop:build` 产出。
