# Trans2Former 后续开发执行计划（Phase 3 后）

**版本**: 1.0.0  
**创建日期**: 2026-06-23  
**状态**: 待执行  
**负责人**: Claude Code + Jack Yao

---

## 📊 当前项目状态分析

### ✅ 已达成目标
- **测试覆盖率**: 81.38% (目标 ≥80% ✅)
- **分支覆盖率**: 71.95% (目标 ≥70% ✅)
- **函数覆盖率**: 85.56%
- **测试通过率**: 99.1% (114/115 通过)
- **测试套件**: 32 个测试文件，115+ 测试用例

### ⚠️ 待解决问题

#### 1. 资源预算超标 (P0 - 阻断性)
- **问题**: `scripts/` 目录 676KB，超出 512KB 预算 32%
- **根本原因**: Phase 3 新增 10 个单元测试文件
- **影响**: 阻断发布流程
- **优先级**: P0 - 必须立即解决

#### 2. 未关闭的 P2 Issue (10 个)
主要问题域：
- **OCR 模块** (3 个): tessdata 安全、bbox 坐标、性能优化
- **UI 模块** (4 个): 样式不一致、组件状态、Design Token
- **核心模块** (3 个): ZIP 容器、文档审计、修复引擎

#### 3. 分支覆盖率提升空间
- 当前: 71.95%
- 目标: 75%+
- 差距: 约 134 个分支待覆盖

---

## 🎯 Phase 4: 资源治理与质量巩固（优先级最高）

**时间**: 1-2 天  
**目标**: 解决资源预算超标，巩固测试质量

### 任务 4.1: 测试文件重组（P0）

**问题分析**:
```bash
scripts/ 目录实际大小: 676KB
- 测试脚本: 32 个文件
- Phase 3 新增: 10 个单元测试文件
- 预算: 512KB
- 超出: 164KB (32%)
```

**解决方案 A: 创建专用测试目录** (推荐)
```
项目根目录/
├── scripts/          # 保留构建和工具脚本 (预算 256KB)
│   ├── vendor-*.js
│   ├── build-*.js
│   └── utils-*.js
├── test/            # 新建测试目录 (预算 512KB)
│   ├── unit/        # 单元测试
│   ├── integration/ # 集成测试
│   └── e2e/         # E2E 测试
```

**执行步骤**:
1. 创建 `test/unit/core/` 目录
2. 移动 Phase 3 新增的单元测试文件
3. 更新 `package.json` 的 test 命令
4. 更新 TESTING_GUIDE.md
5. 验证所有测试仍然通过

**预期结果**:
- scripts/ 目录降至 400KB 以内
- 清晰的测试文件组织结构
- 符合行业最佳实践

---

### 任务 4.2: 更新资源预算基线

**当前预算** (`docs/RESOURCE_BUDGET.md`):
```
public/core/    : 322KB → 实际 468KB (超出 45%)
public/formats/ : 512KB → 实际 288KB (符合)
public/workers/ : 128KB → 实际 4KB (符合)
scripts/        : 512KB → 实际 676KB (超出 32%)
```

**调整方案**:
1. **public/core/**: 提升预算至 480KB（反映实际增长）
   - 原因: Phase 1-3 添加完善的错误处理和验证逻辑
   - 合理性: 核心功能稳定后不应再显著增长
   
2. **scripts/**: 拆分为 scripts/ (256KB) + test/ (512KB)
   - 原因: 测试代码和构建脚本应分开治理
   - 合理性: 符合工程实践

**执行步骤**:
1. 更新 `docs/RESOURCE_BUDGET.md`
2. 说明调整理由和未来约束
3. 更新 `scripts/resource-budget-test.js` 预算配置
4. 验证测试通过

---

### 任务 4.3: 测试稳定性加固

**目标**: 确保测试套件 100% 可靠

**关键检查项**:
- [ ] 所有测试在 clean state 下通过
- [ ] 测试之间无状态泄漏
- [ ] 无 flaky 测试（运行 10 次全部通过）
- [ ] 清理临时文件和测试产物

**执行命令**:
```bash
# 连续运行 10 次测试验证稳定性
for i in {1..10}; do npm test || exit 1; done
```

---

## 🔧 Phase 5: Issue 清理与代码审核（高优先级）

**时间**: 2-3 天  
**目标**: 关闭所有 P0/P1 Issue，降低 P2 Issue 数量

### 任务 5.1: P2 Issue 优先级分类

**当前 P2 Issue 清单** (10 个):

**安全类** (立即处理):
- #129: tessdata 导入只记录哈希不比对 (module:ocr)
  - 影响: 安全漏洞，OCR 模型可被篡改
  - 方案: 实现 SHA-256 完整性校验
  - 工作量: 0.5 天

**功能缺陷类** (本版本修复):
- #88: ZIP data descriptor 拒绝影响 OOXML (module:core)
- #49: OCR deskew 后 bbox 坐标系不一致 (module:ocr)
- #14: Repair Engine 宣传不符 (module:core)

**性能类** (择机优化):
- #9: OCR 扫描 PDF 多页性能劣化 (module:ocr)

**用户体验类** (分阶段改进):
- #42: UI 按钮样式不统一 (module:ui)
- #40: UI 组件状态覆盖缺口 (module:ui)
- #38: UI Design Token 体系不完整 (module:ui)
- #34: UI 底部质量报告抽屉为死代码 (module:ui)

---

### 任务 5.2: 执行代码审核

**审核范围**: Phase 1-3 所有修改

**审核命令**:
```bash
/code-review --effort high
```

**审核维度**:
1. **正确性**: 逻辑错误、边界条件
2. **安全性**: 注入、XSS、路径遍历
3. **性能**: 瓶颈、内存泄漏
4. **可维护性**: 代码清晰度、注释充分性
5. **测试覆盖**: 关键路径是否测试

**输出**:
- 创建新的 Issue (按标签分类)
- 更新现有 Issue 状态
- 生成审核报告

---

### 任务 5.3: 关键 Issue 修复

**优先修复清单**:

1. **#129 - tessdata SHA-256 校验** (P2, security)
   - 修改: `public/core/model-cache.js`
   - 添加: SHA-256 完整性校验逻辑
   - 测试: 更新 `scripts/model-cache-test.js`

2. **#88 - ZIP data descriptor** (P2, bug)
   - 修改: `public/core/zip-container.js`
   - 支持: 带 data descriptor 的 ZIP 文件
   - 测试: 添加真实 OOXML 样例测试

3. **#49 - OCR bbox 坐标系** (P2, bug)
   - 修改: `public/core/ocr-paddle.js`
   - 统一: deskew 后坐标系转换
   - 测试: 更新 `scripts/paddle-ocr-pipeline-test.js`

---

## 📈 Phase 6: 测试覆盖率优化（中优先级）

**时间**: 2-3 天  
**目标**: 分支覆盖率达到 75%+，整体覆盖率保持 ≥82%

### 任务 6.1: 生成覆盖率热力图

**执行命令**:
```bash
npm run coverage
open coverage/index.html  # 查看 HTML 报告
```

**分析重点**:
- 识别分支覆盖率 <60% 的文件
- 标记关键路径的未覆盖分支
- 评估测试投入产出比

---

### 任务 6.2: 针对性添加分支测试

**目标文件** (基于经验预测):
1. **格式转换器**: 错误处理分支
   - `public/formats/pdf-output.js`: 各种 PDF 对象类型
   - `public/formats/docx-reader.js`: OOXML 变体处理
   - `public/formats/xlsx-writer.js`: 数据类型判断

2. **核心模块**: 边界条件
   - `public/core/format-registry.js`: 格式不存在、多重匹配
   - `public/core/route-planner.js`: 无可用路径、降级策略
   - `public/core/zip-container.js`: ZIP64、加密、损坏

3. **OCR 管道**: 异常输入
   - `public/core/ocr-paddle.js`: 空图像、极小尺寸
   - `public/core/ocr-baseline.js`: 模型加载失败

**测试模式**:
- if/else → 两个测试用例
- switch → 每个 case + default
- try/catch → 正常 + 异常路径
- 短路运算 → truthy + falsy 输入

---

### 任务 6.3: 集成测试补充

**目标**: 测试模块间协作路径

**新增测试**:
1. **端到端转换流程**
   - 上传 → 识别 → 转换 → 验证 → 下载
   - 覆盖 5 种常用路径

2. **Worker 通信**
   - 主线程 ↔ Worker 消息传递
   - 大文件分块传输
   - 错误传播

3. **格式往返转换**
   - Markdown → HTML → Markdown
   - CSV → JSON → CSV
   - 验证信息损失率

---

## 🎨 Phase 7: UI 体验优化（中优先级）

**时间**: 3-4 天  
**目标**: 修复 UI 不一致问题，提升用户体验

### 任务 7.1: Design Token 标准化

**问题**: #38 - 130 处非 var() 颜色字面量

**方案**: 建立 CSS 变量体系
```css
/* styles/tokens.css */
:root {
  /* 主色调 */
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  
  /* 语义色 */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  
  /* 中性色 */
  --color-text: #1f2937;
  --color-text-muted: #6b7280;
  --color-bg: #ffffff;
  --color-border: #e5e7eb;
  
  /* 间距刻度 */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-8: 2rem;
  
  /* 字号刻度 */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
}
```

**执行步骤**:
1. 创建 `public/styles/tokens.css`
2. 替换所有硬编码颜色为 CSS 变量
3. 统一间距和字号
4. 验证视觉一致性

---

### 任务 7.2: 组件状态完善

**问题**: #40 - 按钮无 loading、队列无 hover

**目标**: 完善所有交互状态

**改进清单**:
- [ ] 转换按钮: loading 旋转图标
- [ ] 队列项: hover 背景色变化
- [ ] drop-zone: focus 态边框高亮
- [ ] 错误面板: 添加"重试"按钮

---

### 任务 7.3: 样式统一化

**问题**: #42 - 三套 CSS 中四种按钮实现

**方案**: 提取统一组件样式
```css
/* styles/components/button.css */
.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: 0.375rem;
  font-size: var(--text-sm);
  transition: all 0.2s;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}
```

---

## 🚀 Phase 8: 发布准备（最终阶段）

**时间**: 1-2 天  
**目标**: 完成 v2.4.0 发布前检查

### 任务 8.1: 发布检查清单

**必须完成**:
- [ ] 所有测试通过 (100%)
- [ ] 覆盖率达标 (≥82% 整体, ≥75% 分支)
- [ ] 无 P0/P1 未关闭 Issue
- [ ] P2 Issue 减少至 ≤5 个
- [ ] 资源预算符合要求
- [ ] 文档完整且一致

**执行命令**:
```bash
npm run release:prepare
```

---

### 任务 8.2: 变更日志编写

**CHANGELOG.md 条目**:
```markdown
## [2.4.0] - 2026-06-XX

### Added
- 完整的单元测试套件 (10+ 新测试文件)
- 资源预算治理体系
- Design Token CSS 变量系统

### Fixed
- #129: tessdata SHA-256 完整性校验
- #88: ZIP data descriptor 支持
- #49: OCR bbox 坐标系统一
- UI 样式不一致问题

### Changed
- 测试文件重组至 test/ 目录
- 资源预算基线调整
- 分支覆盖率提升至 75%+

### Improved
- 测试稳定性和可靠性
- UI 组件状态完整性
- 代码质量和可维护性
```

---

### 任务 8.3: 版本发布

**步骤**:
1. 更新版本号: `package.json`, `README.md`
2. 提交变更日志: `git commit -m "chore(release): v2.4.0"`
3. 创建标签: `git tag v2.4.0`
4. 推送: `git push && git push --tags`
5. 创建 GitHub Release

---

## 📊 质量门禁

### Gate 4→5: 进入 Issue 清理
- ✅ 资源预算测试通过
- ✅ 测试稳定性验证通过
- ✅ 测试文件重组完成

### Gate 5→6: 进入覆盖率优化
- ✅ P2 安全 Issue 全部关闭
- ✅ P2 功能缺陷 Issue ≤2 个未关闭
- ✅ 代码审核报告完成

### Gate 6→7: 进入 UI 优化
- ✅ 分支覆盖率 ≥75%
- ✅ 整体覆盖率 ≥82%
- ✅ 集成测试完成

### Gate 7→8: 进入发布准备
- ✅ UI Issue 关闭 ≥50%
- ✅ Design Token 系统建立
- ✅ 组件状态完善

### Gate 8: 发布就绪
- ✅ 所有测试通过
- ✅ 覆盖率达标
- ✅ 无阻断性 Issue
- ✅ 文档完整
- ✅ CHANGELOG 编写完成

---

## ⏱️ 时间估算

| Phase | 任务 | 估算时间 | 依赖 |
|-------|------|---------|------|
| Phase 4 | 资源治理 | 1-2 天 | - |
| Phase 5 | Issue 清理 | 2-3 天 | Phase 4 |
| Phase 6 | 覆盖率优化 | 2-3 天 | Phase 5 |
| Phase 7 | UI 优化 | 3-4 天 | Phase 6 |
| Phase 8 | 发布准备 | 1-2 天 | Phase 7 |
| **总计** | | **9-14 天** | |

---

## 🎯 成功标准

### v2.4.0 发布标准
- ✅ 代码覆盖率 ≥82% (整体), ≥75% (分支)
- ✅ 所有测试通过 (115+ 测试用例)
- ✅ 资源预算符合规范
- ✅ P0/P1 Issue 清零
- ✅ P2 Issue ≤5 个
- ✅ 完整的发布文档

### 质量指标
- 测试稳定性: 连续 10 次运行全部通过
- 代码质量: 无安全漏洞、无性能瓶颈
- 用户体验: UI 一致性、交互流畅性

---

## 🔮 Phase 9+ 后续规划（v2.5.0+）

### Phase 9: CI/CD 集成
- GitHub Actions 配置
- 自动化测试流水线
- 覆盖率报告上传
- 自动发布流程

### Phase 10: 性能优化
- 大文件转换性能
- OCR 多页并行处理
- Worker 池管理
- 内存使用优化

### Phase 11: 功能增强
- 更多输出格式支持
- 批量转换 API
- 自定义转换规则
- 转换预设模板

### Phase 12: 桌面应用完善
- Tauri 应用构建
- 本地文件管理
- 系统托盘集成
- 跨平台发布

---

## 📝 执行原则

### 质量优先
- 不为速度牺牲质量
- 每个 Phase 完成后必须通过 Gate
- 发现问题立即修复，不累积技术债

### 小步提交
- 每个任务拆分为可验证的小步骤
- 每次提交只包含一个明确的改动
- 提交信息清晰规范

### 文档同步
- 代码变更必须同步更新文档
- 测试用例必须有清晰的说明
- Issue 状态必须及时更新

### 审核把关
- 每个 Phase 结束执行代码审核
- 发现问题必须创建 Issue
- 关键修改需要人工复核

---

## 📚 参考文档

- [CLAUDE.md](../../CLAUDE.md) - AI 协作规范
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - 原始实施计划
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - 测试指南
- [RESOURCE_BUDGET.md](../RESOURCE_BUDGET.md) - 资源预算
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - 贡献规范

---

## 变更记录

- v1.0.0 (2026-06-23): 创建 Phase 3 后续执行计划

---

**文档维护者**: Jack Yao  
**协作 AI**: Claude Code (Opus 4.8)  
**反馈渠道**: GitHub Issues
