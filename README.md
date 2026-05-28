# Trans2Former

> 本地优先的多格式文档转换工具

Trans2Former 是一个专业级的桌面文档转换工具，支持 12 种输入格式和 11 种输出格式的相互转换。所有转换在本地完成，零上传，保护您的数据隐私。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/smoke-46%20groups%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](#)

---

## ✨ 特性

- 🔒 **本地优先** - 所有转换在本地完成，不上传任何数据
- 🚀 **高性能** - 基于 Web Worker 的并行处理
- 📦 **零依赖** - 不需要安装 Office、LibreOffice 或 Pandoc
- 🎨 **实时预览** - 转换前后实时预览文档
- 📝 **结构化编辑** - 支持编辑转换后的文档结构
- 🧩 **核心内置增强** - OFD、OCR、版面分析等能力代码核心内置；OCR 模型资源按需本地下载到 model-cache，不进入默认安装包
- 🌍 **多语言** - 支持中英文、RTL 文本等
- ⚡ **无大小限制** - 不设置人为文件大小上限

---

## 📋 支持的格式

### 输入格式（12 种）
- **文档**: Markdown, HTML, TXT, DOCX, PDF, EPUB
- **数据**: JSON, CSV, XML, XLSX
- **演示**: PPTX
- **图片**: PNG

### 输出格式（11 种）
- **文档**: Markdown, HTML, TXT, DOCX, PDF, EPUB
- **数据**: JSON, CSV, XML, XLSX
- **演示**: PPTX

### 热门转换路径
- Markdown ↔ HTML
- DOCX → Markdown
- PDF → Markdown
- XLSX ↔ CSV
- HTML → PDF

---

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动应用

```bash
npm start
```

然后在浏览器中打开：

```
http://localhost:3000
```

### 运行测试

```bash
npm test
```

### 生成 Release 包

```bash
npm run release:prepare
```

---

## 🏗️ 项目结构

```
Trans2Former/
├── public/                    # 前端界面
│   ├── app.js                 # 主应用逻辑
│   ├── core/                  # 核心模块
│   │   ├── models/            # 数据模型
│   │   ├── format-registry.js # 格式注册表
│   │   └── workbench-state.js # 工作台状态
│   ├── formats/               # 格式处理器
│   │   ├── markdown.js        # Markdown 处理
│   │   ├── html.js            # HTML 处理
│   │   ├── docx.js            # DOCX 处理
│   │   ├── pdf.js             # PDF 处理
│   │   └── ...                # 其他格式
│   └── workers/               # Web Workers
├── samples/                   # 样例文件（50+）
├── tests/                     # 测试套件
├── docs/                      # 完整文档
├── src-tauri/                 # Tauri 桌面壳
└── scripts/                   # 构建脚本
```

---

## 📖 使用指南

### 基本使用

1. **上传文件** - 拖拽或点击上传按钮
2. **选择格式** - 选择目标输出格式
3. **预览** - 查看转换前后的预览
4. **转换** - 点击转换按钮
5. **下载** - 下载转换结果

### 高级功能

- **批量转换** - 同时转换多个文件
- **编辑输出** - 直接编辑转换后的文本
- **版本历史** - 查看和恢复历史版本
- **质量报告** - 查看转换质量和警告
- **质量报告** - 查看转换质量和警告

---

## 🧩 核心本地增强

Trans2Former 不再提供插件安装模式，增强能力代码直接并入核心本地模块；默认安装包目标 30–80 MB，不内置 GB 级模型，相关模型资源按需本地下载到 model-cache：

- **OFD 支持** - 政务格式支持
- **本地 OCR** - 扫描文档识别（首次启用时下载本地 OCR 模型到 model-cache，识别全程本机执行）
- **版面分析** - 复杂布局识别
- **表格恢复** - PDF 表格提取
- **转换后检验** - 规则 diff + SSIM 视觉对比 + OCR 回读三层组合写入 QualityReport
- **高级 OCR**（规划中）- PaddleOCR-VL / MinerU 等大模型作为独立本地资源按需获取

这些能力不通过插件包分发；后续实现必须继续保持本地执行、无上传、可解释降级和资源预算约束。

---

## 🛡️ 数据安全

Trans2Former 严格遵守本地优先原则：

- ✅ 所有转换在本地完成
- ✅ 不上传文件、文件名或内容
- ✅ 不上传转换结果或错误日志
- ✅ 文档处理阶段禁止联网
- ✅ 不接入第三方 API 或分析 SDK

---

## 🧪 测试

项目包含完整的测试套件：

```bash
npm test
```

测试覆盖：
- ✅ 核心转换测试（44/44 通过）
- ✅ 快照测试
- ✅ 格式能力审计
- ✅ 安全测试
- ✅ 资源预算测试
- ✅ 本地安全测试
- ✅ 发布就绪测试

---

## 📚 文档

### 核心文档
- [开发任务](DEVELOPMENT_TASKS.md) - 当前任务和进度
- [更新日志](CHANGELOG.md) - 版本更新记录
- [贡献指南](CONTRIBUTING.md) - 如何贡献代码
- [安装指南](INSTALL.md) - 详细安装说明

### 架构文档
- [多模型架构](docs/MULTI_MODEL_ARCHITECTURE.md) - 核心架构设计
- [转换路由](docs/CONVERSION_ROUTING.md) - 转换路径规划
- [桌面应用架构](docs/DESKTOP_APP_ARCHITECTURE.md) - 桌面应用设计
- [安全策略](docs/SECURITY_POLICY.md) - 本地优先和无插件处理边界

### 产品文档
- [产品策略](docs/PRODUCT_STRATEGY.md) - 产品定位和原则
- [格式路线](docs/FORMAT_ROADMAP.md) - 格式支持计划
- [基础格式质量](docs/BASIC_FORMAT_QUALITY.md) - 质量标准

### 更多文档
查看 [docs/README.md](docs/README.md) 获取完整文档列表。

---

## 🎯 技术架构

### 核心技术栈
- **前端**: HTML, CSS, JavaScript
- **桌面**: Tauri v2
- **转换**: TypeScript + Web Workers
- **格式**: 自研解析器 + 标准库

### 数据模型
- **SemanticDoc** - 语义文档模型
- **WorkbookModel** - 工作簿模型
- **SlideModel** - 幻灯片模型
- **FixedLayoutModel** - 固定布局模型
- **AssetGraph** - 资源图模型

### 转换流程
```
输入文件 → Reader → DocumentModel → Mapper → Writer → 输出文件
```

---

## 🚧 已知限制

1. **复杂样式** - 部分复杂样式可能无法完全保留
2. **图表动画** - PPTX 动画和图表需要后续核心增强
3. **扫描 PDF** - 扫描文档需要后续核心 OCR 能力
4. **ZIP64** - 暂不支持超大 ZIP 文件

这些限制将在后续版本中通过核心本地模块逐步解决。

---

## 🗺️ 路线图

### 已完成 ✅
- [x] P0-P8 核心功能
- [x] 12 种输入格式
- [x] 11 种输出格式
- [x] 核心本地能力路线
- [x] 桌面发布准备

### 进行中 🚧
- [ ] 平台安装包构建
- [ ] SSIM 视觉对比
- [ ] 性能优化

### 计划中 📋
- [ ] 本地 OCR 核心增强
- [ ] 版面分析核心增强
- [ ] 更多格式支持

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

## 🔗 链接

- **仓库**: https://github.com/Vantalens/Trans2Former
- **社区**: https://linux.do/
- **文档**: [docs/README.md](docs/README.md)

---

## 💬 反馈

如有问题或建议，欢迎：
- 提交 [Issue](https://github.com/Vantalens/Trans2Former/issues)
- 参与 [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- 访问我们的[社区](https://linux.do/)

---

**Made with ❤️ by Trans2Former Team**
