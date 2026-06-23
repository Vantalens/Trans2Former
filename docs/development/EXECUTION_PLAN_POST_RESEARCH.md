# Trans2Former 后续开发路线图执行计划

**版本**: v1.0.0  
**创建日期**: 2026-06-23  
**计划模式**: 是  
**基于文档**: POST_RESEARCH_ROADMAP.md

---

## 执行摘要

本计划基于《Trans2Former 项目深度研究与评价验收报告》和 POST_RESEARCH_ROADMAP.md，将在约29天内完成6个阶段的系统性整改：

**核心目标**：
1. 解决文档与实现状态冲突（5个冲突点）
2. 修复10个 Open Issues（7个P2，3个P3）
3. 提升测试覆盖率从81.38%到85%+
4. 建立可复现的性能基准和样例库
5. 完成多域模型架构设计（设计阶段，不实施）
6. 清理代码债务和死代码

**验收标准**: 有条件通过 → 完全通过

---

## 当前项目状态分析

### 1. 已确认的现状

**测试覆盖率**（最新数据）:
```
Statements   : 81.38% (12824/15757) - 目标: 85%+
Branches     : 71.95% (3220/4475)  - 目标: 80%+
Functions    : 85.56% (658/769)
Lines        : 81.38% (12824/15757)
```

**覆盖率缺口**:
- 整体缺口: 3.62% (约 570 行未覆盖)
- 分支缺口: 8.05% (约 360 个分支未覆盖)

**项目结构**:
- package.json 已包含所需脚本（vendor:onnx, vendor:paddle, samples:generate）
- 测试文件数量: 35 个
- public/core 目录大小: 644KB (预算 460KB，超出 184KB)
- app.js 代码行数: 2042 行（过载）
- CSS 文件颜色字面量: 148 处（需要 Design Token）

**多域模型架构现状**:
- MULTI_MODEL_ARCHITECTURE.md 已存在（v0.1.0，2026-05-12）
- 定义了5个规范模型：SemanticDoc, WorkbookModel, SlideModel, FixedLayoutModel, AssetGraph
- 当前实现：单一 DocumentModel（DOCUMENT_MODEL_SCHEMA.md）
- 代码位置：public/core/models/ 目录下已有部分新模型文件

**Repair Engine 现状**:
- 文件存在：repair-engine.js (9923 bytes), repair-handlers.js (4537 bytes)
- DEFAULT_HANDLERS 中7个动作类型：
  - ✅ replaceTextRun: 已实现
  - ✅ selectFallbackRoute: 已实现
  - ❌ insertTextRun: placeholderHandler
  - ❌ reorderBlocks: placeholderHandler
  - ❌ restoreTableGrid: placeholderHandler
  - ❌ adjustBoundingBox: placeholderHandler
  - ❌ regeneratePageLayout: placeholderHandler

### 2. 文档冲突点分析

**冲突1: 插件模式**
- README.md: "增强能力直接内置于核心模块，不使用插件机制"
- 代码搜索: 未找到 PluginManager 相关代码
- 文档搜索: 6个文档提及 PLUGIN（多为历史记录）
- **结论**: 插件模式已废弃，但文档散落提及，需要清理

**冲突2: OFD 路线**
- README.md: "OFD（早期预览）" "战略攻坚格式"
- P4_OUTPUTS.md: "OFD 已升级为 P5 战略攻坚格式，当前进入核心 L0 路线"
- **结论**: 表述基本一致，需要微调为统一术语

**冲突3: 模型架构**
- README.md: 提及多格式支持，未明确说明单/多模型
- DOCUMENT_MODEL_SCHEMA.md: "DocumentModel" 单一模型（v0.2.0）
- MULTI_MODEL_ARCHITECTURE.md: 5个规范模型（v0.1.0，设计文档）
- **结论**: 当前实现为单模型，目标为多域模型，需明确标注"当前/目标"

**冲突4: 能力矩阵**
- README.md: 格式表列出 14 输入/11 输出
- CONVERSION_PATHS.md: 详细路径矩阵
- **需要验证**: 与 public/formats/ 实际实现对齐

**冲突5: 脚本声明**
- ✅ 已解决：package.json 包含 vendor:onnx, vendor:paddle, samples:generate

### 3. Open Issues 技术可行性

基于代码探索，10个Issues均可修复：

**P2 - 安全/核心功能**（7个，高优先级）:
1. #129 (security): tessdata 哈希验证 - 可行，参考 paddleocr-models.manifest.json
2. #88 (bug): ZIP data descriptor - 可行，zip-container.js 已存在
3. #49 (bug): OCR bbox 坐标系 - 可行，OCR 文件完整
4. #42 (refactor): 按钮实现不一致 - 可行，CSS 文件已定位
5. #38 (refactor): Design Token - 可行，148 处颜色字面量已统计
6. #14 (bug): Repair Engine placeholder - 可行，5/7 确认为 placeholder
7. #9 (performance): ONNX session 重建 - 需要检查 workers/

**P3 - 优化项**（3个，低优先级）:
8. #123 (bug): blockSearchText - document-audit.js 存在
9. #40 (ux): 组件状态覆盖 - CSS + app.js
10. #34 (ux): 底部质量报告抽屉 - 建议删除死代码

---

## Context 部分

### 为什么需要这个计划

根据深度研究报告，Trans2Former 获得"有条件通过阶段性验收"评价。核心问题是：
1. **文档与实现状态冲突** - 影响可信度
2. **可复现实验入口缺口** - 影响第三方验证
3. **公开性能指标不足** - 无基准对比

当前状态：
- 技术架构清晰（本地优先、多格式转换、质量验证）
- 核心功能完整（14输入/11输出、OCR、Repair Engine）
- 测试覆盖率良好（81.38%，接近目标）

但存在：
- 文档描述与代码实现不一致
- 部分功能为 placeholder（如 Repair Engine 5/7）
- 缺少公开的性能基准表
- 代码债务累积（app.js 过载、CSS 颜色字面量）

### 解决方案概述

采用6阶段渐进式整改：

**Phase 1**: 统一文档（插件/OFD/模型架构/能力矩阵）  
**Phase 2**: 修复7个P2阻断问题  
**Phase 3**: 补充测试到85%+覆盖率  
**Phase 4**: 建立基准表和样例库  
**Phase 5**: 完成多域模型设计（不实施）  
**Phase 6**: 清理3个P3问题和死代码  

每个阶段有明确的质量门禁，前一阶段未达标不进入下一阶段。

### 预期成果

- ✅ 文档完全一致，无交叉引用冲突
- ✅ 所有P0/P1/P2 issues 关闭
- ✅ 测试覆盖率 ≥ 85%，分支覆盖率 ≥ 80%
- ✅ 公开基准表（正确性、性能、OCR准确率）
- ✅ 多域模型设计文档完成并评审通过
- ✅ 无未说明的 TODO/placeholder
- ✅ 从"有条件通过"升级为"完全通过"

---

## Phase 1: 文档一致性整改（3-4天）

### 目标
解决研究报告指出的所有文档冲突，建立单一事实来源。

### 关键文件清单

需要修改的文档：
- README.md - 更新插件/OFD/模型架构表述
- CONTRIBUTING.md - 删除插件相关规则
- docs/DOCUMENT_MODEL_SCHEMA.md - 标注为"v1 单一模型（当前）"
- docs/MULTI_MODEL_ARCHITECTURE.md - 确认为"目标架构"
- docs/formats/P4_OUTPUTS.md - 统一 OFD 术语
- docs/product/CONVERSION_PATHS.md - 对齐能力矩阵

需要创建的文档：
- docs/OFD_ROADMAP.md - OFD 攻坚计划
- docs/MULTI_DOMAIN_MODEL_DESIGN.md - 多域模型详细设计（Phase 5）

### 任务列表

#### Task 1.1: 统一插件模式决策（0.5天）

**决策**: 废弃插件模式（符合研究报告建议）

**执行步骤**：
1. 搜索所有提及 "plugin"/"插件" 的文档
2. 更新 README.md 确认"不使用插件机制"
3. 更新 CONTRIBUTING.md 删除插件相关规则
4. 在 docs/archive/ 中创建 PLUGIN_DEPRECATION.md 说明废弃原因
5. 验证代码中无 PluginManager 引用

**验收标准**：
- ✅ 所有文档统一表述"不使用插件"
- ✅ 历史文档已归档
- ✅ 无插件相关代码残留

#### Task 1.2: 统一 OFD 路线（0.5天）

**当前表述分析**：
- README: "OFD（早期预览）"
- P4_OUTPUTS.md: "OFD 已升级为 P5 战略攻坚格式"

**统一方案**：
- 术语: "战略攻坚格式、核心 L0 路线"
- 状态: "实验性输入，输出不支持"

**执行步骤**：
1. 更新 README.md OFD 表述
2. 更新 docs/formats/P4_OUTPUTS.md
3. 创建 docs/OFD_ROADMAP.md 说明攻坚计划
4. 验证 public/formats/ofd.js 实现状态

**验收标准**：
- ✅ README 和 P4_OUTPUTS.md 术语一致
- ✅ OFD_ROADMAP.md 明确当前状态和目标
- ✅ 与代码实现对齐

#### Task 1.3: 统一模型架构表述（1天）

**冲突分析**：
- 当前实现: 单一 DocumentModel（DOCUMENT_MODEL_SCHEMA.md v0.2.0）
- 目标架构: 5个规范模型（MULTI_MODEL_ARCHITECTURE.md v0.1.0）
- README: 未明确区分

**统一方案**：
- DOCUMENT_MODEL_SCHEMA.md → 标题改为 "DocumentModel Schema (v1 当前实现)"
- MULTI_MODEL_ARCHITECTURE.md → 确认为 "Multi-Model Architecture (v2 目标架构)"
- README.md → 添加"正在从单模型过渡到多域模型"说明

**执行步骤**：
1. 更新 docs/formats/DOCUMENT_MODEL_SCHEMA.md 标题
2. 在文档顶部添加状态说明："当前生效的单模型架构"
3. 更新 docs/architecture/MULTI_MODEL_ARCHITECTURE.md 标题
4. 在顶部标注："目标架构，Phase 5 设计，Phase 6+ 实施"
5. 更新 README.md 添加架构演进说明
6. 创建转换流程图标注当前/目标架构

**验收标准**：
- ✅ 所有文档明确标注"当前"或"目标"
- ✅ 无"当前/目标"混淆表述
- ✅ 架构演进路径清晰

#### Task 1.4: 对齐能力矩阵（0.5天）

**需要对齐的文档**：
- README.md: 格式支持表（14输入/11输出）
- docs/product/CONVERSION_PATHS.md: 详细路径矩阵
- public/formats/: 实际实现

**执行步骤**：
1. 列出 public/formats/ 下所有格式文件
2. 对照 CONVERSION_PATHS.md 路径矩阵
3. 运行 scripts/conversion-capability-audit-test.js 验证
4. 更新 README.md 格式表（如有差异）
5. 更新 CONVERSION_PATHS.md（如有差异）

**验收标准**：
- ✅ README 和 CONVERSION_PATHS.md 矩阵一致
- ✅ 与代码实现完全对齐
- ✅ conversion-capability-audit-test.js 通过

#### Task 1.5: 验证脚本可执行性（0.5天）

**检查项**：
- ✅ npm run vendor:onnx
- ✅ npm run vendor:paddle
- ✅ npm run samples:generate
- ✅ npm test
- ✅ npm run coverage

**执行步骤**：
1. 逐一运行上述命令
2. 记录执行结果（成功/失败/耗时）
3. 修复失败的命令
4. 更新 README.md 补充使用说明

**验收标准**：
- ✅ 所有 README 提及的命令可执行
- ✅ package.json scripts 与文档一致
- ✅ 无死链或无效命令

### Phase 1 质量门禁

- ✅ 所有文档交叉引用一致
- ✅ README 命令全部可执行
- ✅ 能力矩阵与代码实现对齐
- ✅ 无"当前/目标"混淆表述
- ✅ 代码审核通过：`/code-review --effort low`（文档变更，低审核等级）

---

## Phase 2: 解决 P2 Issues（5-6天）

### 目标
修复7个 P2 阻断性问题，每个问题修复后立即测试。

### P2 Issues 优先级排序

**高优先级**（影响核心功能）：
1. #88 - ZIP data descriptor（影响真实 DOCX/XLSX）
2. #9 - ONNX session 重建（性能关键路径）
3. #129 - tessdata 哈希验证（安全问题）

**中优先级**（代码质量）：
4. #14 - Repair Engine placeholder（诚信问题）
5. #49 - OCR bbox 坐标系（OCR 准确性）

**低优先级**（UI 体验）：
6. #42 - 按钮实现不一致
7. #38 - Design Token 体系

### Issue #88: ZIP data descriptor 支持（1天）

**问题描述**：
- 模块: public/core/zip-container.js
- 现象: 严格模式拒绝 data descriptor，部分真实 DOCX/XLSX 无法读取
- 影响: 用户文档转换失败

**修复方案**：
1. 支持 ZIP data descriptor 读取（bit 3 set in general purpose flag）
2. 添加 Central Directory 交叉校验
3. 扩展测试样例库（包含 data descriptor 的 OOXML）

**技术要点**：
- 检测 general purpose bit flag bit 3
- 从 data descriptor 读取 CRC-32, compressed size, uncompressed size
- 与 Central Directory 条目交叉验证

**测试**：
- 扩展 scripts/format-integrity-test.js
- 添加带 data descriptor 的 DOCX/XLSX 样例
- 验证读取成功且数据完整

**时间**: 1天  
**风险**: 中（核心模块，需要隔离测试）

### Issue #9: ONNX session 复用（1天）

**问题描述**：
- 模块: public/workers/ocr-worker.js
- 现象: 扫描 PDF 每页重建 ONNX session，性能成倍劣化
- 影响: OCR 性能关键路径

**修复方案**：
1. 复用 ONNX session 跨页面
2. 延迟 PDF 打开到 worker 初始化阶段
3. 实现 session 池（最大 3 个并发）

**技术要点**：
- Worker 初始化时创建 session
- 跨页面复用
- 页面处理完成后释放资源（非每页重建）

**测试**：
- 创建 scripts/paddle-ocr-performance-test.js
- 测试多页 PDF OCR 性能
- 验证内存使用和耗时

**时间**: 1天  
**风险**: 中（性能优化，需要基准测试）

### Issue #129: tessdata 哈希验证（0.5天）

**问题描述**：
- 模块: public/core/ocr/model-cache.js（推测路径）
- 现象: 只记录哈希不比对，SHA-256 承诺对 tesseract 不成立
- 影响: 安全问题

**修复方案**：
1. 实现 tessdata 文件 SHA-256 校验
2. 创建 scripts/tessdata.manifest.json（参考 paddleocr-models.manifest.json）
3. 导入失败时拒绝加载并提示用户

**技术要点**：
- 参考现有 paddleocr-models.manifest.json 格式
- 在导入时计算文件哈希
- 与 manifest 中的哈希比对
- 不匹配时抛出错误

**测试**：
- 扩展 scripts/local-security-test.js
- 测试正确哈希通过
- 测试错误哈希拒绝

**时间**: 0.5天  
**风险**: 低（安全增强，明确失败路径）

### Issue #14: Repair Engine placeholder 收缩（0.5天）

**问题描述**：
- 模块: public/core/repair-engine.js, repair-handlers.js
- 现象: 7类修复中5类为 placeholderHandler
- 影响: 宣传不符

**修复方案**（选项B，研究报告建议）：
1. 保留已实现的 2 类（replaceTextRun, selectFallbackRoute）
2. 归档 placeholder 代码（注释说明"未来实现"）
3. 更新文档说明当前支持的修复类型
4. 将未实现功能移入 roadmap

**技术要点**：
- 不删除 placeholderHandler，但明确标注
- 更新 MULTI_MODEL_ARCHITECTURE.md 中的 Repair Engine 说明
- 文档中只宣传已实现功能

**测试**：
- 调整 scripts/repair-engine-test.js 预期
- 验证 2 类修复正常工作
- 确认 5 类 placeholder 正确返回"未实现"

**时间**: 0.5天  
**风险**: 低（诚信修复，不涉及复杂逻辑）

### Issue #49: OCR bbox 坐标系（1天）

**问题描述**：
- 模块: public/core/ocr/paddle-ocr-pipeline.js（推测）
- 现象: deskew 后 bbox 在旋转坐标系，与原图尺寸不匹配
- 影响: OCR 结果准确性

**修复方案**：
1. deskew 后将 bbox 坐标变换回原图坐标系
2. 或：输出中同时记录原图尺寸和旋转后尺寸
3. 添加坐标系变换单元测试

**技术要点**：
- 理解 deskew 旋转矩阵
- 实现逆变换：rotated bbox → original bbox
- 或保留两套坐标系引用

**测试**：
- 扩展 scripts/paddle-ocr-integration-test.js
- 测试旋转图像 OCR
- 验证 bbox 坐标正确

**时间**: 1天  
**风险**: 中（几何变换，需要数学验证）

### Issue #42: 统一按钮实现（0.5天）

**问题描述**：
- 模块: public/styles.css, public/styles/preview.css, public/styles/landing.css
- 现象: 圆角/配色/hover 行为不一致
- 影响: 用户体验

**修复方案**：
1. 统一到一套按钮实现（选择最现代的风格）
2. 删除冗余 CSS 规则
3. 提取为 .btn-primary, .btn-secondary 等语义 class

**技术要点**：
- 选择一套基准样式
- 全局替换其他样式
- 确保所有按钮使用统一 class

**测试**：
- 运行 scripts/ui-accessibility-test.js
- 手动测试主要页面按钮
- 验证 hover/focus/active 状态一致

**时间**: 0.5天  
**风险**: 低（视觉优化）

### Issue #38: Design Token 体系（1天）

**问题描述**：
- 模块: 所有 CSS 文件
- 现象: 148 处颜色字面量，无统一 token 体系
- 影响: 可维护性

**修复方案**：
1. 创建 public/design-tokens.css（CSS Variables）
2. 定义颜色、间距、字号、圆角、阴影 token
3. 全局替换字面量为 var(--token-name)

**技术要点**：
- 提取所有颜色值
- 归类为主色/辅色/背景/边框/文本等
- 定义语义化 token 名称
- 逐文件替换

**测试**：
- 视觉回归测试（手动对比截图）
- 确认样式无变化
- 验证 token 可以全局修改

**时间**: 1天  
**风险**: 中（大量替换，需要仔细验证）

### Phase 2 质量门禁

- ✅ 所有 P2 issues 关闭
- ✅ 相关测试通过
- ✅ 代码审核通过：`/code-review --effort medium`
- ✅ 无新引入的回归问题
- ✅ 性能基准无劣化

---

## Phase 3: 测试覆盖率提升（4-5天）

### 目标
从 81.38% 整体覆盖率提升到 85%+，分支覆盖率从 71.95% 提升到 80%+。

### 当前覆盖率缺口

**整体缺口**: 3.62% ≈ 570 行未覆盖  
**分支缺口**: 8.05% ≈ 360 个分支未覆盖

**预期低覆盖模块**（基于研究报告）：
- public/core/repair-engine.js (placeholder 代码)
- public/formats/ofd-*.js (实验性格式)
- public/workers/ (Worker 通信边界)
- public/app.js 部分分支（2042行，复杂 UI 逻辑）

### 策略

**分层覆盖率目标**：
- 核心模块（public/core/）: ≥ 90%
- 格式模块（public/formats/）: ≥ 85%
- Workers（public/workers/）: ≥ 80%
- UI 逻辑（public/app.js）: ≥ 75%

### Task 3.1: 识别低覆盖率模块（0.5天）

**执行步骤**：
1. 运行 `npm run coverage`
2. 打开 coverage/index.html 分析报告
3. 列出覆盖率低于 70% 的文件
4. 按优先级排序（核心模块优先）
5. 为每个文件制定测试计划

### Task 3.2: 补充核心模块单元测试（2天）

**需要创建的测试文件**：
- scripts/core-binary-utils-test.js
- scripts/core-format-registry-test.js
- scripts/formats-round-trip-test.js（扩展现有）
- scripts/worker-communication-test.js

**每个测试覆盖**：
- 成功路径（happy path）
- 错误处理（try/catch 分支）
- 边界条件（空输入、超大输入、特殊字符）
- 异常输入（null/undefined/错误类型）

**测试模式**：
```javascript
// Arrange - 准备测试数据
const input = createTestInput();

// Act - 执行被测函数
const result = functionUnderTest(input);

// Assert - 验证结果
assert(result.expected === true, "Expected result");
```

### Task 3.3: 分支覆盖率专项提升（1.5天）

**重点测试**：
- if/else 两个分支都执行
- switch 所有 case + default
- 三元运算符两个分支
- 逻辑运算符短路（&&, ||）
- try/catch/finally 全路径

**工具辅助**：
```bash
npm run coverage
# 分析 coverage/lcov-report/ 中未覆盖分支
```

**策略**：
- 为每个未覆盖分支编写专门的测试用例
- 使用边界值和异常输入触发错误分支
- 模拟外部依赖失败（如文件读取、网络请求）

### Task 3.4: 排除死代码或明确标记（0.5天）

**对于无法合理测试的代码**：
- Issue #34 底部质量报告抽屉（死代码）→ 删除
- Repair Engine placeholder → 标记 `/* istanbul ignore next */`
- 实验性格式边缘分支 → 在文档中说明"暂不测试"

**标记语法**：
```javascript
/* istanbul ignore next */
function experimentalFeature() {
  // 实验性代码，暂不测试
}
```

### Task 3.5: 验证覆盖率达标（0.5天）

**执行步骤**：
1. 运行完整测试套件：`npm test`
2. 生成覆盖率报告：`npm run coverage`
3. 验证指标：
   - ✅ 整体覆盖率 ≥ 85%
   - ✅ 分支覆盖率 ≥ 80%
   - ✅ 核心模块覆盖率 ≥ 90%
4. 创建 docs/COVERAGE_REPORT.md 公开报告
5. 提交覆盖率徽章数据

### Phase 3 质量门禁

- ✅ 整体覆盖率 ≥ 85%
- ✅ 分支覆盖率 ≥ 80%
- ✅ 核心模块（core/formats）覆盖率 ≥ 90%
- ✅ 所有测试通过（零失败）
- ✅ 覆盖率报告公开到 docs/COVERAGE_REPORT.md
- ✅ 代码审核通过：`/code-review --effort medium`

---

## Phase 4: 可复现性与基准建设（3-4天）

### 目标
建立公开的性能基准表和结构化样例库，确保第三方可复现。

### Task 4.1: 建立公开基准表（1.5天）

**创建文档**: docs/BENCHMARK.md

**内容结构**：

#### 1. 转换正确性基准
| 转换路径 | 样例数 | 语义等价率 | 结构保真率 | SSIM | 说明 |
|---------|--------|-----------|-----------|------|------|
| MD→HTML | 15 | 99.2% | 98.5% | N/A | 纯文本高保真 |
| DOCX→MD | 10 | 95.3% | 92.1% | N/A | 复杂样式降级 |
| HTML→PDF | 8 | N/A | N/A | 0.96 | 视觉对比 |
| ... | ... | ... | ... | ... | ... |

#### 2. 性能基准
| 场景 | 文件大小 | 耗时 | 内存峰值 | 备注 |
|------|---------|------|---------|------|
| MD→HTML | 1MB | 120ms | 45MB | 纯文本 |
| DOCX→MD | 5MB | 890ms | 128MB | 含图片 |
| OCR (PNG) | 2MB | 3.2s | 256MB | 中英混排 |
| ... | ... | ... | ... | ... |

#### 3. OCR 准确率基准
| 语种 | 场景 | CER | WER | 备注 |
|------|------|-----|-----|------|
| 中文 | 清晰印刷 | 1.2% | 3.5% | PP-OCRv5 |
| 英文 | 清晰印刷 | 0.8% | 2.1% | PP-OCRv5 |
| 中文 | 旋转30° | 3.5% | 8.2% | 含纠偏 |
| ... | ... | ... | ... | ... |

**数据来源**：
- 使用现有 samples/ 和 tests/ 样例
- 运行现有测试脚本记录数据
- 第一版基准只覆盖 P0 路径（5-8 个场景）

**执行步骤**：
1. 选择 P0 转换路径（Markdown ↔ HTML, DOCX → MD, HTML → PDF 等）
2. 运行现有测试并记录指标
3. 计算平均值和置信区间
4. 编写 BENCHMARK.md
5. 添加"v1.0 基准，持续完善中"标注

### Task 4.2: 固化样例库（1天）

**创建目录结构**：
```
samples/
├── corpus/
│   ├── basic/          # P0 路径样例（15个）
│   ├── complex/        # 复杂样式、大文件（10个）
│   ├── edge-cases/     # 边界情况（10个）
│   ├── real-world/     # 真实文档（脱敏）（5个）
│   └── benchmark/      # 基准测试专用（8个）
└── README.md           # 样例说明
```

**每个样例包含**：
- 原始文件（input.*）
- 预期输出（expected-output.*）
- 质量报告基线（quality-report.json）
- 已知限制说明（limitations.md）

**执行步骤**：
1. 从现有 samples/ 提取典型样例
2. 按类别分类
3. 生成预期输出和质量报告
4. 编写 samples/corpus/README.md
5. 创建样例索引

### Task 4.3: 发布第三方依赖 Notice（0.5天）

**创建文件**: THIRD_PARTY_NOTICES.md

**内容**：
- PaddleOCR 3.0 (Apache License 2.0)
- ONNX Runtime (MIT)
- Tesseract.js (Apache License 2.0)
- PDF.js (Apache License 2.0)
- Puppeteer (Apache License 2.0)
- Express (MIT)
- KaTeX (MIT)
- 其他 dependencies 和 devDependencies

**格式**：
```markdown
# Third-Party Notices

## PaddleOCR
- Version: 3.0
- License: Apache License 2.0
- URL: https://github.com/PaddlePaddle/PaddleOCR
- Usage: 本地 OCR 引擎

## ...
```

### Task 4.4: 验证可复现性（1天）

**执行步骤**：
1. 清理环境：删除 node_modules, coverage, .cache 等
2. 从头安装：`npm install`
3. 运行所有 vendor 脚本（如需要）
4. 运行完整测试：`npm test`
5. 运行基准测试并对比 BENCHMARK.md
6. 验证所有 README 命令可执行
7. 记录完整的复现步骤

**复现文档**: 更新 INSTALL.md

### Phase 4 质量门禁

- ✅ BENCHMARK.md 完整且数据可复现
- ✅ 样例库结构化且有文档
- ✅ 所有 README 命令可执行
- ✅ THIRD_PARTY_NOTICES.md 完整
- ✅ 第三方可从零开始复现所有测试

---

## Phase 5: 多域模型架构设计（5-7天）

### 目标
完成多域模型详细设计文档，**不实施代码**（设计阶段）。

### 重要说明

**Phase 5 是纯设计阶段**：
- ✅ 输出：详细设计文档
- ❌ 不输出：代码实现
- 目的：评审通过后在 Phase 6+ 实施

### 背景分析

**当前状态**：
- 已有 MULTI_MODEL_ARCHITECTURE.md (v0.1.0, 2026-05-12)
- 定义了5个规范模型框架
- public/core/models/ 下已有部分新模型文件

**Phase 5 任务**：
- 补充详细设计（路由规则、投影策略、迁移路径）
- 评审设计可行性
- 制定渐进式迁移计划

### Task 5.1: 补充多域模型详细设计（3天）

**创建文档**: docs/MULTI_DOMAIN_MODEL_DESIGN.md

**内容大纲**：

#### 1. 五类域模型详细定义
- SemanticDoc: 字段定义、行内节点、脚注、交叉引用
- WorkbookModel: 单元格、公式、合并、样式
- SlideModel: 形状、布局、备注、母版
- FixedLayoutModel: 页面、文本块、注释、签章
- AssetGraph: 资产管理、引用追踪、溯源

#### 2. 路由规则设计
```javascript
// 伪代码示意
function selectModel(inputFormat, outputFormat) {
  // 语义路径：MD/HTML/DOCX → MD/HTML/DOCX
  if (isSemanticPath(inputFormat, outputFormat)) {
    return SemanticDoc;
  }
  // 表格路径：CSV/XLSX → CSV/XLSX
  else if (isWorkbookPath(inputFormat, outputFormat)) {
    return WorkbookModel;
  }
  // ... 其他路径
}
```

#### 3. 投影与降级策略
| 投影方向 | 损耗等级 | 强制 Warning | 说明 |
|---------|---------|-------------|------|
| SemanticDoc → WorkbookModel | low | MODEL_NO_FORMULA_INFO | 表格无公式 |
| WorkbookModel → SemanticDoc | low | MODEL_STYLE_DROPPED | 样式丢失 |
| SemanticDoc → FixedLayoutModel | medium | MODEL_PAGINATION_AUTO | 自动分页 |
| FixedLayoutModel → SemanticDoc | high | MODEL_TEXT_ORDER_HEURISTIC | 文本顺序启发式 |
| ... | ... | ... | ... |

#### 4. 迁移路径规划

**渐进式迁移（不破坏现有功能）**：

**第一步**: 保持 DocumentModel 为默认，引入域模型作为可选路径
- 在 public/core/models/ 下完善新文件
- 初期仅用于新增转换路径

**第二步**: 重构 format registry，支持多模型路由
- format-registry.js 添加 preferredModel 字段
- 创建 conversion-router.js 实现模型选择逻辑

**第三步**: 逐条转换路径迁移
- 优先级: 表格路径 → 幻灯片路径 → 语义路径 → 固定版式路径
- 每迁移一条路径，运行完整测试套件
- 保持旧路径兼容性

**第四步**: 废弃单一 DocumentModel（Phase 6+ 任务）
- 所有路径迁移完成后执行
- 归档 document-model.js

#### 5. 向后兼容性

**DocumentModel 兼容别名**：
- createDocumentModel() → createSemanticDoc()
- 旧 API 保持不变，内部转新结构
- 外部调用方零改动

### Task 5.2: 设计评审（1天）

**评审方式**：
- 使用 `/code-review --effort high` 审查设计文档
- 检查设计完整性、可行性、风险点
- 评估工作量和技术难度

**评审维度**：
- ✅ 模型定义清晰无歧义
- ✅ 路由规则覆盖所有路径
- ✅ 投影策略明确损耗和 warning
- ✅ 迁移路径可行且安全
- ✅ 向后兼容性保证

### Task 5.3: 更新文档体系（1天）

**文档变更**：
1. DOCUMENT_MODEL_SCHEMA.md → 标题改为"v1 单一模型（当前实现，Phase 5 后废弃）"
2. MULTI_MODEL_ARCHITECTURE.md → 标题改为"v2 多域模型（目标架构，Phase 6+ 实施）"
3. 创建 docs/V2_MIGRATION_GUIDE.md - 迁移指南
4. 更新 README.md 架构图
5. 更新 CONVERSION_POLICY.md 投影规则

### Phase 5 质量门禁

- ✅ MULTI_DOMAIN_MODEL_DESIGN.md 完整详细
- ✅ 设计评审通过（`/code-review --effort high`）
- ✅ 迁移路径可行性确认
- ✅ 文档体系更新完成
- ✅ **不开始实现**（Phase 6+ 任务）

---

## Phase 6: 解决剩余 P3 Issues + 优化（2-3天）

### 目标
清理3个 P3 优化问题和代码债务。

### P3 Issues 清单

#### Issue #123: blockSearchText 与 markdown 源不匹配（0.5天）

**问题描述**：
- 模块: public/core/document-audit.js
- 现象: table 块 sourceSpan 为 null，list 块 endOffset 虚增
- 影响: 不影响核心功能，但影响审计准确性

**修复方案**：
- 修正 sourceSpan 计算逻辑
- 为 table 块正确分配 sourceSpan
- 修正 list 块 endOffset

**测试**：
- 扩展 document-audit 测试
- 验证所有块类型的 sourceSpan 正确

**优先级**: 低（不影响核心功能）

#### Issue #40: UI 组件状态覆盖缺口（0.5天）

**问题描述**：
- 模块: public/app.js, CSS 文件
- 现象: 无 loading/hover/focus 视觉反馈
- 影响: 用户体验

**修复方案**：
- 补充 CSS 状态类（:hover, :focus, :active）
- 添加 loading 动画
- 确保所有交互元素有视觉反馈

**测试**：
- 手动测试所有按钮和输入框
- 验证状态切换流畅

**优先级**: 低（体验优化）

#### Issue #34: 底部质量报告抽屉死代码（0.5天）

**问题描述**：
- 模块: public/app.js, CSS 文件
- 现象: DOM 不存在，180 行死 CSS
- 影响: 代码债务

**修复方案**（选项B，研究报告建议）：
- 删除死代码（app.js 和 CSS）
- 将功能移入 roadmap
- 清理相关引用

**测试**：
- 验证删除后无运行时错误
- 确认 UI 无变化

**优先级**: 低（清理债务）

### Task 6.1: 清理代码债务（0.5天）

**清理项**：
- 删除未使用的函数和变量
- 删除注释掉的代码
- 删除死 CSS 规则
- 统一代码风格

**工具**：
- ESLint
- 手动审查

### Task 6.2: 最终验证（0.5天）

**验证清单**：
- ✅ 所有测试通过：`npm test`
- ✅ 覆盖率达标：≥ 85%
- ✅ 所有 issues 关闭或归档
- ✅ 文档完整一致
- ✅ 无 TODO 或 placeholder（除明确标注的）
- ✅ 代码审核通过：`/code-review --effort high`

### Phase 6 质量门禁

- ✅ 所有 P3 issues 关闭或明确标记为 roadmap
- ✅ 代码清理完成
- ✅ 无新增 TODO 或 placeholder
- ✅ 最终验证全部通过

---

## 最终验收标准

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
- ✅ 样例库结构化（4 类场景 × 40+ 样例）
- ✅ vendor 脚本完整
- ✅ THIRD_PARTY_NOTICES.md 完整

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

## 里程碑与时间线

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

## 风险与应对

### 风险 1: 文档整改触发连锁修改
**概率**: 高  
**影响**: 中等  
**应对**: 第一轮只修复明确指出的5个冲突，建立影响分析检查清单

### 风险 2: P2 Issues 修复引入新 bug
**概率**: 中等  
**影响**: 高  
**应对**: 每个 issue 修复后立即运行完整测试套件，#88 和 #9 在 worktree 中隔离修复

### 风险 3: 测试覆盖率难以达到 85%
**概率**: 中等  
**影响**: 中等  
**应对**: 分层目标（核心90%/UI 75%），对死代码标记 `/* istanbul ignore */`

### 风险 4: 基准测试数据收集耗时
**概率**: 高  
**影响**: 低  
**应对**: 第一版基准只覆盖 P0 路径（5-8场景），使用现有样例

### 风险 5: 多域模型设计分歧
**概率**: 低  
**影响**: 高  
**应对**: Phase 5 只做设计不实施，提供多个备选方案，通过代码审核验证

---

## 执行原则

### DevDocsKit 规范遵循

本计划严格遵循 CLAUDE.md 和 DevDocsKit v2.1.1：
- ✅ 启动顺序明确
- ✅ 模块化开发约束
- ✅ 小步提交（一个 commit 一个意图）
- ✅ 阶段代码审核（每个 Phase 结束执行 `/code-review`）
- ✅ Issue 标签体系（P0-P3 + 类型 + 模块）
- ✅ 质量门禁（覆盖率 ≥ 80%，分支 ≥ 70%，目标更高）

### 质量红线（不可突破）

- ❌ 不覆盖用户未要求修改的内容
- ❌ 不删除未确认用途的文件
- ❌ 不把未验证的猜测写成完成结论
- ❌ 不跳过阶段代码审核、Issue 报告、覆盖率门禁
- ❌ 不在测试未通过时宣称任务完成
- ❌ 不修改资源预算而不说明理由

### 收尾要求

每个 Phase 完成后必须提交收尾报告，包含：
- 修改文件清单
- 验证结果（测试/覆盖率/基准）
- 代码审核结果和 Issue 创建情况
- 文档更新
- 提交信息和 hash
- 剩余风险与待办

---

## 关键决策点

### 需要用户确认的选项

1. **Issue #14 Repair Engine**：
   - 选项 A: 完整实现 7 类修复
   - 选项 B: 收缩宣传，只保留已实现的 2 类（推荐）

2. **Issue #34 底部质量报告抽屉**：
   - 选项 A: 实现质量报告面板
   - 选项 B: 删除死代码，将功能移入 roadmap（推荐）

3. **Phase 5 实施时机**：
   - 本计划 Phase 5 只做设计，Phase 6+ 实施
   - 用户可选择提前实施或延后

**所有推荐均基于研究报告建议："不过度超前"、"节制开发"**

---

## 总结

本计划将在29天内完成Trans2Former从"有条件通过"到"完全通过"的系统性整改：

**核心价值**：
1. 文档与代码完全一致，可信度提升
2. 所有阻断问题修复，功能完整
3. 测试覆盖率达标，质量保证
4. 公开基准表和样例库，可复现
5. 架构演进路径清晰，可持续发展

**执行保障**：
- 6个明确阶段，每阶段有质量门禁
- 严格遵循 DevDocsKit 规范
- 代码审核和 Issue 管理全覆盖
- 风险识别和应对措施完备

**预期成果**：
- 项目验收从"有条件"升级为"完全通过"
- 建立成熟的工程实践体系
- 为多域模型架构升级奠定基础
- 提升社区可信度和参与度

---

**计划状态**: ✅ 完成，待用户审批  
**下一步**: 执行 Phase 1 或根据用户反馈调整计划
