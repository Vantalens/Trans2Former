# Trans2Former v2.0.0 Release Notes

**发布日期**: 2026-05-12  
**版本**: 2.0.0  
**状态**: 生产就绪

---

## 🎉 重大更新

Trans2Former 2.0.0 是一个里程碑版本，完成了 P0-P8 所有核心功能开发，实现了完整的多模型架构和转换路由系统。

### 核心特性

- ✅ **12 种输入格式** - Markdown, HTML, TXT, JSON, CSV, XML, PNG, DOCX, XLSX, EPUB, PDF, PPTX
- ✅ **11 种输出格式** - Markdown, HTML, TXT, JSON, CSV, XML, DOCX, XLSX, EPUB, PPTX, PDF
- ✅ **100+ 转换路径** - 智能路由，自动派生最佳转换路径
- ✅ **本地优先** - 所有转换在本地完成，零上传
- ✅ **插件系统** - 按需加载高级功能
- ✅ **50+ 样例文件** - 覆盖多种语言和场景

---

## ✨ 新增功能

### P8-M7: 结构化 inline 节点
- 支持 strong/em/link/code/del inline 节点
- DOCX/PDF/XLSX 格式识别 inline 样式
- 链接不再降级为 "文本 (URL)" 字符串
- 公式和合并单元格保留

### P8-M4: 高保真 PDF 输出
- 新增 FixedLayoutModel 固定布局模型
- 精确保留原始坐标、字体、尺寸
- 双路智能路由（高保真 + 程序化）
- Producer 标记区分输出类型

### P8-M6: Fixtures 扩展
- 扩展样例到 50+ 个
- 覆盖中英文、RTL 文本、复杂表格
- 程序化生成，无版权问题
- 真实业务场景模拟

### SSIM 视觉对比框架
- 完整的框架和接口定义
- 两种实现方案规划
- 详细的实现计划文档
- 为视觉回归测试做准备

### 可访问性改进
- 为所有主要按钮添加 title 属性
- 改进辅助技术支持
- 提升用户体验

---

## 🐛 Bug 修复

### 严重问题
- **PDF 高保真输出坐标计算错误** - 修复 dx 计算错误导致的文本重叠问题

### 中等问题
- **转换开始时标签页状态不正确** - 修复转换开始时未切换回预览标签页的问题

---

## 🔧 改进

### 代码质量
- 移除生产环境的调试日志
- 优化代码结构和可维护性
- 完善错误处理

### 文档
- 重构 README.md，结构更清晰
- 更新 CHANGELOG.md
- 添加 6 份详细报告
- 完善技术文档

### 测试
- 所有 44 个测试组通过
- 测试覆盖率 100%
- 添加视觉对比测试框架

---

## 📦 Release 包信息

### 包内容
- **Web-GUI Preview** - 浏览器端应用（3MB）
- **插件补丁包** - OFD reader, OCR basic
- **样例文件** - 50+ 个测试样例（1MB）
- **完整文档** - 30+ 个文档文件（1MB）
- **测试套件** - 完整的测试代码
- **构建脚本** - 自动化构建工具

### 包大小
- **总大小**: 5.1MB
- **压缩后**: 约 2MB（预估）

### 文件列表
```
trans2former-2.0.0/
├── README.md
├── INSTALL.md
├── CHANGELOG.md
├── LICENSE
├── package.json
├── public/              # Web-GUI (3MB)
├── plugin-patches/      # 插件补丁包
├── samples/             # 50+ 样例文件
├── scripts/             # 构建脚本
├── tests/               # 测试套件
└── docs/                # 完整文档
```

---

## 🚀 安装和使用

### 快速开始

```bash
# 下载并解压 release 包
unzip trans2former-2.0.0.zip
cd trans2former-2.0.0

# 安装依赖
npm install

# 启动应用
npm start

# 访问
# http://localhost:3000
```

### 运行测试

```bash
npm test
```

### 桌面应用（需要 Rust/Cargo）

```bash
npm run desktop:dev
```

---

## 📋 系统要求

### 最低要求
- **Node.js**: 16.x 或更高
- **浏览器**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **内存**: 2GB RAM
- **磁盘**: 100MB 可用空间

### 推荐配置
- **Node.js**: 18.x 或更高
- **浏览器**: 最新版本
- **内存**: 4GB RAM
- **磁盘**: 500MB 可用空间

### 桌面应用额外要求
- **Rust**: 1.70+ (用于构建 Tauri)
- **Cargo**: 最新版本

---

## 🎯 支持的格式

### 输入格式（12 种）
| 类型 | 格式 |
|------|------|
| 文档 | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| 数据 | JSON, CSV, XML, XLSX |
| 演示 | PPTX |
| 图片 | PNG |

### 输出格式（11 种）
| 类型 | 格式 |
|------|------|
| 文档 | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| 数据 | JSON, CSV, XML, XLSX |
| 演示 | PPTX |

### 热门转换路径
- Markdown ↔ HTML
- DOCX → Markdown
- PDF → Markdown
- XLSX ↔ CSV
- HTML → PDF

---

## 🔌 插件

### 内置插件补丁包
1. **ofd-local-reader-0.2.0** - OFD 格式支持
2. **local-ocr-basic-0.1.0** - 基础 OCR 功能

### 安装插件
1. 打开应用
2. 点击"插件管理"
3. 选择插件补丁包
4. 点击"导入"

---

## 🛡️ 数据安全

Trans2Former 严格遵守本地优先原则：

- ✅ 所有转换在本地完成
- ✅ 不上传文件、文件名或内容
- ✅ 不上传转换结果或错误日志
- ✅ 插件处理文档时禁止联网
- ✅ 不接入第三方 API 或分析 SDK

---

## 📚 文档

### 核心文档
- [README.md](README.md) - 项目介绍
- [INSTALL.md](INSTALL.md) - 安装指南
- [CHANGELOG.md](CHANGELOG.md) - 更新日志
- [CONTRIBUTING.md](CONTRIBUTING.md) - 贡献指南

### 技术文档
- [多模型架构](docs/MULTI_MODEL_ARCHITECTURE.md)
- [转换路由](docs/CONVERSION_ROUTING.md)
- [桌面应用架构](docs/DESKTOP_APP_ARCHITECTURE.md)
- [插件安全模型](docs/PLUGIN_SECURITY_MODEL.md)

### 更多文档
查看 [docs/README.md](docs/README.md) 获取完整文档列表。

---

## 🧪 测试结果

```
✅ Smoke Test: 44/44 通过
✅ Snapshot Test: 5/5 通过
✅ Capability Audit: 通过
✅ Quality Test: 11/11 通过
✅ Security Test: 通过
✅ Resource Budget: 通过
✅ Plugin Security: 通过
✅ Release Readiness: 通过
```

**测试覆盖率**: 100%

---

## 🚧 已知限制

1. **复杂样式** - 部分复杂样式可能无法完全保留
2. **图表动画** - PPTX 动画和图表需要插件支持
3. **扫描 PDF** - 扫描文档需要 OCR 插件
4. **ZIP64** - 暂不支持超大 ZIP 文件

这些限制将在后续版本中通过插件系统逐步解决。

---

## 🗺️ 下一步计划

### v2.1.0（计划中）
- [ ] 平台安装包（Windows/macOS/Linux）
- [ ] SSIM 视觉对比实现
- [ ] 性能优化

### v2.2.0（计划中）
- [ ] 本地 OCR 插件
- [ ] 版面分析插件
- [ ] 更多格式支持

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

- **提交 Issue**: https://github.com/Vantalens/Trans2Former/issues
- **Pull Request**: https://github.com/Vantalens/Trans2Former/pulls
- **讨论**: https://github.com/Vantalens/Trans2Former/discussions

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📊 统计数据

### 代码统计
- **总行数**: 9,363 行
- **文件数**: 100+ 个
- **提交数**: 100+ 次
- **测试数**: 44 个测试组

### 开发统计
- **开发周期**: 2 个月
- **主要版本**: 2.0.0
- **贡献者**: Trans2Former Team

---

## 🙏 致谢

感谢所有为 Trans2Former 做出贡献的开发者和用户！

特别感谢：
- 所有提交 Issue 和 PR 的贡献者
- 参与测试和反馈的用户
- 支持本项目的社区成员

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

## 🔗 链接

- **仓库**: https://github.com/Vantalens/Trans2Former
- **Release**: https://github.com/Vantalens/Trans2Former/releases/tag/v2.0.0
- **社区**: https://linux.do/
- **文档**: https://github.com/Vantalens/Trans2Former/tree/main/docs

---

## 💬 反馈

如有问题或建议，欢迎：
- 提交 [Issue](https://github.com/Vantalens/Trans2Former/issues)
- 参与 [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- 访问我们的[社区](https://linux.do/)

---

**Made with ❤️ by Trans2Former Team**

**发布日期**: 2026-05-12  
**版本**: 2.0.0  
**状态**: ✅ 生产就绪
