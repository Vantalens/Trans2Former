# Issue 修复计划

**创建日期**: 2026-06-23  
**状态**: 准备执行  
**总数**: 10 个 Issue

---

## 📊 Issue 分类

### 按严重性
- **P2** (必须修复): 7 个
- **P3** (建议修复): 3 个

### 按类型
- **Security** (安全): 1 个
- **Bug** (缺陷): 4 个
- **Performance** (性能): 1 个
- **Refactor** (重构): 2 个
- **UX** (用户体验): 2 个

### 按模块
- **OCR**: 3 个
- **UI**: 4 个
- **Core**: 3 个

---

## 🎯 修复顺序（按优先级）

### 第一批：P2 安全和关键 Bug（必须立即修复）

#### 1. #129 - tessdata SHA-256 校验 (P2, security, module:ocr)
**问题**: tessdata 导入只记录哈希不比对，存在安全漏洞
**影响**: OCR 模型可能被篡改
**工作量**: 0.5 天
**优先级**: 🔴 最高

**修复方案**:
- 文件: `public/core/model-cache.js`
- 添加 SHA-256 完整性校验
- 更新测试: `scripts/model-cache-test.js`

---

#### 2. #88 - ZIP data descriptor 支持 (P2, bug, module:core)
**问题**: data descriptor 拒绝影响真实世界 OOXML
**影响**: 某些 DOCX/XLSX 文件无法打开
**工作量**: 0.5 天
**优先级**: 🟠 高

**修复方案**:
- 文件: `public/core/zip-container.js`
- 支持带 data descriptor 的 ZIP 文件
- 添加真实 OOXML 测试样例

---

#### 3. #49 - OCR bbox 坐标系不一致 (P2, bug, module:ocr)
**问题**: deskew 后 bbox 坐标系与页面尺寸不一致
**影响**: OCR 结果位置标注不准确
**工作量**: 0.5 天
**优先级**: 🟠 高

**修复方案**:
- 文件: `public/core/ocr-paddle.js`
- 统一 deskew 后的坐标系转换
- 更新测试: `scripts/paddle-ocr-pipeline-test.js`

---

#### 4. #14 - Repair Engine 功能不完整 (P2, bug, module:core)
**问题**: 7 类修复动作中 5 类为 placeholder
**影响**: 修复引擎宣传不符，用户期望落空
**工作量**: 1 天
**优先级**: 🟡 中

**修复方案**:
- 文件: `public/core/repair-engine.js`
- 实现缺失的修复动作
- 或更新文档说明当前能力

---

### 第二批：P2 性能和重构（影响用户体验）

#### 5. #9 - OCR 多页性能劣化 (P2, performance, module:ocr)
**问题**: 每页重建 3 个 ONNX session
**影响**: 多页 PDF 转换性能成倍下降
**工作量**: 1 天
**优先级**: 🟡 中

**修复方案**:
- 文件: `public/core/ocr-paddle.js`, `public/core/paddle-ocr-engine.js`
- 复用 ONNX session
- 缓存打开的 PDF 文档

---

#### 6. #38 - Design Token 体系 (P2, refactor, module:ui)
**问题**: 130 处非 var() 颜色字面量
**影响**: UI 维护困难，样式不一致
**工作量**: 1 天
**优先级**: 🟡 中

**修复方案**:
- 创建: `public/styles/tokens.css`
- 替换所有硬编码颜色为 CSS 变量
- 建立完整的 Design Token 体系

---

#### 7. #42 - UI 按钮样式统一 (P2, refactor, module:ui)
**问题**: 三套 CSS 中四种按钮实现
**影响**: UI 不一致
**工作量**: 0.5 天
**优先级**: 🟡 中

**修复方案**:
- 创建: `public/styles/components/button.css`
- 统一按钮样式
- 提取通用组件类

---

### 第三批：P3 用户体验优化（可选）

#### 8. #40 - UI 组件状态完善 (P3, ux, module:ui)
**问题**: 转换按钮无 loading、队列无 hover
**影响**: 交互反馈不足
**工作量**: 1 天
**优先级**: 🟢 低

---

#### 9. #34 - 底部质量报告抽屉 (P3, ux, module:ui)
**问题**: ~180 行死代码和死 CSS
**影响**: 代码冗余
**工作量**: 0.5 天
**优先级**: 🟢 低

---

#### 10. #123 - document-audit 匹配问题 (P3, bug, module:core)
**问题**: table 块 sourceSpan 为 null
**影响**: 文档审计不完整
**工作量**: 0.5 天
**优先级**: 🟢 低

---

## 📅 执行计划

### 策略 A: 快速发布（推荐）
**目标**: 修复 P2 安全和关键 Bug，快速发布 v2.4.0

**第 1-2 天**: 
- #129 安全漏洞
- #88 ZIP descriptor
- #49 OCR 坐标

**第 3 天**:
- #14 Repair Engine

**结果**: 4 个 P2 Bug 修复，剩余 6 个

---

### 策略 B: 全面修复（质量优先）
**目标**: 修复所有 P2 Issue，v2.4.0 更完善

**第 1-2 天**: 
- #129, #88, #49（同策略 A）

**第 3-4 天**:
- #14 Repair Engine
- #9 OCR 性能

**第 5-6 天**:
- #38 Design Token
- #42 按钮统一

**结果**: 7 个 P2 全部修复，剩余 3 个 P3

---

### 策略 C: 按模块分批（工程化）
**目标**: 按模块完整修复，避免上下文切换

**第 1-2 天 (OCR 模块)**:
- #129 SHA-256 校验
- #49 bbox 坐标
- #9 性能优化

**第 3-4 天 (Core 模块)**:
- #88 ZIP descriptor
- #14 Repair Engine
- #123 document-audit

**第 5-6 天 (UI 模块)**:
- #38 Design Token
- #42 按钮统一
- #40 组件状态
- #34 死代码清理

**结果**: 全部 10 个 Issue 修复

---

## 🤔 推荐决策

### 我的建议：策略 A（快速发布）

**理由**:
1. **安全优先**: #129 是安全漏洞，必须立即修复
2. **影响用户**: #88 和 #49 影响实际使用
3. **快速迭代**: 3-4 天修复关键问题，快速发布
4. **技术债可控**: 剩余 6 个 Issue 可在 v2.5.0 处理

**时间线**:
- Day 1: #129 + #88
- Day 2: #49 + #14
- Day 3: 测试 + 发布 v2.4.0

---

## 📋 执行检查清单

每个 Issue 修复需要：
- [ ] 阅读 Issue 详情和影响范围
- [ ] 设计修复方案
- [ ] 修改代码
- [ ] 添加/更新测试
- [ ] 运行完整测试套件
- [ ] 更新文档（如需要）
- [ ] 提交（符合规范）
- [ ] 关闭 Issue

---

## 🎯 成功标准

### v2.4.0 发布标准（策略 A）
- [ ] #129 安全漏洞修复并测试
- [ ] #88 ZIP descriptor 支持
- [ ] #49 OCR 坐标系统一
- [ ] #14 Repair Engine 完善或文档更新
- [ ] 所有测试通过
- [ ] 覆盖率保持 ≥80%

---

**请选择策略**: A (快速) / B (全面) / C (按模块)
