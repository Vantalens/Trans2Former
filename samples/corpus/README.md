# Trans2Former Corpus - 样例库索引

版本: 1.0.0  
创建日期: 2026-06-23  
维护: Claude Code + Jack Yao

---

## 1. 概述

Trans2Former 样例库（Corpus）是项目的核心测试数据集，覆盖 14 种输入格式、11 种输出格式的转换场景。样例库按照测试目的分层组织，既支持回归测试，也支持性能基准测试和边界场景验证。

**设计原则**：
- **分层清晰**：basic（基础）→ complex（复杂）→ edge-cases（边界）→ real-world（真实）→ benchmark（基准）
- **可复现**：程序化生成（`npm run samples:generate`），避免版权问题
- **可追溯**：每个样例在 MANIFEST.json 中登记来源、格式、层级、大小
- **版权清晰**：公开样例标注许可证，第三方来源登记授权和来源

---

## 2. 目录结构

```
samples/
├── corpus/                          # 样例库索引（本文件）
│   └── README.md
├── basic/                           # 基础格式和最小结构
│   ├── md/                          # Markdown 基础样例
│   ├── html/                        # HTML 基础样例
│   ├── txt/                         # 纯文本样例
│   ├── json/                        # JSON 数据样例
│   ├── csv/                         # CSV 表格样例
│   ├── xml/                         # XML 数据样例
│   └── png/                         # 图片样例（OCR）
├── complex/                         # 复杂排版和嵌套结构
│   ├── multi-level-headings.md      # 多级标题
│   ├── complex-table.md             # 复杂表格（合并单元格、对齐）
│   ├── code-examples.md             # 多语言代码块
│   ├── math-formulas.md             # LaTeX 数学公式
│   ├── formatted-text.md            # 丰富格式（粗体、斜体、删除线等）
│   └── meeting-minutes.md           # 真实场景：会议纪要
├── edge-cases/                      # 边界场景和异常处理
│   ├── empty-file.txt               # 空文件
│   ├── large-table.csv              # 大型表格（1000+ 行）
│   ├── long-lines.txt               # 超长行（10000+ 字符）
│   ├── special-chars.md             # 特殊字符、emoji、实体
│   ├── rtl-text.md                  # 从右到左文本（RTL）
│   ├── chinese.md                   # CJK 字符
│   └── namespace.xml                # XML 命名空间
├── real-world/                      # 真实场景样例
│   ├── api-documentation.md         # API 文档
│   ├── requirements-document.md     # 需求文档
│   ├── meeting-minutes.md           # 会议纪要
│   └── project-report.md            # 项目报告
├── benchmark/                       # 性能基准测试
│   ├── small/                       # 小文件（KB 级）
│   ├── medium/                      # 中等文件（百 KB 级）
│   └── large/                       # 大文件（≥ 3 MB）
├── generated/                       # 程序化生成样例（gitignore）
│   ├── small/                       # 小文件集合
│   ├── medium/                      # 中等文件集合
│   ├── large/                       # 大文件集合
│   └── MANIFEST.json                # 生成样例清单
├── fixtures/                        # 测试夹具索引
│   └── README.md                    # P4 fixture 分层索引
└── [format]/                        # 按格式组织的现有样例（向后兼容）
    ├── md/                          # Markdown 样例
    ├── html/                        # HTML 样例
    ├── csv/                         # CSV 样例
    ├── json/                        # JSON 样例
    ├── xml/                         # XML 样例
    ├── txt/                         # 文本样例
    ├── png/                         # 图片样例
    ├── ocr/                         # OCR 专用样例
    └── ofd/                         # OFD 格式样例
```

**说明**：
- `basic/`、`complex/`、`edge-cases/`、`real-world/`、`benchmark/` 是**逻辑分层**
- 当前样例已按格式组织在 `md/`、`html/` 等目录下，可通过符号链接或索引映射到逻辑分层
- `generated/` 由 `npm run samples:generate` 生成，不入 git
- `fixtures/` 保留现有 P4 fixture 分层索引

---

## 3. 分层说明

### 3.1 Basic（基础）

**目的**：验证最小可工作实现，覆盖每种格式的基本读写能力。

**内容特征**：
- 单一格式特性（如纯文本、单行 CSV、简单 JSON）
- 最小结构（1-2 个段落、1 个表格、1 个列表）
- 无嵌套、无边界情况
- 文件大小：< 5 KB

**现有样例映射**：
- Markdown: `samples/md/chinese.md`（119B）、`samples/md/image-link.md`（133B）
- HTML: `samples/html/`（待整理）
- CSV: `samples/csv/`（待整理）
- JSON: `samples/json/`（待整理）
- XML: `samples/xml/`（待整理）
- TXT: `samples/txt/`（待整理）
- PNG: `samples/png/tiny-red.data-url.txt`（35B）

**测试用途**：
- 快速验证格式读写器基本功能
- 单元测试的最小输入
- CI/CD 快速烟雾测试

### 3.2 Complex（复杂）

**目的**：验证复杂排版、嵌套结构、格式组合的处理能力。

**内容特征**：
- 多级嵌套（列表中的表格、引用中的代码块）
- 复杂表格（合并单元格、多行表头、对齐）
- 丰富格式（粗体、斜体、删除线、下划线、高亮）
- 多语言代码块、LaTeX 数学公式
- 文件大小：5-50 KB

**现有样例映射**：
- `samples/md/multi-level-headings.md`（611B）
- `samples/md/complex-table.md`（950B）
- `samples/md/formatted-text.md`（1148B）
- `samples/md/code-examples.md`（3340B）
- `samples/md/math-formulas.md`（746B）

**测试用途**：
- 集成测试：验证模块协作
- 转换质量测试：SSIM、OCR 回读、规则 diff
- UI 预览测试：渲染正确性

### 3.3 Edge Cases（边界场景）

**目的**：验证异常输入、极端情况、错误处理的健壮性。

**内容特征**：
- 空文件、超长行、超大表格
- 特殊字符（emoji、实体、控制字符）
- 非标准格式（malformed JSON、缺失闭合标签）
- 边界条件（UTF-8 BOM、CRLF vs LF、尾随空白）
- 文件大小：变化大（0 B 到 MB 级）

**现有样例映射**：
- `samples/md/rtl-text.md`（887B，RTL 文本）
- `samples/md/chinese.md`（119B，CJK）
- `samples/txt/long-lines.txt`（超长行）
- `samples/xml/namespace.xml`（命名空间）
- `samples/png/tiny-*.data-url.txt`（最小图片）

**测试用途**：
- 健壮性测试：异常处理、错误恢复
- 安全测试：XSS、路径遍历、注入
- 兼容性测试：跨平台、跨浏览器

### 3.4 Real World（真实场景）

**目的**：验证实际用户场景的端到端转换质量。

**内容特征**：
- 真实文档结构（API 文档、需求文档、会议纪要）
- 混合内容（文本 + 表格 + 代码 + 图片）
- 典型长度（10-100 KB）
- 实际用例（技术文档、项目报告、数据分析）

**现有样例映射**：
- `samples/md/api-documentation.md`（1120B）
- `samples/md/requirements-document.md`（3007B）
- `samples/md/meeting-minutes.md`（2178B）

**测试用途**：
- E2E 测试：完整转换流程
- 用户验收测试：转换质量评估
- 性能测试：真实负载下的响应时间

### 3.5 Benchmark（性能基准）

**目的**：验证大文件处理能力、内存使用、响应时间。

**内容特征**：
- **Small**: < 50 KB（快速回归测试）
- **Medium**: 50 KB - 1 MB（常规负载）
- **Large**: ≥ 3 MB（压力测试，文本类 3MB+，docx/pdf/xlsx 经 writer 放大到 4-20 MB）
- 程序化生成：确定性、可重复、覆盖全部格式

**现有样例映射**：
- `samples/generated/small/`（程序化生成，KB 级）
- `samples/generated/medium/`（程序化生成，百 KB 级）
- `samples/generated/large/`（程序化生成，≥ 3 MB）

**生成命令**：
```bash
npm run samples:generate                       # 生成全部层级
node scripts/generate-samples.js --tiers small # 只生成 small
node scripts/generate-samples.js --out tmp/dir # 自定义输出目录
```

**测试用途**：
- 性能基准测试：转换时间、内存峰值
- 资源预算测试：目录大小限制
- 渐进预览测试：大文件流式处理

---

## 4. 格式覆盖矩阵

| 格式 | Basic | Complex | Edge Cases | Real World | Benchmark | 说明 |
| --- | :---: | :---: | :---: | :---: | :---: | --- |
| **Markdown** | ✅ | ✅ | ✅ | ✅ | ✅ | 完整覆盖 |
| **HTML** | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | 需补充 complex/edge/real-world |
| **TXT** | ✅ | N/A | ✅ | ⚠️ | ✅ | 需补充 real-world |
| **JSON** | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | 需补充 complex/edge/real-world |
| **CSV** | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | 需补充 complex/edge/real-world |
| **XML** | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | 需补充 complex/real-world |
| **DOCX** | — | — | — | — | ✅ | 仅程序化生成（benchmark） |
| **XLSX** | — | — | — | — | ✅ | 仅程序化生成（benchmark） |
| **PDF** | — | — | — | — | ✅ | 仅程序化生成（benchmark） |
| **EPUB** | — | — | — | — | ✅ | 仅程序化生成（benchmark） |
| **PPTX** | — | — | — | — | ✅ | 仅程序化生成（benchmark） |
| **PNG** | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | OCR 专用，需补充 complex/real-world/benchmark |
| **DOC** | — | — | — | — | — | 无 writer，reader best-effort |
| **OFD** | ⚠️ | — | — | — | — | L0 级容器解析，战略攻坚格式 |

**图例**：
- ✅ 已覆盖
- ⚠️ 部分覆盖，需补充
- — 不适用或计划中
- N/A 格式特性不支持该分层

---

## 5. 程序化生成（`npm run samples:generate`）

### 5.1 生成内容特征

为压力测试转换、版面与三层检验能力，`scripts/generate-samples.js` 程序化产出覆盖全部受支持格式、复杂排版、大小不一的样例到 `samples/generated/`（已 gitignore，不入库）。

**内容复杂度**：
- 多级标题（H1-H6）
- 嵌套列表（有序、无序、任务列表）
- 对齐表格（左对齐、居中、右对齐）
- 多语言代码块（JavaScript、Python、Rust、Go、Java、C++）
- 嵌套引用、脚注、图片
- CJK/RTL/emoji/实体/特殊字符

**大小分层**：
- **Small**: < 50 KB（KB 级，适合快速回归测试）
- **Medium**: 50 KB - 1 MB（百 KB 级，常规负载）
- **Large**: ≥ 3 MB（文本类 3MB+，docx/pdf/xlsx/epub 经 writer 放大到 4-20 MB）

**格式覆盖**：
- 直接产出：md / html / txt / json / xml / csv
- 经项目 writer 产出：docx / pptx / epub / pdf / xlsx
- 经编码器产出：png（`scripts/lib/png-encode.js`）

**覆盖缺口**：
- `doc`（无 writer，reader best-effort）
- `ofd`（无 writer，reader L0）
- 在 `MANIFEST.json.coverageGaps` 登记，待 OFD 攻坚补齐

### 5.2 生成命令

```bash
# 生成全部层级（small + medium + large）
npm run samples:generate

# 只生成指定层级
node scripts/generate-samples.js --tiers small
node scripts/generate-samples.js --tiers small,medium

# 自定义输出目录
node scripts/generate-samples.js --out tmp/custom-samples

# 查看帮助
node scripts/generate-samples.js --help
```

**注意**：
- 每次运行会清空并重建输出目录
- `MANIFEST.json` 登记每个文件的格式、层级、字节数与来源
- `samples/generated/` 已加入 `.gitignore`，不入库

### 5.3 复用与测试

**内容构建器**：
- 位置：`scripts/lib/sample-content.js`
- 特性：纯函数、确定性、可配置大小和复杂度
- 用途：统一的内容生成逻辑，避免重复

**回归测试**：
- 测试脚本：`scripts/sample-corpus-test.js`
- 覆盖范围：small scale 跨格式可读性回归
- 纳入套件：`npm test`（不写 3MB 大文件，避免拖慢 CI）

---

## 6. 样例使用指南

### 6.1 单元测试

使用 **basic** 样例验证单个格式读写器的最小功能：

```javascript
// 示例：测试 Markdown reader
import { readMarkdown } from './public/formats/markdown-input.js';
import fs from 'fs';

const basicMd = fs.readFileSync('samples/md/chinese.md', 'utf-8');
const doc = readMarkdown(basicMd);
assert(doc.blocks.length > 0, 'Should parse at least one block');
```

### 6.2 集成测试

使用 **complex** 样例验证模块协作和转换管道：

```javascript
// 示例：测试 Markdown → HTML 转换
import { convert } from './public/core/conversion-pipeline.js';
import fs from 'fs';

const complexMd = fs.readFileSync('samples/md/complex-table.md', 'utf-8');
const result = await convert(complexMd, 'markdown', 'html');
assert(result.output.includes('<table>'), 'Should convert table to HTML');
```

### 6.3 E2E 测试

使用 **real-world** 样例验证完整的用户操作流程：

```javascript
// 示例：使用 Puppeteer 测试上传 → 转换 → 下载
import puppeteer from 'puppeteer';
import fs from 'fs';

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000');

// 上传真实文档
const fileInput = await page.$('input[type="file"]');
await fileInput.uploadFile('samples/md/api-documentation.md');

// 选择输出格式并转换
await page.select('#output-format', 'html');
await page.click('#convert-button');

// 等待转换完成并下载
await page.waitForSelector('.download-button');
const downloadPath = await page.evaluate(() => {
  return document.querySelector('.download-button').href;
});
assert(downloadPath.includes('blob:'), 'Should generate download link');

await browser.close();
```

### 6.4 性能测试

使用 **benchmark** 样例验证大文件处理能力：

```javascript
// 示例：测试大文件转换性能
import { convert } from './public/core/conversion-pipeline.js';
import fs from 'fs';

const largeMd = fs.readFileSync('samples/generated/large/md-large.md', 'utf-8');
console.log(`File size: ${largeMd.length} bytes`);

const startTime = Date.now();
const result = await convert(largeMd, 'markdown', 'html');
const duration = Date.now() - startTime;

console.log(`Conversion time: ${duration}ms`);
assert(duration < 5000, 'Should convert large file within 5 seconds');
```

### 6.5 边界测试

使用 **edge-cases** 样例验证健壮性和错误处理：

```javascript
// 示例：测试空文件处理
import { readText } from './public/formats/txt-input.js';

const emptyTxt = '';
const doc = readText(emptyTxt);
assert(doc.blocks.length === 0, 'Should handle empty file gracefully');
```

---

## 7. 样例维护规则

### 7.1 添加新样例

**步骤**：
1. 确定样例的分层（basic/complex/edge-cases/real-world/benchmark）
2. 确定样例的格式和内容特征
3. 创建样例文件，命名清晰（如 `samples/md/nested-lists.md`）
4. 更新本文档的分层说明和格式覆盖矩阵
5. 如果是第三方来源，在 `samples/fixtures/README.md` 登记来源和许可证
6. 创建对应的测试用例引用新样例

**命名规范**：
- 使用小写字母和连字符（kebab-case）
- 名称说明内容特征（如 `complex-table.md`、`long-lines.txt`）
- 避免版本号或日期（如 `sample-v2.md`、`test-2026.json`）

**版权和许可**：
- 自创样例：标注为 MIT 许可，与项目一致
- 第三方样例：在文件头部或 README 中标注来源和许可证
- 不确定版权的样例：不要添加到仓库，使用程序化生成替代

### 7.2 修改现有样例

**原则**：
- 保持向后兼容：不要破坏现有测试
- 版本控制：重大修改时创建新样例，保留旧版本
- 通知相关方：修改会影响测试的样例需通知团队

**步骤**：
1. 确认修改原因和影响范围
2. 搜索引用该样例的测试用例（`grep -r "sample-name" scripts/`）
3. 修改样例文件
4. 更新所有相关测试用例
5. 运行完整测试套件验证（`npm test`）
6. 更新本文档的变更记录

### 7.3 删除过时样例

**条件**：
- 样例不再被任何测试引用
- 样例的测试目的已被其他样例覆盖
- 样例存在版权问题

**步骤**：
1. 确认样例未被引用（`grep -r "sample-name" scripts/`）
2. 在 git 中删除样例文件
3. 更新本文档和 `samples/fixtures/README.md`
4. 在变更记录中说明删除原因

---

## 8. 测试脚本与样例映射

| 测试脚本 | 使用的样例层级 | 说明 |
| --- | --- | --- |
| `sample-corpus-test.js` | basic, complex | 跨格式可读性回归 |
| `conversion-snapshot-test.js` | basic, complex | 转换快照测试 |
| `format-integrity-test.js` | basic, edge-cases | 格式完整性验证 |
| `conversion-quality-test.js` | complex, real-world | 转换质量（SSIM、OCR 回读） |
| `p2-responsiveness-test.js` | benchmark (large) | 大文件响应时间 |
| `resource-budget-test.js` | benchmark | 目录大小限制 |
| `ocr-readback-test.js` | basic, complex | OCR 回读验证 |
| `ssim-verification-test.js` | complex | SSIM 视觉对比 |
| `rule-diff-test.js` | basic, complex | 规则 diff 验证 |

---

## 9. 覆盖缺口与改进计划

### 9.1 当前缺口

**格式覆盖**：
- ❌ HTML：缺少 complex、edge-cases、real-world 样例
- ❌ JSON：缺少 complex、edge-cases、real-world 样例
- ❌ CSV：缺少 complex、edge-cases、real-world 样例
- ❌ XML：缺少 complex、real-world 样例
- ❌ PNG：缺少 complex、real-world、benchmark 样例
- ❌ DOC：无 writer，reader best-effort，无样例
- ❌ OFD：L0 级容器解析，仅 `samples/ofd/` 存在

**分层覆盖**：
- ⚠️ edge-cases：部分格式未覆盖异常输入（malformed JSON、XSS、注入）
- ⚠️ real-world：真实场景样例数量较少（< 5 个）
- ⚠️ benchmark：PNG 格式缺少大文件性能测试

### 9.2 改进计划（Phase 5+）

**Phase 5: 补充格式样例**
- 为 HTML、JSON、CSV、XML 创建 complex、edge-cases、real-world 样例
- 添加 malformed 格式的错误处理测试
- 添加安全测试样例（XSS、注入、路径遍历）

**Phase 6: 扩展真实场景**
- 收集更多真实用户场景（技术文档、数据分析报告、项目文档）
- 与用户合作，获取授权的真实样例
- 创建行业特定的样例集（软件开发、数据分析、学术研究）

**Phase 7: 性能基准完善**
- 为每种格式创建 small/medium/large 三个层级
- 建立性能回归测试：跟踪转换时间、内存使用的历史趋势
- 添加并发转换测试：多个文件同时转换的性能

**Phase 8: OFD 攻坚**
- 实现 OFD writer（当前仅 L0 级 reader）
- 补充 OFD 格式的完整样例库
- 建立 OFD ↔ PDF 转换的质量基准

---

## 10. 相关文档

- **实施计划**: `docs/development/IMPLEMENTATION_PLAN.md`
- **测试计划**: `docs/development/TEST_PLAN.md`
- **P4 Fixture 索引**: `samples/fixtures/README.md`
- **格式转换矩阵**: `docs/product/CONVERSION_PATHS.md`
- **文档模型**: `docs/formats/DOCUMENT_MODEL_SCHEMA.md`
- **贡献指南**: `CONTRIBUTING.md`
- **AI 协作规则**: `CLAUDE.md`

---

## 11. 变更记录

- v1.0.0 (2026-06-23): 初版样例库索引，定义 basic/complex/edge-cases/real-world/benchmark 五层结构

---

**维护者**: Jack Yao  
**协作 AI**: Claude Code (Opus 4.8)  
**反馈渠道**: GitHub Issues
