# TECH_STACK.md - Trans2Former 技术栈与架构

版本：v1.0.0  
状态：生效  
最后更新：2026-06-23

## 1. 概述

Trans2Former 是一个浏览器优先的多格式文档转换工具，采用纯前端转换引擎 + 可选 OCR 的架构设计，支持本地离线运行。

### 1.1 核心技术栈

- **前端框架**：原生 JavaScript (ES Modules)
- **后端服务**：Express.js (仅用于静态文件服务)
- **桌面应用**：Tauri 2 (跨平台)
- **测试框架**：Node.js 内置 assert + c8 覆盖率
- **构建工具**：无需构建（ES Modules 直接运行）

### 1.2 架构原则

1. **浏览器优先**：核心功能在浏览器内完成，无服务器依赖
2. **模块化设计**：清晰的模块边界，单向依赖
3. **按需加载**：第三方库按需加载，降低首次加载时间
4. **隐私安全**：文件不上传服务器，本地处理
5. **性能优化**：Web Workers 避免 UI 阻塞
6. **可测试性**：模块独立可测，测试覆盖率 80%+

## 2. 项目结构

```
Trans2Former/
├── public/                      # 前端代码（浏览器运行）
│   ├── core/                    # 核心转换引擎（460KB）
│   │   ├── document-model.js    # 文档模型定义
│   │   ├── document-audit.js    # 文档审计和质量报告
│   │   ├── format-registry.js   # 格式注册和路由
│   │   ├── binary-utils.js      # 二进制工具
│   │   ├── text-decoding.js     # 文本编码检测
│   │   ├── zip-container.js     # ZIP/OOXML 容器
│   │   ├── conversion-error.js  # 错误处理
│   │   ├── repair-engine.js     # 修复引擎
│   │   ├── ocr/                 # OCR 管线
│   │   │   ├── tesseract-runtime.js
│   │   │   ├── paddle-ocr-pipeline.js
│   │   │   ├── paddle-ocr-engine.js
│   │   │   ├── scan-pdf-stage.js
│   │   │   └── png-ocr.js
│   │   ├── verification/        # 三层验证
│   │   │   ├── verification-stage.js
│   │   │   ├── ssim.js          # 图像相似度
│   │   │   ├── ocr-readback.js  # OCR 回读
│   │   │   └── rule-diff.js     # 规则差异
│   │   └── model-cache/         # 模型缓存管理
│   │       ├── manifest.js
│   │       └── indexeddb-storage.js
│   ├── formats/                 # 格式读写器（512KB）
│   │   ├── markdown.js          # Markdown 读写
│   │   ├── html.js              # HTML 读写
│   │   ├── pdf.js               # PDF 读取
│   │   ├── pdf-output.js        # PDF 写入
│   │   ├── pdf-output-high-fidelity.js
│   │   ├── pdf-cid-font.js      # PDF 中文字体
│   │   ├── docx.js              # DOCX 读取
│   │   ├── docx-output.js       # DOCX 写入
│   │   ├── xlsx.js              # XLSX 读写
│   │   ├── pptx.js              # PPTX 读取
│   │   ├── epub.js              # EPUB 读取
│   │   ├── csv.js               # CSV 读写
│   │   ├── json.js              # JSON 读写
│   │   ├── xml.js               # XML 读写
│   │   ├── plain-text.js        # 纯文本
│   │   ├── png.js               # PNG 读取
│   │   └── inline-tokens.js     # 内联样式处理
│   ├── workers/                 # Web Workers（128KB）
│   │   └── convert-worker.js    # 转换 Worker
│   ├── vendor/                  # 第三方库（96MB，按需加载）
│   │   ├── pdfjs/               # PDF.js (~4MB)
│   │   ├── tesseract/           # Tesseract.js (~30MB)
│   │   ├── onnxruntime/         # ONNX Runtime (~25MB)
│   │   ├── paddleocr/           # PaddleOCR 模型 (~21MB)
│   │   └── katex/               # KaTeX (~1MB)
│   ├── app.js                   # 主应用入口
│   ├── index.html               # 主页面
│   └── style.css                # 样式
├── src/                         # 服务端代码
│   └── web-server.js            # Express 静态文件服务
├── scripts/                     # 测试和构建脚本
│   ├── *-test.js                # 测试文件（32+个）
│   ├── sync-*-vendor.js         # 第三方库同步脚本
│   └── prepare-release.js       # 发布准备脚本
├── src-tauri/                   # Tauri 桌面应用
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       └── main.rs
├── coverage/                    # 覆盖率报告（生成）
├── CLAUDE.md                    # AI 协作入口
├── PRD.md                       # 需求文档
├── TECH_STACK.md                # 本文件
├── TEST_PLAN.md                 # 测试计划
├── IMPLEMENTATION_PLAN.md       # 实施计划
├── README.md                    # 用户文档
└── package.json                 # 依赖管理
```

## 3. 核心模块设计

### 3.1 Core 模块（核心引擎）

**职责**：提供格式无关的核心转换能力

**关键组件**：

#### DocumentModel（文档模型）
```javascript
{
  blocks: [
    { type: "heading", level: 1, text: "..." },
    { type: "paragraph", inlines: [...] },
    { type: "table", rows: [...] },
    { type: "image", src: "...", alt: "..." }
  ],
  assets: {
    images: Map<id, ArrayBuffer>,
    fonts: Map<id, ArrayBuffer>
  },
  metadata: {
    title: "...",
    author: "...",
    warnings: [...]
  }
}
```

#### FormatRegistry（格式注册）
- 注册所有支持的格式
- 定义 reader/writer 接口
- 管理格式能力矩阵

#### RoutePlanner（路由规划）
- 计算最佳转换路径
- 支持直接转换和中间格式
- 路由温度评分（hot/warm/cold）

#### 验证引擎（三层）
1. **SSIM**：图像相似度验证（视觉质量）
2. **OCR Readback**：OCR 回读验证（文本准确性）
3. **Rule Diff**：规则差异验证（结构保留）

### 3.2 Formats 模块（格式处理）

**职责**：实现各种格式的读取和写入

**设计模式**：Reader/Writer 模式

```javascript
// Reader 接口
export async function readFormat(bytes, options) {
  return {
    model: DocumentModel,  // 转换后的文档模型
    warnings: [],          // 警告信息
    metadata: {}           // 元数据
  };
}

// Writer 接口
export async function writeFormat(model, options) {
  return {
    data: ArrayBuffer | String,  // 输出数据
    mime: "application/...",      // MIME 类型
    warnings: []                  // 警告信息
  };
}
```

**关键实现**：

- **Markdown**: CommonMark 扩展，支持表格、任务列表、脚注
- **HTML**: 语义化 HTML 解析，保留内联样式
- **PDF**: PDF.js 解析 + 核心解析器后备，CID 字体输出
- **DOCX**: OOXML 解析，支持样式、表格、图像
- **XLSX**: SpreadsheetML 解析，支持公式、合并单元格
- **CSV**: RFC 4180 兼容，支持 BOM、引号、多行

### 3.3 Workers 模块（后台处理）

**职责**：在独立线程执行转换，避免 UI 阻塞

**架构**：
```
Main Thread          Worker Thread
    |                     |
    |---(transfer)------->|
    |   {input, format}   |
    |                     |
    |                  [convert]
    |                     |
    |<--(transfer)--------|
    |   {output, result}  |
```

**优化**：
- Transferable 对象传输（零拷贝）
- SharedArrayBuffer（大文件场景）
- 虚拟列表（大输出场景）

### 3.4 Vendor 模块（第三方库）

**策略**：按需加载，不打包到主代码

**库选择理由**：

- **PDF.js**：Mozilla 官方，生产级 PDF 解析
- **Tesseract.js**：Emscripten 编译的 OCR，支持 100+ 语言
- **PaddleOCR**：中文 OCR 优化，移动端模型
- **ONNX Runtime Web**：高性能模型推理
- **KaTeX**：LaTeX 数学公式渲染

## 4. 技术选型理由

### 4.1 原生 JavaScript vs 框架

**选择**：原生 ES Modules

**理由**：
- ✅ 零构建依赖，开发体验简单
- ✅ 浏览器原生支持，加载快
- ✅ 易于集成到其他项目
- ✅ 减少供应链安全风险
- ❌ 缺少响应式和组件抽象（可接受，UI 复杂度低）

### 4.2 浏览器内转换 vs 服务器转换

**选择**：浏览器内转换

**理由**：
- ✅ 隐私保护（文件不离开本地）
- ✅ 降低成本（无服务器算力）
- ✅ 离线可用
- ✅ 响应快速
- ❌ 受浏览器内存限制（通过分块处理解决）
- ❌ 不支持所有格式（优先覆盖常用格式）

### 4.3 Web Workers vs 主线程

**选择**：混合模式（核心转换在 Worker，UI 在主线程）

**理由**：
- ✅ 避免 UI 冻结
- ✅ 利用多核 CPU
- ✅ Transferable 对象高效传输
- ❌ 代码复杂度增加（Worker 通信）
- ❌ 调试稍困难（已通过完善的测试缓解）

### 4.4 DocumentModel 中间表示 vs 直接转换

**选择**：统一 DocumentModel

**理由**：
- ✅ 解耦输入输出格式（添加新格式容易）
- ✅ 统一质量验证
- ✅ 便于实现批量操作
- ✅ 可扩展性好
- ❌ 性能开销（直接转换更快，但可接受）

### 4.5 测试框架选择

**选择**：Node.js 内置 assert + c8

**理由**：
- ✅ 零依赖，快速启动
- ✅ 标准化，易于迁移
- ✅ c8 原生支持 V8 覆盖率
- ❌ 缺少 BDD/TDD 语法糖（可接受，保持简单）

## 5. 数据流

### 5.1 完整转换流程

```
用户上传文件
    ↓
[文件解析] → ArrayBuffer
    ↓
[格式检测] → 确定输入格式
    ↓
[格式 Reader] → DocumentModel
    ↓
[文档审计] → 添加 ID、质量报告
    ↓
[验证引擎] → SSIM/OCR/Rule Diff（可选）
    ↓
[格式 Writer] → 目标格式数据
    ↓
[预览渲染] → 用户确认
    ↓
[下载保存] → 本地文件系统
```

### 5.2 OCR 流程

```
PDF/图像输入
    ↓
[扫描检测] → 判断是否需要 OCR
    ↓（需要）
[模型下载] → 下载 Tesseract/PaddleOCR 模型
    ↓
[图像预处理] → 去噪、旋转、增强
    ↓
[OCR 识别] → 文本和坐标
    ↓
[结构推断] → 段落、标题、表格
    ↓
[DocumentModel] → 统一文档模型
```

## 6. 性能优化

### 6.1 首次加载优化

- **目标**：< 2s 首屏可交互（快速 3G 网络）
- **策略**：
  - 核心代码 < 1MB
  - Vendor 按需加载
  - Service Worker 缓存
  - 预连接第三方资源

### 6.2 转换性能

- **目标**：
  - 小文件（< 100KB）：< 500ms
  - 中等文件（100KB - 10MB）：< 5s
  - 大文件（10MB+）：渐进式处理，显示进度

- **优化**：
  - 分块处理
  - Web Workers 并行
  - Transferable 对象
  - 虚拟滚动预览

### 6.3 内存管理

- **限制**：
  - 最大文件大小：50MB
  - 最大 ZIP 解压：100MB
  - Worker 内存预算：256MB

- **策略**：
  - 及时释放大对象
  - 使用流式处理
  - 图像降采样预览

## 7. 安全设计

### 7.1 输入验证

- 文件大小限制
- ZIP Bomb 防护（压缩比检查）
- 路径遍历防护（ZIP 路径规范化）
- XML 外部实体防护

### 7.2 输出转义

- HTML 实体转义
- PDF 字符串转义
- XML 属性转义

### 7.3 CSP 配置

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  worker-src 'self' blob:;
```

## 8. 依赖管理

### 8.1 生产依赖

```json
{
  "express": "^4.21.2",       // 静态文件服务
  "puppeteer": "^25.1.0"      // E2E 测试（未来）
}
```

### 8.2 可选依赖（按需加载）

```json
{
  "pdfjs-dist": "^5.7.284",     // PDF 解析
  "tesseract.js": "^5.1.1",     // OCR 引擎
  "onnxruntime-web": "^1.26.0"  // 模型推理
}
```

### 8.3 开发依赖

```json
{
  "c8": "^11.0.0",               // 覆盖率工具
  "onnxruntime-node": "^1.20.1", // Node.js 模型测试
  "pngjs": "^7.0.0"              // PNG 处理测试
}
```

## 9. 扩展点设计

### 9.1 格式扩展

```javascript
// 注册新格式
registry.register({
  format: "rtf",
  label: "Rich Text Format",
  extensions: [".rtf"],
  mime: "application/rtf",
  canRead: true,
  canWrite: false,
  reader: readRTF,
  writer: null
});
```

### 9.2 验证器扩展

```javascript
// 添加自定义验证器
verification.addValidator({
  name: "link-checker",
  validate: async (model) => {
    // 验证所有链接有效性
  }
});
```

### 9.3 修复规则扩展

```javascript
// 添加修复规则
repair.addRule({
  name: "fix-broken-images",
  validator: (model) => /* 检测损坏图像 */,
  handler: (model) => /* 修复或移除 */
});
```

## 10. 未来技术方向

### 10.1 插件系统
- 动态加载格式插件
- 沙箱环境隔离
- 权限控制

### 10.2 云端同步
- WebRTC P2P 同步
- 端到端加密
- 增量同步

### 10.3 AI 增强
- 文档摘要生成
- 智能翻译
- 内容提取优化

## 11. 变更记录

- v1.0.0 (2026-06-23): 初版技术栈文档，基于当前项目架构
