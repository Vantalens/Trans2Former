# P9-D 高级 OCR 接入路线调研

状态：调研 / 待方向确认
日期：2026-05-29
前置基础：P9-A OCR 链路（tesseract）/ P9-B FixedLayoutModel / P9-C 三层检验 / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
触发：DEVELOPMENT_TASKS 把 P9-D 命名为「PaddleOCR-VL / MinerU」，本调研核实其在本项目约束下的可行性。

## 项目硬约束（来自既定方向）

- 本地优先、零上传、**不调用云端 OCR/AI**、处理阶段禁联网。
- 默认安装包 30–80 MB；GB 级模型**不进默认包**，按需下载到 model-cache。
- 运行形态：浏览器 + Tauri（Web 前端 + Rust 壳），**无 Python 运行时**。
- OCR 作为核心内置能力，按需启用、按需下载、可禁用、可清理。

## 调研结论

### PaddleOCR-VL（0.9B VLM）—— 浏览器/本地不可行（当前）

- 即便量化，模型约 **500MB** 下载，推理需 **1–2GB VRAM**。
- **无成熟的 ONNX / WebGPU 转换路径**（依赖 PaddlePaddle 自有框架）；官方推荐通过 vLLM 服务或 API 使用。
- 结论：与「浏览器/Tauri 本地、零云端」冲突，**本阶段不接 VLM**。

来源：
- [PaddleOCR-VL Inference Backends (DeepWiki)](https://deepwiki.com/PaddlePaddle/PaddleOCR/2.2.2-paddleocr-vl-inference-backends-and-acceleration)
- [PaddleOCR-VL-1.5 分析（lilting）](https://lilting.ch/en/articles/paddleocr-vl-1-5-document-parsing)
- [PaddleOCR-VL 官方用法](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PaddleOCR-VL.html)

### MinerU（2.5 / Pro 1.2B VLM + pipeline atomic models）—— Python 工具，非 JS 可嵌入

- 现代栈基于 PyTorch（pipeline 原子模型 ~1–2GB）+ vLLM（VLM 后端，官方 Docker 需 CUDA）。
- 支持完全离线（`MINERU_MODEL_SOURCE=local` + `mineru-models-download`），但是 **Python CLI/服务**，不能嵌入 Web/Tauri 前端。
- 唯一接入方式是「外部 Python sidecar」：重、需 Python/CUDA、与 30–80MB 轻量默认包原则冲突。
- 结论：**本阶段不接 MinerU 内嵌**；可作为「高级用户外部工具」远期评估。

来源：
- [MinerU GitHub](https://github.com/opendatalab/mineru)
- [MinerU 模型配置/离线（DeepWiki）](https://deepwiki.com/opendatalab/MinerU/3.2-model-configuration)
- [MinerU2.5 论文](https://arxiv.org/html/2509.22186v1)

### PP-OCRv5（ONNX Runtime + WebGPU）—— 真正可行的本地高级 OCR

- **PaddleOCR.js** / 社区 **ppu-paddle-ocr**：基于 PP-OCRv5 的浏览器/多 JS runtime SDK，ONNX Runtime + WebGPU 加速 + WASM 回退，INT8 量化，40–100+ 语言，数据留在本地。
- PP-OCRv5 全系列都有 **ONNX 导出**；WebGPU 不可用时自动回退 WASM。
- 与本项目契合度高：作为比 tesseract 更高精度的 OCR engine 注册到现有 `defaultOCRRegistry`，ONNX 模型按需下载到 model-cache，复用 P9-A 的 manifest/checksum/Storage + P9-B 的 FixedLayoutModel + P9-C 的 OCR 回读检验。

来源：
- [PaddleOCR.js 浏览器部署](http://www.paddleocr.ai/main/en/version3.x/deployment/browser.html)
- [ppu-paddle-ocr (JSR)](https://jsr.io/@snowfluke/ppu-paddle-ocr)
- [Deterministic OCR in JavaScript: PaddleOCR for Node/Bun/Deno/Browser (DEV)](https://dev.to/awalariansyah/deterministic-ocr-in-javascript-paddleocr-for-node-bun-deno-and-the-browser-2bgn)

## 建议：把 P9-D「高级 OCR」目标从 VLM 改为 PP-OCRv5（ONNX/WebGPU）

理由：VLM（PaddleOCR-VL/MinerU）在「浏览器/Tauri 本地 + 零云端 + 轻量默认包」约束下当前不可落地；PP-OCRv5（ONNX/WebGPU）是同时满足精度提升与全部硬约束的现实路径，且能无缝复用 P9-A~C 的全部基础设施（registry / manifest / model-cache / FixedLayout / OCR 回读）。

如确认，需同步修订把「PaddleOCR-VL / MinerU」写为内置目标的文档：`DEVELOPMENT_TASKS` / `DESKTOP_APP_ARCHITECTURE` / `DESKTOP_RELEASE_PLAN` / `RESOURCE_BUDGET` / `PRODUCT_STRATEGY` / `MULTI_MODEL_ARCHITECTURE` / `CONVERSION_ROUTING`（及 `local-model-direction-test` 守门关键词），将 VLM 标注为「远期/外部资源」，把 PP-OCRv5（ONNX/WebGPU）确立为高级 OCR 内置路径。

## 拟定子阶段（若采纳 PP-OCRv5 路线）

- **P9-D.1 引擎骨架 + 契约**：`paddle-ocr-engine.js`（实现现有 `OCREngine` 接口，注册到 `defaultOCRRegistry`，taskCapabilities 含 `ocr-text`/`ocr-layout`）+ ONNX 模型 ModelManifest 登记到 `defaultModelCache`（not-downloaded）+ Node 端不可用回退。**不引入运行时依赖、不实跑推理**（沿用 tesseract 骨架先行的节奏）。
- **P9-D.2 ONNX runtime vendor + WebGPU 接入**：vendor onnxruntime-web（optionalDependency）+ WebGPU/WASM 检测 + COOP/COEP 说明；浏览器端真实推理，Node stub。
- **P9-D.3 模型按需下载 + 安全中心 UI**：PP-OCRv5 det/rec/cls ONNX 模型按需下载到 model-cache（SHA-256），安全中心导入/清理按钮，断网降级提示。
- **P9-D.4 接入转换链 + 三层检验**：把高精度 engine 经 `pickForTask` 优先于 tesseract；OCR 回读层复用以更高精度回读；FixedLayout 版面增强。

## 本调研不做

- 不写任何 P9-D 代码（等方向确认）。
- 不改既有文档（等方向确认后统一修订）。
- 不接 VLM 内嵌；不引入 Python sidecar。
