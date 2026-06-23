# Trans2Former 后续开发路线图 - 执行摘要

**完整文档**: [POST_RESEARCH_ROADMAP.md](./POST_RESEARCH_ROADMAP.md)  
**创建日期**: 2026-06-23  
**总工期**: 29天（6周）

---

## 一、核心问题（研究报告指出）

| 问题类型 | 评分 | 状态 |
|---------|------|------|
| 文档一致性 | 5/10 | ❌ 插件/OFD/模型/脚本冲突 |
| 可复现性 | 6/10 | ⚠️ 部分命令未声明 |
| 性能证据 | 5/10 | ⚠️ 无公开基准表 |

**研究报告结论**: "有条件通过阶段性验收"

---

## 二、优先级排序（按影响验收可信度）

```
高 → 统一文档状态（5个冲突）
高 → 解决P2 Issues（7个阻塞问题）
高 → 补齐测试覆盖率（81.38% → 85%+）
中 → 建立公开基准（正确性、性能、OCR）
中 → 多域模型设计（单模型 → 多域）
低 → P3 Issues清理（3个优化项）
```

---

## 三、6个开发阶段

### Phase 1: 文档一致性整改（3-4天）✨ 最高优先级

**解决5个冲突点**:
1. ✅ 插件模式：废弃，归档文档
2. ✅ OFD路线：明确"实验性输入，输出不支持"
3. ✅ 模型架构：区分"当前v1单模型"与"目标多域模型"
4. ✅ 脚本声明：补齐 `vendor:onnx/paddle`, `samples:generate`
5. ✅ 能力矩阵：统一README与CONVERSION_PATHS.md

**验收**: 文档无冲突、命令100%可执行

---

### Phase 2: 解决P2 Issues（5-6天）🔥 阻塞发布

| Issue | 模块 | 问题 | 优先级 |
|-------|------|------|--------|
| #129 | ocr | tessdata哈希不验证 | 高（安全）|
| #88 | core | ZIP descriptor拒绝真实OOXML | 高（兼容）|
| #9 | ocr | 每页重建ONNX session | 高（性能）|
| #49 | ocr | deskew坐标系不一致 | 中高 |
| #42 | ui | 按钮四种不一致实现 | 中 |
| #38 | ui | 130处颜色字面量 | 中 |
| #14 | core | Repair Engine 5/7为placeholder | 中 |

**验收**: 所有P2 issues关闭、代码审核通过

---

### Phase 3: 测试覆盖率提升（4-5天）

**当前**: 81.38% 整体，71.95% 分支  
**目标**: 85%+ 整体，80%+ 分支

**行动**:
- 识别低覆盖率模块（repair-engine, ofd, workers）
- 补充核心模块单元测试
- 分支覆盖率专项（if/else、switch、try/catch）
- 排除死代码（Issue #34 质量报告抽屉）

**验收**: 覆盖率报告公开到 `docs/COVERAGE_REPORT.md`

---

### Phase 4: 可复现性与基准建设（3-4天）

**建立3类基准表**:
1. **转换正确性**: MD→HTML 99.2%，DOCX→MD 95.3%
2. **性能基准**: 1MB MD→HTML 120ms，5MB DOCX→MD 890ms
3. **OCR准确率**: 中文清晰印刷 CER 1.2%

**补齐内容**:
- vendor 脚本（onnx, paddle, samples）
- 样例库结构化（basic/complex/edge-cases/benchmark）
- 第三方依赖 Notice（PaddleOCR, ONNX Runtime, Tesseract.js）

**验收**: 基准可复现、所有README命令可执行

---

### Phase 5: 多域模型架构迁移设计（5-7天）📐 设计阶段

**五类域模型**:
- SemanticDoc（MD/HTML/TXT/DOCX正文）
- WorkbookModel（XLSX/CSV）
- SlideModel（PPTX）
- FixedLayoutModel（PDF页对象）
- AssetGraph（资源引用图）

**迁移策略**: 渐进式，不破坏现有功能
1. 保持DocumentModel为默认
2. 引入域模型作为可选路径
3. 逐条转换路径迁移
4. Phase 6+废弃单一模型

**验收**: 设计文档完成、设计评审通过（**本阶段不实施**）

---

### Phase 6: P3 Issues + 代码清理（2-3天）

- Issue #123: blockSearchText修正
- Issue #40: UI状态补充（loading/hover/focus）
- Issue #34: 删除质量报告抽屉死代码

**验收**: 所有issues关闭或归档、无TODO/placeholder

---

## 四、里程碑

| 时间点 | 里程碑 | 关键交付物 |
|--------|--------|-----------|
| 第4天 | M1: 文档一致性完成 | 统一文档体系 |
| 第10天 | M2: P2 Issues清零 | 7个关键问题修复 |
| 第15天 | M3: 测试覆盖率达标 | 85%+ 覆盖率 |
| 第19天 | M4: 可复现性完善 | 基准表、样例库 |
| 第26天 | M5: 多域模型设计 | 设计文档、迁移计划 |
| 第29天 | M6: 项目完成 | 所有issues关闭 |

---

## 五、质量门禁

### 最终验收标准

**功能完整性**:
- ✅ 所有P0/P1/P2 issues关闭
- ✅ P3 issues关闭或明确roadmap

**质量指标**:
- ✅ 测试覆盖率≥85%（整体）、≥80%（分支）
- ✅ 核心模块覆盖率≥90%
- ✅ 所有测试通过（零失败）

**文档一致性**:
- ✅ 无交叉引用冲突
- ✅ README命令100%可执行
- ✅ "当前/目标"架构明确区分

**可复现性**:
- ✅ 基准表公开（3类 × 8+ 场景）
- ✅ 样例库结构化（4类 × 15+ 样例）
- ✅ vendor脚本完整
- ✅ 第三方notice完整

**架构演进**:
- ✅ 多域模型设计完成
- ✅ 迁移路径规划清晰

---

## 六、关键决策

### 决策1: 废弃插件模式 ✅
- **理由**: 研究报告认为"增强能力直接并入核心"更符合产品路线
- **行动**: 归档PLUGIN_SECURITY_MODEL.md，删除PluginManager逻辑

### 决策2: Repair Engine收缩宣传 ✅
- **理由**: 7类修复中5类为placeholder，不符合"不过度超前"原则
- **行动**: 只保留已实现的2类，未实现功能移入roadmap

### 决策3: 多域模型渐进式迁移 ✅
- **理由**: 不破坏现有功能，降低风险
- **行动**: Phase 5只做设计，Phase 6+逐条路径迁移

### 决策4: 删除质量报告抽屉死代码 ✅
- **理由**: DOM不存在，180行死CSS，无必要实现
- **行动**: 清理代码，将功能移入long-term roadmap

---

## 七、风险提示

| 风险 | 概率 | 应对 |
|------|------|------|
| 文档整改连锁修改 | 高 | 第一轮只修复5个明确冲突 |
| P2修复引入新bug | 中 | 每个issue修复后运行完整测试 |
| 覆盖率难达85% | 中 | 分层目标（核心90%，UI 75%）|
| 基准收集耗时 | 高 | 第一版只覆盖P0路径 |
| 多域模型设计分歧 | 低 | Phase 5只做设计，提供备选方案 |

---

## 八、后续工作（Phase 7+）

**短期（1-2个月）**:
- 实施多域模型迁移
- DOCX/PPTX高保真增强
- OFD输出支持

**中期（3-6个月）**:
- 社区建设
- 性能优化
- 国际化

**长期（6-12个月）**:
- Web版本发布
- 企业版功能
- AI增强

---

## 九、快速启动

### 立即开始 Phase 1

```bash
# 1. 归档插件文档
mkdir -p docs/archive
mv docs/PLUGIN_SECURITY_MODEL.md docs/archive/

# 2. 补齐脚本声明（编辑 package.json）
# 添加: "vendor:onnx", "vendor:paddle", "samples:generate"

# 3. 检查文档冲突
grep -r "插件\|plugin\|OFD\|DocumentModel" docs/

# 4. 运行测试验证
npm test
```

### 监控进度

```bash
# 查看issues状态
gh issue list --label P2

# 查看覆盖率
npm run coverage
open coverage/index.html

# 检查文档一致性
npm run test | grep docs-test
```

---

**完整计划**: 查看 [POST_RESEARCH_ROADMAP.md](./POST_RESEARCH_ROADMAP.md)  
**当前状态**: ✅ 规划完成，待执行  
**下一步**: 开始 Phase 1 - 文档一致性整改
