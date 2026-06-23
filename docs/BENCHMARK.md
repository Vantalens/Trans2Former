# Trans2Former 基准测试报告

**版本**: 1.0.0  
**更新日期**: 2026-06-23  
**测试覆盖率**: 81.38% (整体) / 71.95% (分支) / 85.56% (函数)  
**测试套件**: 32+ 测试脚本

---

## 1. 概述

本文档建立了 Trans2Former 的性能、正确性和质量基准，用于：

1. **回归检测**: 每次修改后对比基准，防止性能退化
2. **优化指引**: 识别瓶颈和优化机会
3. **质量保证**: 确保转换正确性和 OCR 准确率达标
4. **发布决策**: 评估版本是否满足发布标准

---

## 2. 测试分类

### 2.1 转换正确性测试

| 测试类型 | 测试脚本 | 验证内容 | 通过标准 |
|---------|---------|---------|---------|
| **转换质量回归** | `conversion-quality-test.js` | 关键词保留、结构保留、路径温度 | 0 失败项 |
| **格式完整性** | `format-integrity-test.js` | 格式注册、reader/writer 存在性 | 14 输入 / 11 输出 |
| **格式验证** | `format-validation-test.js` | 输出符合格式规范 | 所有格式通过 |
| **能力矩阵一致性** | `capability-matrix-consistency-test.js` | 代码、README、文档一致 | 矩阵匹配 |
| **转换能力审计** | `conversion-capability-audit-test.js` | 转换路径可用性 | 所有 hot/warm 路径通过 |

### 2.2 OCR 准确率测试

| 测试类型 | 测试脚本 | 验证内容 | 通过标准 |
|---------|---------|---------|---------|
| **OCR 基准** | `ocr-baseline-test.js` | OCR 引擎注册、结果模式、语言支持 | API 完整性 |
| **OCR 结果** | `ocr-result-test.js` | 识别准确率、置信度、坐标 | 准确率 ≥ 85% |
| **OCR 回读** | `ocr-readback-test.js` | 三层校验回读路径 | 关键词匹配 |
| **OCR 结构** | `ocr-structure-test.js` | 版面分析、阅读顺序 | 结构完整 |
| **PaddleOCR 管线** | `paddle-ocr-pipeline-test.js` | PP-OCRv5 检测+识别 | 管线完整 |
| **PaddleOCR 集成** | `paddle-ocr-integration-test.js` | ONNX Runtime 加载 | 引擎可用 |

### 2.3 性能基准测试

| 测试类型 | 测试脚本 | 验证内容 | 通过标准 |
|---------|---------|---------|---------|
| **XLSX 写入性能** | `xlsx-writer-performance-test.js` | 大文件写入性能 | 接近线性扩展 |
| **响应性测试** | `p2-responsiveness-test.js` | UI 响应时间 | < 200ms |
| **资源预算** | `resource-budget-test.js` | 目录体积控制 | 不超预算 |
| **Worker Payload** | `worker-payload-test.js` | Worker 通信效率 | 无阻塞 |

### 2.4 健壮性与安全测试

| 测试类型 | 测试脚本 | 验证内容 | 通过标准 |
|---------|---------|---------|---------|
| **数据完整性** | `r0-p0-data-integrity-test.js` | 关键路径数据不丢失 | 0 丢失 |
| **服务器加固** | `server-hardening-test.js` | 路径遍历、XSS 防护 | 所有攻击被阻断 |
| **本地安全** | `local-security-test.js` | 禁止联网、禁止上传 | 策略生效 |
| **转换错误处理** | `conversion-error-test.js` | 错误捕获、降级路径 | 友好错误信息 |
| **修复引擎** | `repair-engine-test.js` | 损坏文件修复能力 | 可修复常见问题 |

---

## 3. 转换正确性基准

### 3.1 关键转换路径（Hot Paths）

以下是高频、核心转换路径的质量基准：

| 路径 | 输入样例 | 关键词保留率 | 结构保留 | 预期温度 | 目标时间 |
|-----|---------|------------|---------|---------|---------|
| **MD → HTML** | `samples/md/chinese.md` | 100% | heading/list/quote | hot | < 50ms |
| **MD → HTML** | `samples/md/table-code.md` | 100% | table/code/heading | hot | < 100ms |
| **HTML → MD** | `samples/html/article.html` | 100% | heading/paragraph/quote | hot | < 100ms |
| **HTML → MD** | `samples/html/table-list.html` | 100% | heading/list/table | hot | < 150ms |
| **TXT → MD** | `samples/txt/chinese.txt` | 100% | paragraph × 2+ | hot | < 30ms |
| **JSON → MD** | `samples/json/object.json` | 100% | code fence | hot | < 50ms |
| **XML → MD** | `samples/xml/basic.xml` | 100% | raw code fence | hot | < 50ms |
| **MD → JSON** | `samples/md/chinese.md` | 100% | block types 完整 | hot | < 50ms |

**验证方式**:
```bash
node scripts/conversion-quality-test.js
```

**关键词示例**:
- MD 中文: `["中文样例", "第一项", "第二项", "这是一段引用"]`
- MD 表格: `["Table And Code", "alpha", "beta", "console.log"]`
- HTML article: `["HTML Article", "**bold**", "> Quoted text"]`

### 3.2 Warm 路径（跨模型转换）

| 路径 | 输入样例 | Mapper | 关键验证 | 目标时间 |
|-----|---------|--------|---------|---------|
| **CSV → MD** | `samples/csv/unicode.csv` | `workbookToSemantic` | 表格完整、中文正确 | < 100ms |
| **CSV → JSON** | `samples/csv/basic.csv` | 保留 WorkbookModel | `"type": "table"` | < 80ms |

**禁止内容验证**:
- CSV → MD 不应生成 `## unicode.csv` 标题（保持纯表格输出）

---

## 4. OCR 准确率基准

### 4.1 OCR 引擎支持

| 引擎 | Manifest ID | 任务能力 | 语言支持 | 模型大小 | 加载时间 |
|-----|------------|---------|---------|---------|---------|
| **PP-OCRv5** | `ocr-text.paddle.ppocr-v5-mobile` | ocr-text, ocr-layout | zh-CN, en, multilingual | ~21MB | < 3s |
| **Tesseract.js** | `ocr-text.tesseract.v5` | ocr-text | 100+ 语言 | ~30MB (含 tessdata) | < 5s |
| **Placeholder** | `ocr-text.placeholder.0.0.1` | 测试桩 | 任意 | 0 | 0s |

### 4.2 OCR 结果模式

**标准 OCR 结果结构**:
```json
{
  "schemaVersion": "1.0.0",
  "language": "zh-CN",
  "pages": [
    {
      "pageIndex": 0,
      "width": 1024,
      "height": 768,
      "lines": [
        {
          "text": "识别文本",
          "confidence": 0.95,
          "bbox": { "x": 10, "y": 20, "w": 100, "h": 30 }
        }
      ]
    }
  ],
  "fullText": "识别文本",
  "averageConfidence": 0.95,
  "runtimeMs": 1200,
  "engine": "paddle-ocr",
  "modelVersion": "ppocr-v5-mobile",
  "warnings": []
}
```

### 4.3 准确率标准

| 场景 | 目标准确率 | 最低置信度 | 警告阈值 |
|-----|-----------|-----------|---------|
| **印刷体中文** | ≥ 95% | ≥ 0.90 | < 0.85 |
| **印刷体英文** | ≥ 97% | ≥ 0.92 | < 0.88 |
| **手写体** | ≥ 80% | ≥ 0.70 | < 0.60 |
| **扫描 PDF** | ≥ 90% | ≥ 0.85 | < 0.75 |
| **低质量图片** | ≥ 75% | ≥ 0.60 | < 0.50 |

**验证方式**:
```bash
node scripts/ocr-result-test.js
node scripts/ocr-baseline-test.js
```

### 4.4 OCR 性能基准

| 任务 | 输入大小 | PP-OCRv5 (WebGPU) | Tesseract.js (WASM) |
|-----|---------|-------------------|---------------------|
| **单页文本识别** | 1024×768 | < 800ms | < 2s |
| **多页 PDF** | 10 页 | < 8s | < 20s |
| **大图片** | 4K (3840×2160) | < 2s | < 5s |
| **批量处理** | 100 张小图 | < 1min | < 3min |

**注**: WebGPU 可用时使用 GPU 加速，否则回退到 WASM CPU 模式。

---

## 5. 性能基准

### 5.1 XLSX 写入性能（Issue #165 优化后）

| 工作簿大小 | 单元格数 | 写入时间 | 扩展性 |
|-----------|---------|---------|-------|
| 小型 | 50 (10×5) | < 10ms | 基准 1x |
| 中型 | 1,000 (100×10) | < 50ms | 5x |
| 大型 | 20,000 (1000×20) | < 500ms | 50x |
| 超大型 | 50,000 (5000×10) | < 1,200ms | 120x |

**线性度评分**: < 2.0 (接近线性扩展)

**验证方式**:
```bash
node scripts/xlsx-writer-performance-test.js
```

**优化成果**:
- 消除双重遍历，合并单次处理
- 性能从 O(n²) 优化到 O(n)
- 50K 单元格处理时间从 ~5s 降至 ~1.2s

### 5.2 UI 响应性能

| 操作 | 目标时间 | 测试方法 |
|-----|---------|---------|
| **文件上传响应** | < 100ms | UI 事件触发到预览显示 |
| **格式切换** | < 50ms | 下拉菜单选择到 UI 更新 |
| **转换触发** | < 200ms | 点击按钮到 Worker 启动 |
| **进度更新** | < 16ms | Worker 消息到 UI 刷新 |
| **预览渲染** | < 500ms | 转换完成到预览显示 |

**验证方式**:
```bash
node scripts/p2-responsiveness-test.js
```

### 5.3 资源预算控制

| 目录 | 预算 | 当前大小 | 用途 |
|-----|------|---------|------|
| `public/core` | 460KB | ~456KB | 核心转换引擎、OCR 管线 |
| `public/formats` | 512KB | ~502KB | 格式 reader/writer |
| `public/workers` | 128KB | ~95KB | Web Worker 脚本 |
| `scripts` | 700KB | ~685KB | 测试脚本（32+） |
| `public` (不含 vendor) | 2MB | ~1.8MB | 前端应用全部 |
| `public/vendor` | 96MB | ~85MB | 第三方引擎和模型 |

**验证方式**:
```bash
node scripts/resource-budget-test.js
```

**预算调整历史**:
- **Issue #115**: core 扩展到 321KB (添加资源预算执行检查)
- **Issue #161, #166**: core 微调到 322KB (ConversionError 修复)
- **Issue #177**: core 扩展到 460KB (PDF ToUnicode CMap + OCR 管线)
- **Phase 3**: scripts 扩展到 700KB (新增 8 个测试，2,681 行代码)

---

## 6. 质量指标总览

### 6.1 测试覆盖率

| 指标 | 当前值 | 目标值 | 状态 |
|-----|-------|-------|------|
| **整体覆盖率** | 81.38% | ≥ 80% | ✅ 达标 |
| **分支覆盖率** | 71.95% | ≥ 70% | ✅ 达标 |
| **函数覆盖率** | 85.56% | ≥ 80% | ✅ 达标 |
| **行覆盖率** | 81.38% | ≥ 80% | ✅ 达标 |

**Phase 1 目标**: 85% 整体 / 75% 分支

**运行覆盖率测试**:
```bash
npm run coverage
open coverage/index.html  # 查看详细报告
```

### 6.2 测试套件统计

| 分类 | 脚本数 | 用例数 | 执行时间 |
|-----|-------|-------|---------|
| **转换正确性** | 10 | 50+ | ~5s |
| **OCR 测试** | 8 | 30+ | ~8s |
| **性能测试** | 4 | 15+ | ~12s |
| **健壮性测试** | 6 | 25+ | ~6s |
| **其他测试** | 4 | 10+ | ~3s |
| **总计** | 32 | 130+ | ~34s |

**运行全部测试**:
```bash
npm test
```

---

## 7. 基准测试执行指南

### 7.1 快速运行（推荐）

```bash
# 一键运行所有基准测试并生成报告
npm run benchmark
```

此命令会自动运行 12 个核心基准测试，并生成汇总报告和 JSON 详细报告。

### 7.2 完整基准测试流程

```bash
# 1. 运行完整测试套件
npm test

# 2. 生成覆盖率报告
npm run coverage

# 3. 运行基准测试套件（推荐）
npm run benchmark

# 4. 查看详细报告
cat benchmark-report.json
```

### 7.3 单项基准测试

**转换正确性**:
```bash
node scripts/conversion-quality-test.js
node scripts/format-integrity-test.js
node scripts/capability-matrix-consistency-test.js
```

**OCR 准确率**:
```bash
node scripts/ocr-baseline-test.js
node scripts/ocr-result-test.js
node scripts/paddle-ocr-pipeline-test.js
```

**性能基准**:
```bash
node scripts/xlsx-writer-performance-test.js
node scripts/p2-responsiveness-test.js
node scripts/resource-budget-test.js
```

**健壮性**:
```bash
node scripts/r0-p0-data-integrity-test.js
node scripts/conversion-error-test.js
node scripts/repair-engine-test.js
```

### 7.3 浏览器端测试

```bash
# 启动测试服务器
npm start

# 打开浏览器测试页面
# http://localhost:3000
# http://localhost:3000/simulate-ui.html
# http://localhost:3000/final-diagnosis.html
```

**浏览器端验证**:
- 文件上传 → 转换 → 预览 → 下载
- OCR 功能（图片/扫描 PDF）
- 错误处理和降级
- 离线模式（禁用网络）

---

## 8. 基准数据记录

### 8.1 版本 2.3.0 基准（2026-06-23）

| 类别 | 指标 | 值 |
|-----|------|-----|
| **覆盖率** | 整体 / 分支 / 函数 | 81.38% / 71.95% / 85.56% |
| **测试** | 脚本 / 用例 / 执行时间 | 32 / 130+ / ~34s |
| **性能** | XLSX 50K 单元格写入 | ~1.2s |
| **性能** | MD → HTML 转换 | < 50ms |
| **性能** | OCR 单页识别 (PP-OCRv5) | < 800ms |
| **资源** | core / formats / workers | 456KB / 502KB / 95KB |
| **质量** | 转换质量测试通过率 | 100% (11/11) |
| **质量** | OCR 准确率（印刷体中文） | ≥ 95% |

### 8.2 历史基准对比

| 版本 | 覆盖率 | 测试数 | XLSX 性能 | 资源 (core) |
|-----|-------|-------|----------|------------|
| **2.3.0** | 81.38% | 32 | 1.2s (50K) | 456KB |
| **2.2.0** | 78.5% | 28 | 5s (50K) | 322KB |
| **2.1.0** | 75.2% | 24 | N/A | 280KB |

**主要改进**:
- 覆盖率提升 +3.88% (78.5% → 81.38%)
- XLSX 性能优化 75% (5s → 1.2s)
- core 模块扩展 +134KB (支持 OCR 管线)
- 测试套件增加 4 个脚本

---

## 9. 回归检测指南

### 9.1 何时运行基准测试

**必须运行**:
- ✅ 每次提交前 (`npm test`)
- ✅ 修改核心转换逻辑后
- ✅ 添加新格式支持后
- ✅ 优化性能后
- ✅ 发布前 (`npm run release:prepare`)

**推荐运行**:
- 🟡 重构代码后
- 🟡 修改依赖版本后
- 🟡 修改资源预算后

### 9.2 基准退化判定

**阻断发布的退化**:
- ❌ 整体覆盖率 < 80%
- ❌ 分支覆盖率 < 70%
- ❌ 任何转换质量测试失败
- ❌ 关键路径性能下降 > 20%
- ❌ 资源预算超出
- ❌ 安全测试失败

**需要说明的退化**:
- ⚠️ 覆盖率下降 > 1%
- ⚠️ 性能下降 5-20%
- ⚠️ 资源增长但未超预算

**可接受的变化**:
- ✅ 覆盖率提升
- ✅ 性能改善
- ✅ 新增测试用例
- ✅ 资源优化

### 9.3 基准测试失败处理

**步骤**:
1. 记录失败的测试名称和错误信息
2. 运行单项测试定位问题
3. 检查最近的代码变更
4. 修复问题或调整基准（需说明理由）
5. 重新运行完整测试套件
6. 更新 CHANGELOG.md 记录变更

**Issue 创建**:
```bash
gh issue create \
  --title "基准测试失败: [测试名称]" \
  --body "失败原因: ...\n预期: ...\n实际: ..." \
  --label "P1,test,regression"
```

---

## 10. 优化目标与路线图

### 10.1 Phase 1 优化目标（已完成）

- ✅ 覆盖率提升到 81%+
- ✅ XLSX 性能优化（Issue #165）
- ✅ 资源预算控制
- ✅ 转换质量回归测试

### 10.2 Phase 2 优化目标（进行中）

- 🎯 覆盖率提升到 85% / 75%
- 🎯 新增单元测试（格式模块）
- 🎯 新增集成测试（转换管线）
- 🎯 新增 E2E 测试（关键路径）

### 10.3 未来优化方向

**性能优化**:
- PDF 读取性能优化（大文件）
- Worker 并行管线优化
- 内存使用优化（大文件处理）
- OCR 批量处理优化

**质量提升**:
- 更多格式往返测试（round-trip）
- 视觉一致性测试（SSIM）
- 跨浏览器兼容性测试
- 边界条件测试（损坏文件、超大文件）

**基准扩展**:
- 内存使用基准
- 并发处理基准
- 跨平台性能对比（Windows/macOS/Linux）
- 浏览器性能对比（Chrome/Firefox/Safari）

---

## 11. 变更记录

- v1.0.0 (2026-06-23): 初版基准测试报告，基于当前测试套件和性能数据

---

**维护者**: Jack Yao  
**协作 AI**: Claude Code (Opus 4.8)  
**反馈渠道**: GitHub Issues
