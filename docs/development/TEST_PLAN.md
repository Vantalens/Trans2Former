# TEST_PLAN.md - Trans2Former 测试计划

版本：v1.0.0  
状态：生效  
最后更新：2026-06-23

## 1. 概述

本文档定义 Trans2Former 项目的测试策略、覆盖率目标、测试分类和关键测试场景，确保产品质量和发布可信度。

### 1.1 测试目标

- **质量保证**：确保核心转换功能正确性、数据完整性和边界安全性
- **回归防护**：防止新代码破坏已有功能
- **性能验证**：确保关键路径满足性能预算
- **发布信心**：提供可量化的发布准备度指标

### 1.2 测试现状

- **测试文件数量**：35+ 个测试脚本
- **当前覆盖率**（2026-06-23）：
  - 语句覆盖率：81.38%（12824/15757）
  - 分支覆盖率：71.95%（3220/4475）
  - 函数覆盖率：85.56%（658/769）
  - 行覆盖率：81.38%（12824/15757）
- **覆盖范围**：`public/**/*.js`（排除 `public/vendor/**`）
- **测试运行时长**：约 2-3 分钟（完整测试套件）

## 2. 测试策略

### 2.1 分层测试模型

Trans2Former 采用经典的测试金字塔策略，平衡测试覆盖、执行速度和维护成本：

```
        /\
       /  \      E2E 测试（10%）
      /----\     - 浏览器全路径测试
     /      \    - 桌面应用冒烟测试
    /--------\   
   /          \  集成测试（30%）
  /------------\ - 转换路径测试
 /              \ - 格式兼容性测试
/----------------\
|    单元测试    | 单元测试（60%）
|    (60%)      | - 核心模块函数测试
\----------------/ - 边界条件测试
```

### 2.2 测试类型分布

| 测试类型 | 占比 | 执行频率 | 运行环境 | 示例 |
|---------|------|---------|---------|------|
| **单元测试** | 60% | 每次提交 | Node.js | 数据完整性、ZIP 解析、文本解码 |
| **集成测试** | 30% | 每次提交 | Node.js | 格式转换路径、OCR 管线、修复引擎 |
| **E2E 测试** | 10% | 每次提交 | Node + Puppeteer | 浏览器冒烟、桌面壳测试 |

### 2.3 测试执行策略

1. **快速反馈循环**：核心单元测试 < 30 秒
2. **完整测试套件**：所有测试 < 3 分钟
3. **并行执行**：测试脚本独立运行，支持并行加速
4. **失败快速退出**：任一测试失败立即中止，避免级联错误

## 3. 覆盖率目标

### 3.1 当前基准线（2026-06-23）

| 指标 | 当前值 | 最低门槛 | 目标值 | 说明 |
|-----|--------|---------|--------|------|
| 语句覆盖率 | 81.38% | 78% | **85%** | 核心转换逻辑必须覆盖 |
| 分支覆盖率 | 71.95% | 64% | **75%** | 关键决策路径必须测试 |
| 函数覆盖率 | 85.56% | 80% | **88%** | 导出函数必须有测试 |
| 行覆盖率 | 81.38% | 78% | **85%** | 与语句覆盖率对齐 |

**配置文件**：`.c8rc`（使用 c8 作为覆盖率工具）

### 3.2 覆盖率策略

#### 高覆盖率区域（目标 90%+）

- **核心转换引擎**：`public/core/conversion-pipeline.js`
- **文档模型**：`public/core/document-model.js`
- **数据完整性**：`public/core/text-decoding.js`, `public/core/zip-container.js`
- **安全验证**：`public/core/security-validator.js`

#### 标准覆盖率区域（目标 80%+）

- **格式 Reader/Writer**：`public/formats/*.js`
- **格式注册器**：`public/core/format-registry.js`
- **修复引擎**：`public/core/repair-engine.js`

#### 容忍低覆盖率区域（60%+ 可接受）

- **OCR 管线**：依赖外部模型，集成测试为主
- **渐进式预览**：依赖浏览器环境，E2E 测试覆盖
- **第三方适配层**：`public/vendor/` 排除在覆盖率统计外

### 3.3 覆盖率门禁规则

1. **PR 合并要求**：覆盖率不得低于基准线（语句 78%，分支 64%）
2. **新增代码要求**：新增函数必须有对应单元测试
3. **回归修复要求**：每个 bug 修复必须添加回归测试
4. **核心模块增强**：`public/core/` 变更需提高审核等级，覆盖率不得下降

## 4. 测试分类

### 4.1 按测试级别分类

#### 4.1.1 单元测试（Unit Tests）

**定义**：测试单个函数或模块的行为，无外部依赖。

**关键测试文件**：

| 文件 | 测试范围 | 关键场景 |
|-----|---------|---------|
| `r0-p0-data-integrity-test.js` | 数据完整性 | UTF-8 编码、ZIP 解析、DEFLATE 压缩 |
| `format-validation-test.js` | 格式验证 | 文件签名识别、MIME 类型检测 |
| `format-integrity-test.js` | 格式完整性 | 格式注册表、Reader/Writer 完备性 |
| `worker-payload-test.js` | Worker 通信 | 消息序列化、Transferable 对象 |
| `resource-budget-test.js` | 资源预算 | 模块大小、依赖树、预算守护 |

**断言风格**：
```javascript
import assert from "node:assert/strict";

// 值断言
assert.equal(actual, expected, message);
assert.deepEqual(actualObj, expectedObj, message);

// 异常断言
assert.throws(() => riskyCall(), ConversionError);

// 布尔断言
assert.ok(condition, message);
```

#### 4.1.2 集成测试（Integration Tests）

**定义**：测试多个模块协作，验证端到端转换路径。

**关键测试文件**：

| 文件 | 测试范围 | 关键场景 |
|-----|---------|---------|
| `conversion-snapshot-test.js` | 转换快照 | 多格式转换、输出一致性 |
| `conversion-quality-test.js` | 转换质量 | 关键词保留、结构保留、路径温度 |
| `conversion-capability-audit-test.js` | 能力审核 | 路径覆盖、温度标注、降级策略 |
| `smoke-test.js` | 核心冒烟 | 基础格式、DocumentModel、PDF 输出 |
| `ocr-structure-test.js` | OCR 管线 | 文本提取、结构恢复、置信度 |
| `paddle-ocr-integration-test.js` | PP-OCRv5 | 检测模型、识别模型、端到端 |
| `repair-engine-test.js` | 修复引擎 | 损坏检测、自动修复、修复报告 |

**测试数据**：
- **样例目录**：`samples/` 包含真实样例文件
- **测试夹具**：内联生成小型测试数据
- **快照对比**：`tests/snapshots/` 存储基准输出

#### 4.1.3 端到端测试（E2E Tests）

**定义**：测试完整用户场景，涉及浏览器或桌面环境。

**关键测试文件**：

| 文件 | 测试范围 | 关键场景 |
|-----|---------|---------|
| `browser-smoke-test.js` | 浏览器冒烟 | 模块加载、路由、静态资源 |
| `desktop-shell-test.js` | 桌面壳 | Tauri 配置、权限、安装包 |
| `ui-accessibility-test.js` | 可访问性 | 语义 HTML、ARIA、键盘导航 |
| `workbench-queue-test.js` | 任务队列 | 并发转换、进度追踪、取消操作 |

**工具链**：
- **浏览器驱动**：Puppeteer（用于真实浏览器测试）
- **服务器启动**：动态端口分配（49152-49232 范围）
- **超时配置**：E2E 测试超时 30 秒

### 4.2 按优先级分类

#### P0：关键路径（必须通过）

- **数据完整性**：`r0-p0-data-integrity-test.js`
- **服务器加固**：`server-hardening-test.js`
- **核心冒烟**：`smoke-test.js`
- **本地安全**：`local-security-test.js`

**失败影响**：阻断发布，必须立即修复。

#### P1：核心功能（应该通过）

- **转换质量**：`conversion-quality-test.js`
- **格式完整性**：`format-integrity-test.js`
- **浏览器冒烟**：`browser-smoke-test.js`
- **桌面壳**：`desktop-shell-test.js`

**失败影响**：阻断发布，但可临时降级功能后发布。

#### P2：性能与体验（建议通过）

- **响应性**：`p2-responsiveness-test.js`
- **XLSX 写入性能**：`xlsx-writer-performance-test.js`
- **Tesseract 清理**：`tesseract-worker-cleanup-test.js`
- **模型缓存**：`model-cache-test.js`

**失败影响**：记录问题，不阻断发布。

#### P4/P5/P6：增强功能（可选通过）

- **懒加载资产**：`p4-p5-p6-test.js`
- **OCR 基准**：`ocr-baseline-test.js`
- **LaTeX 数学**：`latex-math-test.js`
- **SSIM 验证**：`ssim-verification-test.js`

**失败影响**：不影响发布。

#### P7：发布准备（发布前检查）

- **发布产品化**：`p7-release-productization-test.js`
- **发布准备度**：`release-readiness-test.js`
- **产品矩阵文档**：`product-matrix-docs-test.js`

**失败影响**：阻断发布，检查文档和资产完整性。

## 5. 关键测试场景

### 5.1 数据完整性测试（R0-P0）

**目标**：确保转换过程不丢失或损坏数据。

**测试场景**：
1. **UTF-8 编码保留**：
   - 组合字符（`café`）和预组合字符（`café`）精确保留
   - 多语言文本（法语、瑞典语、中文）无替换字符
   
2. **ZIP 容器解析**：
   - DEFLATE 压缩/解压缩正确性
   - 中央目录解析
   - Data Descriptor 处理
   - ZIP64 扩展支持
   
3. **二进制安全**：
   - Base64 编码/解码
   - 图像数据完整性
   - PDF 二进制流

**验证方法**：
```javascript
// 文本编码往返测试
const encoded = encoder.encode(originalText);
const { text, encoding, hadReplacement } = decodeTextBytes(encoded, { fileName, mime });
assert.equal(text, originalText);
assert.equal(hadReplacement, false);

// ZIP 完整性测试
const zipBytes = createZipArchive(entries);
const extracted = readZipEntries(zipBytes);
assert.deepEqual(extracted, entries);
```

### 5.2 格式转换质量测试

**目标**：验证关键转换路径的输出质量。

**测试矩阵**：

| 输入格式 | 输出格式 | 路径温度 | 关键指标 |
|---------|---------|---------|---------|
| Markdown | HTML | Hot | 100% 关键词保留，结构完整 |
| Markdown | PDF | Hot | 排版正确，字体嵌入 |
| HTML | Markdown | Hot | 语义保留，链接正确 |
| DOCX | Markdown | Warm | 文本提取，基础样式 |
| PDF | Markdown | Warm | 文本提取，OCR 可选 |
| XLSX | CSV | Hot | 数据精度，引号转义 |

**质量指标**：
1. **关键词保留率**：核心关键词在输出中出现比例 > 95%
2. **结构保留率**：heading/list/table/code 数量一致性 > 90%
3. **路径温度一致性**：声明为 hot 的路径不得抛错
4. **输出体积合理性**：10 bytes < 输出 < 50 MB

**测试代码示例**：
```javascript
// 关键词保留测试
const keywords = ["中文样例", "第一项", "第二项"];
const output = convertContent({ content: input, from: "md", to: "html" });
const keywordHits = keywords.filter(kw => output.content.includes(kw));
const preservationRate = keywordHits.length / keywords.length;
assert.ok(preservationRate > 0.95, `关键词保留率过低: ${preservationRate}`);

// 结构保留测试
const inputModel = toDocumentModel({ content: input, from: "md" });
const outputModel = toDocumentModel({ content: output.content, from: "html" });
const inputTables = inputModel.blocks.filter(b => b.type === "table").length;
const outputTables = outputModel.blocks.filter(b => b.type === "table").length;
assert.equal(inputTables, outputTables, "表格数量应保持一致");
```

### 5.3 安全测试

**目标**：防止恶意输入导致的安全问题。

**测试场景**：
1. **ZIP Bomb 防护**：
   - 解压前检查压缩比（< 1000:1）
   - 限制单文件解压大小（< 500 MB）
   - 限制总解压大小（< 1 GB）

2. **路径遍历防护**：
   - 拒绝包含 `../` 的 ZIP 条目
   - 拒绝绝对路径条目
   - 拒绝符号链接

3. **XML 外部实体注入（XXE）防护**：
   - 禁用外部实体解析
   - 禁用 DTD 处理
   - 限制实体扩展深度

4. **服务器加固**：
   - MIME 类型嗅探防护
   - 内容安全策略（CSP）
   - 路径遍历防护（静态文件服务）

**测试代码示例**：
```javascript
// ZIP Bomb 检测
const zipBomb = createHighCompressionZip(1000000, 1000); // 1MB → 1GB
assert.throws(() => readZipEntries(zipBomb), /compression ratio/);

// 路径遍历防护
const maliciousZip = createZipWithEntry("../../../etc/passwd", "data");
assert.throws(() => readZipEntries(maliciousZip), /path traversal/);
```

### 5.4 性能测试

**目标**：确保关键操作满足性能预算。

**性能基准**：

| 操作 | 输入规模 | 目标时间 | 测试文件 |
|-----|---------|---------|---------|
| Markdown → HTML | 100 KB | < 100 ms | `p2-responsiveness-test.js` |
| 大文本转换 | 10 MB | < 5 秒 | `p2-responsiveness-test.js` |
| XLSX 写入 | 10,000 行 | < 1 秒 | `xlsx-writer-performance-test.js` |
| PDF 渲染 | 10 页 | < 3 秒 | `conversion-quality-test.js` |
| OCR 文本提取 | 1 页图片 | < 10 秒 | `ocr-baseline-test.js` |

**测试代码示例**：
```javascript
// 性能基准测试
const largeText = "x".repeat(10 * 1024 * 1024); // 10 MB
const startTime = Date.now();
const result = convertContent({ content: largeText, from: "txt", to: "md" });
const elapsed = Date.now() - startTime;
assert.ok(elapsed < 5000, `10MB 文本转换超时: ${elapsed}ms`);
console.log(`✅ 10MB 文本转换完成: ${elapsed}ms`);
```

### 5.5 OCR 测试

**目标**：验证光学字符识别管线的准确性和鲁棒性。

**测试场景**：
1. **Tesseract.js 基准**：
   - 英文文本识别准确率 > 90%
   - 中文文本识别准确率 > 80%
   - Worker 生命周期管理（创建、复用、清理）

2. **PP-OCRv5 集成**：
   - 检测模型：定位文本区域
   - 识别模型：提取文本内容
   - 端到端管线：检测 → 识别 → 结构化

3. **OCR 结构恢复**：
   - 段落检测
   - 阅读顺序排序
   - 多列布局处理

**测试文件**：
- `ocr-baseline-test.js`：Tesseract.js 基准测试
- `paddle-ocr-integration-test.js`：PP-OCRv5 集成测试
- `paddle-ocr-pipeline-test.js`：检测+识别管线测试
- `ocr-structure-test.js`：结构恢复测试
- `ocr-readback-test.js`：OCR 回读验证
- `tesseract-worker-cleanup-test.js`：Worker 资源清理测试

### 5.6 桌面应用测试

**目标**：验证 Tauri 桌面壳的功能和配置。

**测试场景**：
1. **Tauri 配置验证**：
   - `tauri.conf.json` 结构正确
   - 权限配置完整（文件系统、对话框）
   - 窗口配置合理

2. **桌面功能**：
   - 文件拖放支持
   - 原生文件选择器
   - 系统托盘集成

3. **打包验证**：
   - 安装包生成
   - 代码签名
   - 自动更新配置

**测试文件**：`desktop-shell-test.js`

## 6. 测试数据管理

### 6.1 测试数据分类

| 数据类型 | 存储位置 | 生成方式 | 版本控制 |
|---------|---------|---------|---------|
| **样例文件** | `samples/` | 手工创建 | ✅ Git 跟踪 |
| **测试夹具** | 内联代码 | 程序生成 | ✅ 代码即文档 |
| **快照基准** | `tests/snapshots/` | 首次运行生成 | ✅ Git 跟踪 |
| **大型资产** | 外部下载 | `npm run vendor:*` | ❌ Git 忽略 |

### 6.2 样例文件管理

**目录结构**：
```
samples/
├── md/           # Markdown 样例
│   ├── chinese.md
│   ├── table-code.md
│   └── image-link.md
├── html/         # HTML 样例
├── txt/          # 纯文本样例
├── json/         # JSON 样例
├── csv/          # CSV 样例
├── xml/          # XML 样例
└── png/          # 图片样例（Data URL 格式）
```

**样例文件原则**：
1. **最小可复现**：每个样例文件聚焦一个特性
2. **多语言覆盖**：中文、英文、特殊字符
3. **边界条件**：空文件、超大文件、损坏文件
4. **真实数据**：使用真实场景的简化版本

### 6.3 测试夹具生成

**内联生成示例**：
```javascript
// 最小 PDF 生成器
function createMinimalPdf(body = "BT (Test) Tj ET") {
  return `%PDF-1.4\n1 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n%%EOF`;
}

// 最小 ZIP 生成器
function createMinimalZip(entries) {
  const chunks = [];
  for (const { name, content } of entries) {
    const compressed = deflateRawSync(encoder.encode(content));
    chunks.push(createZipLocalFileHeader(name, compressed));
    chunks.push(compressed);
  }
  chunks.push(createZipCentralDirectory(entries));
  return concatBytes(chunks);
}
```

**优势**：
- 无外部文件依赖
- 测试代码自包含
- 易于参数化和边界测试

### 6.4 快照测试

**快照文件位置**：`tests/snapshots/`

**快照更新命令**：
```bash
# 更新所有快照（需手工审核变更）
UPDATE_SNAPSHOTS=1 npm test
```

**快照对比策略**：
1. **结构对比**：DocumentModel 的块类型和数量
2. **内容对比**：关键文本的存在性（不比较格式细节）
3. **容忍度**：允许微小的空白差异（CRLF vs LF）

### 6.5 外部资产管理

**大型依赖**：
- **PDF.js**：`npm run vendor:pdfjs`（~10 MB）
- **Tesseract.js**：`npm run vendor:tesseract`（~2 MB + 语言数据）
- **ONNX Runtime**：`npm run vendor:onnx`（~8 MB）
- **PaddleOCR 模型**：`npm run vendor:paddle`（~40 MB）

**CI/CD 策略**：
- 外部资产不纳入 Git 仓库
- CI 环境首次运行时下载
- 本地开发按需下载

## 7. CI/CD 集成

### 7.1 GitHub Actions 工作流

**测试触发条件**：
- ✅ 每次 push 到任意分支
- ✅ 每次 pull request
- ✅ 定时回归测试（每日 UTC 00:00）

**工作流配置**：
```yaml
name: Test Suite

on:
  push:
    branches: ['*']
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # 每日回归

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests with coverage
        run: npm run coverage
      
      - name: Check coverage thresholds
        run: |
          # .c8rc 定义的门槛会自动检查
          # 不通过则退出码非零，阻断 CI
      
      - name: Upload coverage to Codecov (optional)
        uses: codecov/codecov-action@v3
        if: always()
```

### 7.2 本地开发流程

**开发前**：
```bash
# 确保依赖最新
npm install

# 下载外部资产（首次或版本更新后）
npm run vendor:pdfjs
npm run vendor:tesseract
```

**开发中**：
```bash
# 运行单个测试（快速验证）
node scripts/smoke-test.js

# 运行完整测试套件
npm test

# 运行测试并生成覆盖率报告
npm run coverage
```

**提交前**：
```bash
# 完整测试 + 覆盖率检查
npm run coverage

# 如果覆盖率不达标，CI 会拒绝
# 新增代码必须添加对应测试
```

### 7.3 测试失败处理

**失败分类**：

| 失败类型 | 响应动作 | 示例 |
|---------|---------|------|
| **P0 失败** | 立即修复，阻断发布 | 数据损坏、安全漏洞 |
| **P1 失败** | 当天修复，或降级功能 | 转换质量回归、浏览器兼容性 |
| **P2 失败** | 记录 issue，计划修复 | 性能回归、资源泄漏 |
| **P4-P7 失败** | 评估影响，可选修复 | 增强功能、文档缺失 |

**调试策略**：
1. **查看失败日志**：CI 提供完整输出
2. **本地复现**：使用相同 Node 版本和依赖
3. **隔离测试**：单独运行失败的测试脚本
4. **增加日志**：在测试代码中添加 `console.log` 诊断
5. **快照对比**：使用 `git diff tests/snapshots/` 查看变更

### 7.4 覆盖率趋势追踪

**追踪指标**：
- 每次 PR 的覆盖率变化（Δ%）
- 未覆盖的关键函数列表
- 低覆盖率模块热力图

**工具**：
- **c8**：生成覆盖率报告（文本摘要、HTML 详情）
- **Codecov**（可选）：可视化覆盖率趋势
- **自定义脚本**：提取关键模块覆盖率

**报告示例**：
```
=============================== Coverage summary ===============================
Statements   : 81.38% ( 12824/15757 )
Branches     : 71.95% ( 3220/4475 )
Functions    : 85.56% ( 658/769 )
Lines        : 81.38% ( 12824/15757 )
================================================================================
```

## 8. 测试最佳实践

### 8.1 编写测试的原则

1. **测试行为，不是实现**：
   - ✅ 验证输出是否符合预期
   - ❌ 验证内部函数调用次数

2. **测试应该独立**：
   - ✅ 每个测试可单独运行
   - ❌ 测试之间共享状态

3. **测试应该快速**：
   - ✅ 单元测试 < 100ms
   - ❌ 每个测试都启动浏览器

4. **测试应该稳定**：
   - ✅ 100 次运行 100 次通过
   - ❌ 依赖网络、时间、随机数

5. **失败消息应该清晰**：
   - ✅ `assert.equal(actual, expected, "关键词保留率过低: 0.85")`
   - ❌ `assert.ok(condition)`

### 8.2 测试命名约定

**文件命名**：
- 单元测试：`{feature}-test.js`（如 `format-validation-test.js`）
- 集成测试：`{scenario}-test.js`（如 `conversion-quality-test.js`）
- E2E 测试：`{flow}-test.js`（如 `browser-smoke-test.js`）
- 优先级前缀：`{priority}-{name}-test.js`（如 `p2-responsiveness-test.js`）

**测试函数命名**：
```javascript
// ✅ 描述性命名
test("should preserve UTF-8 combining characters", () => { ... });
test("should reject ZIP with path traversal", () => { ... });

// ❌ 模糊命名
test("test1", () => { ... });
test("edge case", () => { ... });
```

### 8.3 断言风格指南

**使用 strict 模式**：
```javascript
import assert from "node:assert/strict";
```

**常用断言**：
```javascript
// 值相等（使用 === 比较）
assert.equal(actual, expected, message);

// 深度相等（递归比较对象）
assert.deepEqual(actualObj, expectedObj, message);

// 布尔断言
assert.ok(condition, message);
assert.equal(condition, true, message); // 等价但更明确

// 异常断言
assert.throws(() => riskyCall(), ExpectedError);
assert.throws(() => riskyCall(), /error message pattern/);

// 异步断言
await assert.doesNotReject(asyncCall());
await assert.rejects(asyncCall(), ExpectedError);
```

### 8.4 Mock 和 Stub 策略

**原则**：尽量使用真实依赖，仅在必要时 mock。

**需要 mock 的场景**：
1. **外部 API 调用**：网络请求、数据库查询
2. **浏览器 API**：`window`, `document`, `fetch`（Node 环境不可用）
3. **文件系统**：避免测试污染真实文件
4. **时间依赖**：避免测试不稳定

**不需要 mock 的场景**：
1. **纯函数**：直接调用，验证输出
2. **轻量级依赖**：如 `zlib`, `crypto`
3. **内部模块**：集成测试应使用真实模块

### 8.5 性能测试指南

**基准测试模板**：
```javascript
const iterations = 100;
const times = [];

for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  performOperation();
  const end = performance.now();
  times.push(end - start);
}

const avgTime = times.reduce((a, b) => a + b) / times.length;
const p95Time = times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

console.log(`平均耗时: ${avgTime.toFixed(2)}ms`);
console.log(`P95 耗时: ${p95Time.toFixed(2)}ms`);

assert.ok(p95Time < TARGET_TIME, `性能回归: ${p95Time}ms > ${TARGET_TIME}ms`);
```

### 8.6 测试维护指南

**何时更新测试**：
1. **功能变更**：修改实现后，同步更新测试
2. **Bug 修复**：添加回归测试，防止重复
3. **性能优化**：更新性能基准
4. **API 重构**：更新测试以匹配新 API

**测试删除原则**：
1. **功能移除**：删除对应测试
2. **冗余测试**：合并重复的测试场景
3. **过时测试**：删除不再相关的测试

**测试重构触发点**：
1. 测试代码重复度高
2. 测试失败难以定位问题
3. 测试运行时间过长
4. 测试频繁误报

## 9. 测试工具链

### 9.1 核心工具

| 工具 | 用途 | 版本 |
|-----|------|------|
| **Node.js** | 测试运行时 | 20.x LTS |
| **node:assert/strict** | 断言库 | 内置 |
| **c8** | 覆盖率工具 | ^11.0.0 |
| **Puppeteer** | 浏览器自动化 | ^25.1.0 |

### 9.2 可选工具

| 工具 | 用途 | 场景 |
|-----|------|------|
| **onnxruntime-node** | PP-OCRv5 测试 | 开发环境，CI 可选 |
| **pngjs** | 图像测试 | OCR 基准测试 |
| **Codecov** | 覆盖率可视化 | 开源项目 |

### 9.3 测试命令速查

```bash
# 运行完整测试套件
npm test

# 运行测试并生成覆盖率
npm run coverage

# 运行单个测试脚本
node scripts/smoke-test.js

# 更新快照基准
UPDATE_SNAPSHOTS=1 npm test

# 下载外部资产
npm run vendor:pdfjs
npm run vendor:tesseract
npm run vendor:onnx
npm run vendor:paddle
```

## 10. 附录

### 10.1 测试文件清单

| 文件 | 类型 | 优先级 | 描述 |
|-----|------|--------|------|
| `r0-p0-data-integrity-test.js` | 单元 | P0 | UTF-8、ZIP、DEFLATE 完整性 |
| `server-hardening-test.js` | 单元 | P0 | 服务器安全加固 |
| `smoke-test.js` | 集成 | P0 | 核心转换路径冒烟 |
| `local-security-test.js` | 单元 | P0 | 本地安全策略 |
| `conversion-snapshot-test.js` | 集成 | P1 | 转换输出快照对比 |
| `conversion-quality-test.js` | 集成 | P1 | 转换质量指标验证 |
| `conversion-capability-audit-test.js` | 集成 | P1 | 能力注册表审核 |
| `format-integrity-test.js` | 单元 | P1 | 格式注册表完整性 |
| `format-validation-test.js` | 单元 | P1 | 文件签名和 MIME 检测 |
| `worker-payload-test.js` | 单元 | P1 | Worker 消息序列化 |
| `browser-smoke-test.js` | E2E | P1 | 浏览器模块加载和路由 |
| `workbench-queue-test.js` | 集成 | P1 | 任务队列管理 |
| `ui-accessibility-test.js` | E2E | P1 | 可访问性检查 |
| `desktop-shell-test.js` | E2E | P1 | Tauri 桌面配置 |
| `p2-responsiveness-test.js` | 性能 | P2 | 响应性和性能基准 |
| `resource-budget-test.js` | 单元 | P2 | 资源预算守护 |
| `model-cache-test.js` | 集成 | P2 | 模型缓存策略 |
| `tesseract-worker-cleanup-test.js` | 集成 | P2 | Tesseract Worker 清理 |
| `xlsx-writer-performance-test.js` | 性能 | P2 | XLSX 写入性能 |
| `repair-engine-test.js` | 集成 | P2 | 文档修复引擎 |
| `rule-diff-test.js` | 单元 | P2 | 修复规则差异检测 |
| `p4-p5-p6-test.js` | 集成 | P4 | 懒加载和增强输出 |
| `ocr-baseline-test.js` | 集成 | P4 | Tesseract OCR 基准 |
| `ocr-readback-test.js` | 集成 | P4 | OCR 回读验证 |
| `ocr-structure-test.js` | 集成 | P4 | OCR 结构恢复 |
| `paddle-ocr-pipeline-test.js` | 集成 | P4 | PP-OCRv5 管线测试 |
| `paddle-ocr-integration-test.js` | 集成 | P4 | PP-OCRv5 端到端 |
| `latex-math-test.js` | 集成 | P4 | LaTeX 数学公式 |
| `ssim-verification-test.js` | 集成 | P5 | 结构相似度验证 |
| `sample-corpus-test.js` | 集成 | P6 | 样例语料库验证 |
| `local-model-direction-test.js` | 集成 | P6 | 本地模型方向检测 |
| `pdf-reader-test.js` | 单元 | P1 | PDF reader 边界测试 |
| `p7-release-productization-test.js` | 集成 | P7 | 发布产品化检查 |
| `release-readiness-test.js` | 集成 | P7 | 发布准备度验证 |
| `product-matrix-docs-test.js` | 集成 | P7 | 产品矩阵文档检查 |

**总计**：35 个测试文件

### 10.2 覆盖率配置（.c8rc）

```json
{
  "include": ["public/**/*.js"],
  "exclude": ["public/vendor/**"],
  "reporter": ["text-summary"],
  "check-coverage": true,
  "statements": 78,
  "lines": 78,
  "functions": 80,
  "branches": 64,
  "clean": true
}
```

### 10.3 相关文档

- [CLAUDE.md](CLAUDE.md)：AI 协作入口和模块化约束
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献指南和开发规范
- [COMMIT_CHECKLIST.md](COMMIT_CHECKLIST.md)：提交前检查清单
- [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)：安全策略和测试要求
- [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md)：资源预算和性能目标

### 10.4 更新日志

| 日期 | 版本 | 变更说明 |
|------|------|---------|
| 2026-06-23 | v1.0.0 | 初始版本，基于 35 个测试文件和 81.38% 覆盖率基准 |

---

**维护责任**：Trans2Former 团队  
**审核周期**：每季度或重大功能发布前  
**反馈渠道**：GitHub Issues 或 Pull Requests

