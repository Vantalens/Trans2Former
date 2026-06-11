# Trans2Former

> 本地优先的多格式文档转换工具

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former 是一款桌面级文档转换工具：14 种输入格式、11 种输出格式，全部转换在本机完成。不上传文件、不依赖 Office / LibreOffice / Pandoc，并对每次转换生成可解释的质量检验报告。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## 特性

- **本地优先**：转换、OCR、公式渲染全部离线执行，文档处理阶段禁止联网
- **转换可检验**：规则 diff、SSIM 视觉对比、OCR 回读三层校验，统一写入质量报告并在工作台可视
- **本地 OCR**：内置 PP-OCRv5（ONNX Runtime，WebGPU / WASM），支持方向校正、倾斜纠偏、自适应去噪、版面结构识别与质量评分
- **公式渲染**：本地 KaTeX 排版 `$...$` / `$$...$$`
- **高性能**：Web Worker 并行管线，不设人为文件大小上限
- **零运行时依赖**：核心转换不需要任何外部办公软件

---

## 支持的格式

| 类别 | 输入（14 种） | 输出（11 种） |
| --- | --- | --- |
| 文档 | Markdown、HTML、TXT、DOCX、PDF、EPUB | Markdown、HTML、TXT、DOCX、PDF、EPUB |
| 数据 | JSON、CSV、XML、XLSX | JSON、CSV、XML、XLSX |
| 演示 | PPTX | PPTX |
| 图片 | PNG（OCR 识别） | — |
| 实验性 | DOC（仅文本提取）、OFD（早期预览） | — |

常用路径：Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

完整转换矩阵见 [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md)。

---

## 快速开始

```bash
npm install   # 安装依赖
npm start     # 启动，浏览器打开 http://localhost:3000
npm test      # 运行测试套件（28 个脚本）
```

桌面应用（Tauri 2）与发布包：

```bash
npm run desktop:dev       # 桌面开发模式
npm run release:prepare   # 生成发布包
```

---

## 项目结构

```text
Trans2Former/
├── public/          # 前端应用（纯 ESM，无构建步骤）
│   ├── core/        # 数据模型、格式注册表、OCR、校验
│   ├── formats/     # 各格式 reader / writer
│   └── workers/     # Web Worker 转换管线
├── docs/            # 完整文档
├── samples/         # 测试样例
├── scripts/         # 构建、vendor 与测试脚本
└── src-tauri/       # Tauri 桌面壳
```

---

## 核心本地能力

增强能力直接内置于核心模块，不使用插件机制；模型资源不入 git，由 vendor 脚本按钉定来源下载并经 SHA-256 校验（[scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)），随发布包分发、开箱即用。

- **PP-OCRv5 本地 OCR**：图片与扫描 PDF 的检测 + 识别 + 方向分类，含纠偏、去噪、版面归并和置信度评分
- **Tesseract.js 轻量 OCR**：可选引擎，在安全中心导入 tessdata 即可启用
- **三层转换校验**：规则 diff + SSIM + OCR 回读，结果可解释、可降级
- **KaTeX 数学渲染**：零联网

OCR 运行时准备：

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

浏览器端验证记录见 [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md)。

---

## 数据安全

- 不上传文件、文件名、转换结果或错误日志
- 文档处理阶段禁止网络访问
- 不接入第三方转换 API 或分析 SDK

完整策略见 [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)。

---

## 文档

| 入口 | 内容 |
| --- | --- |
| [docs/README.md](docs/README.md) | 文档总索引 |
| [INSTALL.md](INSTALL.md) | 安装指南 |
| [CHANGELOG.md](CHANGELOG.md) | 版本记录 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献与测试要求 |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | 核心架构 |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | 转换路由 |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | 安全策略 |

---

## 已知限制

1. 部分复杂样式在跨格式转换中无法完全保留
2. PPTX 动画与图表尚不支持
3. OCR 对强斜体、艺术字识别有限；DOC / OFD 输入为实验性
4. 暂不支持 ZIP64 超大压缩包

---

## 贡献

欢迎提交 Issue 与 Pull Request：fork 仓库 → 创建特性分支 → 提交更改 → 发起 PR。开发规范与测试要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 许可证

MIT，详见 [LICENSE](LICENSE)。

---

## 链接

- 仓库：https://github.com/Vantalens/Trans2Former
- 问题反馈：[Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- 社区：https://linux.do/
