# Trans2Former 后续开发路线图

**版本**: v1.0.0  
**创建日期**: 2026-06-23  
**基于**: 深度研究报告验收建议  
**状态**: 规划中

---

## 执行摘要

基于《Trans2Former 项目深度研究与评价验收报告》的建议，本路线图整合了：
1. 文档一致性整改（高优先级）
2. 架构升级路径（单模型 → 多域模型）
3. 10个 Open Issues 解决方案
4. 测试覆盖率提升（81.38% → 85%+）
5. 可复现性与基准建设

**验收建议**: "有条件通过阶段性验收"  
**核心问题**: 文档与实现状态冲突、可复现实验入口缺口、公开性能指标不足

**改进优先级** (按研究报告建议):
```
统一文档状态 → 补齐脚本清单 → 冻结基准 → 多域模型迁移 → 高风险链路 → 社区发布
```

---

## 1. 项目当前状态

### 1.1 研究报告评分摘要

| 维度 | 得分 | 状态 | 关键问题 |
|------|------|------|----------|
| 正确性 | 7/10 | ✅ 通过 | 路径矩阵、降级策略完整 |
| 代码质量 | 7/10 | ✅ 通过 | app.js 过载已识别 |
| 文档质量 | 8/10 | ✅ 通过 | 覆盖面广、适合研究展示 |
| 文档一致性 | 5/10 | ❌ 需整改 | 插件/OFD/模型/脚本冲突 |
| 可复现性 | 6/10 | ⚠️ 需整改 | 部分命令未在 package.json 声明 |
| 性能证据 | 5/10 | ⚠️ 需补充 | 无公开基准表 |
| 可扩展性 | 8/10 | ✅ 通过 | Tauri + Worker 路线清晰 |
| 鲁棒性 | 7/10 | ✅ 通过 | QualityReport 体系成熟 |
| 安全 | 8/10 | ✅ 通过 | 本地优先、处理禁网 |
| 许可证 | 8/10 | ✅ 通过 | MIT 明确，需补第三方 notice |
| 社区活动度 | 4/10 | ⚠️ 早期 | 5 stars, 0 forks, 0 issues |

**综合结论**: 阶段性成果通过，需优先解决文档一致性和可复现性。

### 1.2 当前 Open Issues (10个)

| Issue | 标签 | 优先级 | 模块 | 状态 |
|-------|------|--------|------|------|
| #129 | security, ocr | P2 | ocr/model-cache | tessdata 导入不验证哈希 |
| #123 | bug, core | P3 | core/document-audit | blockSearchText 与 markdown 源不匹配 |
| #88 | bug, core | P2 | core/zip-container | data descriptor 拒绝影响真实 OOXML |
| #49 | bug, ocr | P2 | ocr/paddle | deskew 后 bbox 坐标系不一致 |
| #42 | refactor, ui | P2 | ui | 主操作按钮四种不一致实现 |
| #40 | ux, ui | P3 | ui | 组件状态覆盖缺口（无 loading/hover/focus） |
| #38 | refactor, ui | P2 | ui | Design Token 体系不完整（130 处颜色字面量）|
| #34 | ux, ui | P3 | ui | 底部质量报告抽屉 DOM 不存在（死代码）|
| #14 | bug, core | P2 | core/repair-engine | Repair Engine 7 类修复中 5 类为 placeholder |
| #9 | performance, ocr | P2 | ocr | 扫描 PDF 每页重建 3 个 ONNX session |

**P2 问题汇总**: 7个（阻塞发布）  
**P3 问题汇总**: 3个（优化项）

### 1.3 测试覆盖率现状

```
Statements   : 81.38% (Target: 85%+)
Branches     : 71.95% (Target: 80%+)
Functions    : 85.56%
Lines        : 81.38%
```

**缺口分析**:
- 整体覆盖率缺口: 3.62% (约 570 行未覆盖)
- 分支覆盖率缺口: 8.05% (约 360 个分支未覆盖)

### 1.4 文档冲突清单（研究报告指出）

| 冲突点 | 文档A | 文档B | 冲突内容 |
|--------|-------|-------|----------|
| 插件模式 | README.md | PLUGIN_SECURITY_MODEL.md | README 说"不再提供插件"，PLUGIN 文档仍定义完整插件机制 |
| OFD 路线 | README.md | P4_OUTPUTS.md | README 说"OFD 内置核心攻坚"，P4 说"通过本地插件推进" |
| 模型架构 | README.md | DOCUMENT_MODEL_SCHEMA.md | README 列出多域模型，Schema 仍是单一 DocumentModel |
| 脚本入口 | README.md | package.json | README 提及 `vendor:onnx/paddle/samples:generate`，package.json 无对应 scripts |
| PNG 输出 | README.md | CONVERSION_PATHS.md | 能力矩阵不一致 |

---

## 2. 开发阶段规划

### Phase 1: 文档一致性整改（高优先级，3-4天）

**目标**: 解决研究报告指出的所有文档冲突，建立单一事实来源。

#### 任务 1.1: 统一插件模式决策
- **冲突**: README vs PLUGIN_SECURITY_MODEL.md
- **决策选项**:
  - A. 保留插件模式，更新 README 说明
  - B. 废弃插件模式，归档 PLUGIN_SECURITY_MODEL.md
- **建议**: 选项 B（研究报告认为"增强能力直接并入核心"更符合产品路线）
- **执行**:
  1. 归档 `docs/PLUGIN_SECURITY_MODEL.md` → `docs/archive/`
  2. 更新 `README.md` 明确"不使用插件机制"
  3. 更新 `CONTRIBUTING.md` 删除插件相关规则
  4. 搜索代码中 PluginManager 相关逻辑，标记为待清理

#### 任务 1.2: 统一 OFD 路线
- **冲突**: README vs P4_OUTPUTS.md
- **决策**: README 已声明"OFD 早期预览、战略攻坚格式"
- **执行**:
  1. 更新 `docs/P4_OUTPUTS.md`，删除"通过插件推进"表述
  2. 明确 OFD 当前状态：实验性输入，输出不支持
  3. 创建 `docs/OFD_ROADMAP.md` 说明攻坚计划

#### 任务 1.3: 统一模型架构表述
- **冲突**: README vs DOCUMENT_MODEL_SCHEMA.md
- **决策**: 明确"当前实现"与"目标架构"
- **执行**:
  1. 更新 `docs/DOCUMENT_MODEL_SCHEMA.md` 标题为"v1 单一模型（当前）"
  2. 创建 `docs/MULTI_DOMAIN_MODEL_DESIGN.md` 描述多域模型目标架构
  3. 更新 README.md 明确"正在从单模型过渡到多域模型"
  4. 在转换流程图中标注当前/目标架构

#### 任务 1.4: 补齐 package.json 脚本声明
- **缺失脚本**: `vendor:onnx`, `vendor:paddle`, `samples:generate`
- **执行**:
  1. 添加到 `package.json` scripts 区块
  2. 验证脚本可执行性
  3. 补充脚本说明到 README.md

#### 任务 1.5: 统一能力矩阵
- **冲突**: README vs CONVERSION_PATHS.md (PNG 输出)
- **执行**:
  1. 对照 `public/formats/` 实际实现
  2. 统一更新 README 和 CONVERSION_PATHS.md
  3. 运行 `scripts/conversion-capability-audit-test.js` 验证

**验收标准**:
- ✅ 所有文档交叉引用一致
- ✅ README 命令全部可执行
- ✅ 能力矩阵与代码实现对齐
- ✅ 无"当前/目标"混淆表述

---

### Phase 2: 解决 P2 Issues（7个，阻塞发布，5-6天）

#### Issue #129: OCR tessdata 导入哈希验证缺失 (P2, security)
- **模块**: `public/core/ocr/model-cache.js`
- **问题**: 只记录哈希不比对，SHA-256 承诺对 tesseract 不成立
- **修复**:
  1. 实现 tessdata 文件 SHA-256 校验
  2. 创建 `scripts/tessdata.manifest.json`（参考 paddleocr-models.manifest.json）
  3. 导入失败时拒绝加载并提示用户
- **测试**: 扩展 `scripts/local-security-test.js`
- **优先级**: 高（安全问题）

#### Issue #88: ZIP data descriptor 拒绝影响真实 OOXML (P2, bug)
- **模块**: `public/core/zip-container.js`
- **问题**: 严格模式拒绝 data descriptor，导致部分 DOCX/XLSX 无法读取
- **修复**:
  1. 支持 ZIP data descriptor 读取
  2. 添加 Central Directory 交叉校验
  3. 扩展测试样例库（包含 data descriptor 的 OOXML）
- **测试**: `scripts/format-integrity-test.js` 添加专项用例
- **优先级**: 高（影响真实文档）

#### Issue #49: OCR deskew 后 bbox 坐标系不一致 (P2, bug)
- **模块**: `public/core/ocr/paddle-ocr-pipeline.js`
- **问题**: deskew 后 bbox 在旋转坐标系，与原图尺寸不匹配
- **修复**:
  1. deskew 后将 bbox 坐标变换回原图坐标系
  2. 或：输出中同时记录原图尺寸和旋转后尺寸
  3. 添加坐标系变换单元测试
- **测试**: `scripts/paddle-ocr-integration-test.js`
- **优先级**: 中高（影响 OCR 结果准确性）

#### Issue #42: UI 主操作按钮四种不一致实现 (P2, refactor)
- **模块**: `public/styles.css`, `public/ui-components.css`, `public/modern-ui.css`
- **问题**: 圆角/配色/hover 行为在三套 CSS 中互不一致
- **修复**:
  1. 统一到一套按钮实现（选择 modern-ui.css 风格）
  2. 删除冗余 CSS 规则
  3. 提取为 `.btn-primary` 等语义 class
- **测试**: `scripts/ui-accessibility-test.js`
- **优先级**: 中（影响用户体验）

#### Issue #38: Design Token 体系不完整 (P2, refactor)
- **模块**: 所有 CSS 文件
- **问题**: 130 处颜色字面量，无统一 token 体系
- **修复**:
  1. 创建 `public/design-tokens.css`（CSS Variables）
  2. 定义颜色、间距、字号、圆角、阴影 token
  3. 全局替换字面量为 `var(--token-name)`
- **测试**: 视觉回归测试（截图对比）
- **优先级**: 中（可维护性）

#### Issue #14: Repair Engine 5/7 类修复为 placeholder (P2, bug)
- **模块**: `public/core/repair-engine.js`
- **问题**: 宣传不符，大部分修复逻辑未实现
- **修复选项**:
  - A. 完整实现 7 类修复
  - B. 收缩宣传，只保留已实现的 2 类
- **建议**: 选项 B（研究报告建议"不过度超前"）
- **执行**:
  1. 归档 placeholder 代码
  2. 更新文档说明当前支持的修复类型
  3. 将未实现功能移入 roadmap
- **测试**: `scripts/repair-engine-test.js` 调整预期
- **优先级**: 中（诚信问题）

#### Issue #9: 扫描 PDF 每页重建 ONNX session (P2, performance)
- **模块**: `public/workers/ocr-worker.js`
- **问题**: 性能成倍劣化，违反多页优化原则
- **修复**:
  1. 复用 ONNX session 跨页面
  2. 延迟 PDF 打开到 worker 初始化阶段
  3. 实现 session 池（最大 3 个并发）
- **测试**: `scripts/paddle-ocr-performance-test.js`（新增）
- **优先级**: 高（性能关键路径）

**Phase 2 验收标准**:
- ✅ 所有 P2 issues 关闭
- ✅ 相关测试通过
- ✅ 代码审核通过（`/code-review --effort medium`）

---

### Phase 3: 测试覆盖率提升（85%+ 目标，4-5天）

**当前**: 81.38% 整体，71.95% 分支  
**目标**: 85%+ 整体，80%+ 分支

#### 任务 3.1: 识别低覆盖率模块
```bash
npm run coverage
open coverage/index.html  # 分析红色/黄色文件
```

**预期低覆盖模块**（基于研究报告）:
- `public/core/repair-engine.js` (placeholder 代码)
- `public/formats/ofd-*.js` (实验性格式)
- `public/workers/` (Worker 通信边界)
- `public/app.js` 部分分支（复杂 UI 逻辑）

#### 任务 3.2: 补充核心模块单元测试
创建测试文件：
- `scripts/core-binary-utils-test.js`
- `scripts/core-format-registry-test.js`
- `scripts/formats-round-trip-test.js` (扩展)
- `scripts/worker-communication-test.js`

每个测试覆盖：
- 成功路径
- 错误处理（try/catch 分支）
- 边界条件（空输入、超大输入、特殊字符）
- 异常输入（null/undefined/错误类型）

#### 任务 3.3: 分支覆盖率专项提升
重点测试：
- if/else 两个分支都执行
- switch 所有 case + default
- 三元运算符两个分支
- 逻辑运算符短路（&&, ||）
- try/catch/finally 全路径

工具辅助：
```bash
c8 report --reporter=lcov
# 分析 coverage/lcov-report/ 中未覆盖分支
```

#### 任务 3.4: 排除死代码或明确标记
对于无法合理测试的代码：
- Issue #34 底部质量报告抽屉（死代码）→ 删除或标记 `/* istanbul ignore */`
- Repair Engine placeholder → 归档或标记
- 实验性格式边缘分支 → 在文档中说明"暂不测试"

**Phase 3 验收标准**:
- ✅ 整体覆盖率 ≥ 85%
- ✅ 分支覆盖率 ≥ 80%
- ✅ 核心模块（core/formats）覆盖率 ≥ 90%
- ✅ 覆盖率报告公开到 `docs/COVERAGE_REPORT.md`

---

### Phase 4: 可复现性与基准建设（3-4天）

**研究报告指出**: "公开性能指标不足"，建议"冻结基准与样例库"。

#### 任务 4.1: 建立公开基准表
创建 `docs/BENCHMARK.md`，包含：

**转换正确性基准**:
| 转换路径 | 样例数 | 语义等价率 | 结构保真率 | SSIM |
|---------|--------|-----------|-----------|------|
| MD→HTML | 15 | 99.2% | 98.5% | N/A |
| DOCX→MD | 10 | 95.3% | 92.1% | N/A |
| HTML→PDF | 8 | N/A | N/A | 0.96 |
| ... | ... | ... | ... | ... |

**性能基准**:
| 场景 | 文件大小 | 耗时 | 内存峰值 | 备注 |
|------|---------|------|---------|------|
| MD→HTML | 1MB | 120ms | 45MB | 纯文本 |
| DOCX→MD | 5MB | 890ms | 128MB | 含图片 |
| OCR (PNG) | 2MB | 3.2s | 256MB | 中英混排 |
| ... | ... | ... | ... | ... |

**OCR 准确率基准**:
| 语种 | 场景 | CER | WER | 备注 |
|------|------|-----|-----|------|
| 中文 | 清晰印刷 | 1.2% | 3.5% | PP-OCRv5 |
| 英文 | 清晰印刷 | 0.8% | 2.1% | PP-OCRv5 |
| 中文 | 旋转30° | 3.5% | 8.2% | 含纠偏 |
| ... | ... | ... | ... | ... |

#### 任务 4.2: 补齐 vendor 脚本
**当前缺失** (README 提及但 package.json 无):
- `npm run vendor:onnx`
- `npm run vendor:paddle`
- `npm run samples:generate`

**执行**:
1. 创建 `scripts/vendor-onnx.js`
2. 创建 `scripts/vendor-paddle.js`（可能已存在，需确认）
3. 创建 `scripts/generate-samples.js`
4. 添加到 `package.json` scripts
5. 文档中补充使用说明

#### 任务 4.3: 固化样例库
创建 `samples/corpus/` 结构：
```
samples/
├── corpus/
│   ├── basic/          # P0 路径样例
│   ├── complex/        # 复杂样式、大文件
│   ├── edge-cases/     # 边界情况
│   ├── real-world/     # 真实文档（脱敏）
│   └── benchmark/      # 基准测试专用
└── README.md           # 样例说明
```

每个样例包含：
- 原始文件
- 预期输出
- 质量报告基线
- 已知限制说明

#### 任务 4.4: 发布第三方依赖 Notice
创建 `THIRD_PARTY_NOTICES.md`：
- PaddleOCR 3.0 (Apache License 2.0)
- ONNX Runtime (MIT)
- Tesseract.js (Apache License 2.0)
- PDF.js (Apache License 2.0)
- 其他依赖

**Phase 4 验收标准**:
- ✅ 基准表完整且可复现
- ✅ 所有 README 命令可执行
- ✅ 样例库结构化且有文档
- ✅ 第三方 notice 完整

---

### Phase 5: 多域模型架构迁移（设计阶段，5-7天）

**研究报告核心建议**: "从单一 DocumentModel 升级为多域模型"

#### 任务 5.1: 多域模型设计文档
创建 `docs/MULTI_DOMAIN_MODEL_DESIGN.md`，定义：

**五类域模型**:
1. **SemanticDoc** - 语义文档（MD/HTML/TXT/DOCX 正文）
2. **WorkbookModel** - 表格工作簿（XLSX/CSV）
3. **SlideModel** - 演示幻灯片（PPTX）
4. **FixedLayoutModel** - 固定版式（PDF 页对象）
5. **AssetGraph** - 资源引用图（图片/字体/样式）

**路由规则**:
```javascript
// 伪代码示意
function selectModel(inputFormat, outputFormat) {
  if (isSemanticPath(inputFormat, outputFormat)) {
    return SemanticDoc;
  } else if (isWorkbookPath(inputFormat, outputFormat)) {
    return WorkbookModel;
  } else if (isSlidePath(inputFormat, outputFormat)) {
    return SlideModel;
  } else if (isFixedLayoutPath(inputFormat, outputFormat)) {
    return FixedLayoutModel;
  } else {
    // 跨域转换：语义投影 + 质量降级
    return projectBetweenModels(inputModel, outputModel);
  }
}
```

**投影与降级策略**:
- SemanticDoc → FixedLayoutModel: 保留语义，生成页对象
- FixedLayoutModel → SemanticDoc: OCR + 版面分析 + warnings
- WorkbookModel → SemanticDoc: 表格降级为文本表格
- SlideModel → SemanticDoc: 逐页转换为标题+内容块

#### 任务 5.2: 迁移路径规划
**不破坏现有功能的渐进式迁移**:

**第一步**: 保持 DocumentModel 为默认，引入域模型作为可选路径
- 在 `public/core/models/` 下创建新文件
- `semantic-doc.js`, `workbook-model.js`, `slide-model.js`, `fixed-layout-model.js`, `asset-graph.js`
- 初期仅用于新增转换路径

**第二步**: 重构 format registry，支持多模型路由
- `public/core/format-registry.js` 添加 `preferredModel` 字段
- `public/core/conversion-router.js` 实现模型选择逻辑

**第三步**: 逐条转换路径迁移
- 优先级: 表格路径（XLSX/CSV）→ 幻灯片路径（PPTX）→ 语义路径（MD/HTML）→ 固定版式路径（PDF）
- 每迁移一条路径，运行完整测试套件
- 保持旧路径兼容性，直到新路径稳定

**第四步**: 废弃单一 DocumentModel（Phase 6+ 任务）
- 所有路径迁移完成后
- 归档 `public/core/models/document-model.js`
- 更新所有文档

#### 任务 5.3: 更新文档体系
- `DOCUMENT_MODEL_SCHEMA.md` → `docs/archive/v1-document-model.md`
- 创建 `docs/V2_MULTI_DOMAIN_MODELS.md`
- 更新 `README.md` 架构图
- 更新 `CONVERSION_POLICY.md` 投影规则

**Phase 5 验收标准**:
- ✅ 设计文档完整（模型定义、路由规则、迁移路径）
- ✅ 设计评审通过（可用 `/code-review --effort high` 审查设计）
- ✅ 不开始实现（设计阶段，Phase 6 执行）

---

### Phase 6: 解决剩余 P3 Issues + 优化（2-3天）

#### Issue #123: blockSearchText 与 markdown 源不匹配 (P3)
- **模块**: `public/core/document-audit.js`
- **问题**: table 块 sourceSpan 为 null，list 块 endOffset 虚增
- **修复**: 修正 sourceSpan 计算逻辑
- **优先级**: 低（不影响核心功能）

#### Issue #40: UI 组件状态覆盖缺口 (P3)
- **模块**: `public/app.js`, CSS 文件
- **问题**: 无 loading/hover/focus 视觉反馈
- **修复**: 补充 CSS 状态类，添加 loading 动画
- **优先级**: 低（体验优化）

#### Issue #34: 底部质量报告抽屉死代码 (P3)
- **模块**: `public/app.js`, CSS 文件
- **问题**: DOM 不存在，180 行死 CSS
- **修复选项**:
  - A. 实现质量报告面板
  - B. 删除死代码
- **建议**: 选项 B（研究报告建议"不过度超前"）
- **执行**: 删除死代码，将功能移入 roadmap
- **优先级**: 低（清理债务）

**Phase 6 验收标准**:
- ✅ 所有 P3 issues 关闭或明确标记为 roadmap
- ✅ 代码清理完成
- ✅ 无新增 TODO 或 placeholder

---

## 3. 里程碑与时间线

| 里程碑 | 预计时间 | 关键交付物 | 验收标准 |
|--------|---------|-----------|---------|
| M1: 文档一致性完成 | 第 4 天 | 统一文档体系、补齐脚本 | 无文档冲突、命令可执行 |
| M2: P2 Issues 清零 | 第 10 天 | 7 个关键问题修复 | 所有 P2 issues 关闭 |
| M3: 测试覆盖率达标 | 第 15 天 | 85%+ 覆盖率 | 覆盖率报告公开 |
| M4: 可复现性完善 | 第 19 天 | 基准表、样例库 | 第三方可复现 |
| M5: 多域模型设计 | 第 26 天 | 设计文档、迁移计划 | 设计评审通过 |
| M6: P3 Issues 清理 | 第 29 天 | 代码债务清理 | 所有 issues 关闭或归档 |

**总工期**: 约 29 天（6 周）

---

## 4. 质量门禁

### Gate 1: 进入 Phase 2
- ✅ 所有文档冲突解决
- ✅ README 命令 100% 可执行
- ✅ 能力矩阵与代码一致

### Gate 2: 进入 Phase 3
- ✅ 所有 P2 issues 关闭
- ✅ 代码审核无 P0/P1 发现

### Gate 3: 进入 Phase 4
- ✅ 覆盖率 ≥ 85%
- ✅ 所有测试通过

### Gate 4: 进入 Phase 5
- ✅ 基准表完整
- ✅ vendor 脚本可执行
- ✅ 样例库结构化

### Gate 5: 进入 Phase 6
- ✅ 多域模型设计评审通过
- ✅ 迁移路径可行性确认

### Final Gate: 项目完成
- ✅ 所有 issues 关闭或归档
- ✅ 覆盖率 ≥ 85%
- ✅ 文档完整一致
- ✅ 基准可复现
- ✅ 代码审核通过

---

## 5. 风险与应对

### 风险 1: 文档整改触发连锁修改
**概率**: 高  
**影响**: 中等  
**描述**: 统一文档可能发现更多不一致，触发额外整改。  
**应对**:
- 第一轮只修复研究报告明确指出的 5 个冲突
- 建立"文档变更影响分析"检查清单
- 每次修改后运行 `grep -r "插件\|plugin\|OFD\|DocumentModel" docs/`

### 风险 2: P2 Issues 修复引入新 bug
**概率**: 中等  
**影响**: 高  
**描述**: 尤其是 #88 (ZIP descriptor)、#9 (ONNX session)，可能影响核心转换。  
**应对**:
- 每个 issue 修复后立即运行完整测试套件
- 优先修复有现成测试覆盖的 issues
- #88 和 #9 需要在 worktree 中隔离修复

### 风险 3: 测试覆盖率难以达到 85%
**概率**: 中等  
**影响**: 中等  
**描述**: 部分模块（如 app.js UI 逻辑）分支复杂，难以全覆盖。  
**应对**:
- 设定"核心模块 90%，UI 模块 75%"的分层目标
- 对死代码明确标记 `/* istanbul ignore */`
- 实在无法测试的边缘分支，在文档中说明理由

### 风险 4: 基准测试数据收集耗时
**概率**: 高  
**影响**: 低  
**描述**: 建立性能基准、OCR 准确率基准需要大量测试。  
**应对**:
- 第一版基准只覆盖 P0 路径（5-8 个场景）
- 使用现有 samples/ 和 tests/ 样例
- 标注"v1.0 基准，持续完善中"

### 风险 5: 多域模型设计分歧
**概率**: 低  
**影响**: 高  
**描述**: 模型划分可能存在争议，迁移路径可能不可行。  
**应对**:
- Phase 5 只做设计，不实施
- 设计文档提供多个备选方案
- 通过代码审核（`/code-review --effort high`）验证设计

---

## 6. 资源需求

### 开发资源
- **人力**: 1 人全职（Claude Code + Jack Yao 协作）
- **时间**: 6 周（29 工作日）
- **工具**: c8, puppeteer, GitHub CLI, Claude Code

### 计算资源
- **测试环境**: Windows 11 + Node.js 18+
- **OCR 性能测试**: 需要 WebGPU 支持（或 WASM 降级）
- **覆盖率分析**: 本地生成 HTML 报告

### 文档资源
- **参考**: DevDocsKit v2.1.1 规范
- **模板**: 从现有文档提取结构
- **审查**: 每个 Phase 结束后代码审核

---

## 7. 成功标准（最终验收）

### 功能完整性
- ✅ 所有 P0/P1/P2 issues 关闭
- ✅ P3 issues 关闭或明确标记为 roadmap
- ✅ 核心转换路径无回归

### 质量指标
- ✅ 测试覆盖率 ≥ 85%（整体）
- ✅ 分支覆盖率 ≥ 80%
- ✅ 核心模块覆盖率 ≥ 90%
- ✅ 所有测试通过（零失败）

### 文档一致性
- ✅ 无交叉引用冲突
- ✅ README 命令 100% 可执行
- ✅ 能力矩阵与代码对齐
- ✅ "当前/目标"架构明确区分

### 可复现性
- ✅ 基准表公开（正确性、性能、OCR）
- ✅ 样例库结构化（4 类场景 × 15+ 样例）
- ✅ vendor 脚本完整
- ✅ 第三方 notice 完整

### 架构演进
- ✅ 多域模型设计文档完成
- ✅ 迁移路径规划清晰
- ✅ 设计评审通过

### 工程成熟度
- ✅ 代码审核报告无 P0/P1 问题
- ✅ 无未说明的 TODO/placeholder
- ✅ 死代码清理完成
- ✅ Design Token 体系统一

---

## 8. 后续工作（Phase 7+，本路线图外）

### 短期（1-2 个月）
1. **实施多域模型迁移**（Phase 5 设计的执行）
2. **DOCX/PPTX 高保真增强**（复杂样式、图表）
3. **OFD 输出支持**（基于固定版式模型）
4. **桌面应用正式发布**（Windows/macOS/Linux）

### 中期（3-6 个月）
1. **社区建设**（GitHub stars/forks/issues 增长）
2. **插件生态评估**（是否重新引入轻量插件机制）
3. **性能优化**（大文件流式处理、内存优化）
4. **国际化**（多语言 UI、文档）

### 长期（6-12 个月）
1. **Web 版本发布**（在线 Demo，文件不上传）
2. **企业版功能**（批量转换、API 集成）
3. **格式扩展**（RTF、ODT、Markdown 方言）
4. **AI 增强**（智能结构识别、自动修复）

---

## 9. 附录

### 附录 A: 研究报告关键引用

> "建议'有条件通过'阶段性验收。通过的理由在于：项目方向明确，问题定义清晰，本地安全边界设计成熟，文档体系丰富。条件则主要来自三类风险：**文档与实现状态存在冲突、可复现实验入口存在缺口、公开性能指标不足**。"

> "Trans2Former 已经完成本地优先多格式转换平台的核心骨架，具备明确的中间表示、路径治理、安全边界、桌面化承载与质量回归设计；当前最需要补齐的是文档一致性、公开基准与高风险格式链路的量化验证。"

> "改进优先级（按最能快速提升验收可信度）：统一文档状态 → 补齐脚本与发布清单 → 冻结基准与样例库 → 把单模型迁移到多域模型 → 重做 PDF/OFD/OCR 高风险链路 → 扩大社区与正式发布。"

### 附录 B: DevDocsKit 规范对照

本路线图遵循 DevDocsKit v2.1.1 个人开发者规范体系：
- ✅ 启动顺序明确（CLAUDE.md, IMPLEMENTATION_PLAN, README, CONTRIBUTING）
- ✅ 模块化开发约束（边界清晰、禁止无边界扩散）
- ✅ 小步提交（一个 commit 一个意图）
- ✅ 阶段代码审核（每个 Phase 结束执行 `/code-review`）
- ✅ Issue 标签体系（P0-P3 + 类型 + 模块）
- ✅ 质量门禁（覆盖率 ≥ 80%，分支 ≥ 70%）

### 附录 C: 参考文档清单

**核心文档**:
- `CLAUDE.md` - AI 协作入口
- `docs/development/IMPLEMENTATION_PLAN.md` - 当前实施计划
- `README.md` - 项目概览
- `CONTRIBUTING.md` - 贡献指南
- `docs/development/TESTING_GUIDE.md` - 测试指南

**架构文档**:
- `docs/DOCUMENT_MODEL_SCHEMA.md` - v1 模型定义
- `docs/CONVERSION_PATHS.md` - 转换路径矩阵
- `docs/CONVERSION_POLICY.md` - 转换策略
- `docs/DESKTOP_APP_ARCHITECTURE.md` - 桌面架构

**质量文档**:
- `docs/BASIC_FORMAT_QUALITY.md` - 基础格式质量
- `docs/SECURITY_POLICY.md` - 安全策略
- `docs/RESOURCE_BUDGET.md` - 资源预算

---

## 10. 变更记录

- **v1.0.0** (2026-06-23): 初版路线图
  - 基于深度研究报告验收建议
  - 整合 10 个 Open Issues
  - 6 个开发阶段，29 天工期
  - 文档一致性为最高优先级

---

**文档维护者**: Jack Yao + Claude Code  
**审查**: 基于深度研究报告（2026-06-23）  
**状态**: ✅ 规划完成，待执行
