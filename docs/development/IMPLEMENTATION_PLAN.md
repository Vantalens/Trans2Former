# 实施计划 - Trans2Former 测试完善与项目整理

版本：v1.0.0  
状态：进行中  
创建日期：2026-06-23  
负责人：Claude Code + Jack Yao

## 1. 任务目标

按照 DevDocsKit 规范对 Trans2Former 项目进行全面整理，确保：
1. 测试覆盖率达到 85% 以上（当前 81.27%）
2. 所有测试通过（修复资源预算测试失败）
3. 项目结构符合 DevDocsKit 个人开发者规范体系
4. 建立完善的开发文档体系
5. 落实代码审核和 Issue 管理流程

## 2. 当前状态分析

### 2.1 测试覆盖率现状
```
Statements   : 81.27% (12807/15757)
Branches     : 71.82% (3200/4455)
Functions    : 85.17% (655/769)
Lines        : 81.27% (12807/15757)
```

**分析**：
- ✅ 整体覆盖率 81.27%，已超过 80% 基线
- ⚠️ 分支覆盖率 71.82%，需要加强边界情况测试
- 🎯 目标：提升到 85%+ 整体覆盖率，80%+ 分支覆盖率

### 2.2 失败测试
- ❌ `resource-budget-test.js`: public/core 目录超出预算（456KB vs 322KB）

### 2.3 现有测试文件（32个）
```
scripts/r0-p0-data-integrity-test.js
scripts/server-hardening-test.js
scripts/smoke-test.js
scripts/conversion-snapshot-test.js
scripts/conversion-capability-audit-test.js
scripts/product-matrix-docs-test.js
scripts/conversion-quality-test.js
scripts/format-integrity-test.js
scripts/format-validation-test.js
scripts/worker-payload-test.js
scripts/browser-smoke-test.js
scripts/workbench-queue-test.js
scripts/ui-accessibility-test.js
scripts/desktop-shell-test.js
scripts/local-security-test.js
scripts/local-model-direction-test.js
scripts/repair-engine-test.js
scripts/rule-diff-test.js
scripts/ssim-verification-test.js
scripts/ocr-readback-test.js
scripts/sample-corpus-test.js
scripts/paddle-ocr-pipeline-test.js
scripts/paddle-ocr-integration-test.js
scripts/ocr-structure-test.js
scripts/latex-math-test.js
scripts/model-cache-test.js
scripts/ocr-baseline-test.js
scripts/resource-budget-test.js
scripts/pdf-reader-test.js
scripts/xlsx-writer-performance-test.js
scripts/tesseract-worker-cleanup-test.js
scripts/p2-responsiveness-test.js
scripts/p4-p5-p6-test.js
scripts/p7-release-productization-test.js
scripts/release-readiness-test.js
```

## 3. 实施阶段

### Phase 1: 修复失败测试和提升覆盖率基线（1-2天）

#### 任务 1.1: 修复资源预算测试
- 分析 public/core 目录增长原因
- 调整预算阈值或优化代码体积
- 验证测试通过

#### 任务 1.2: 识别低覆盖率模块
- 运行 `c8 --reporter=html npm test`
- 分析 HTML 报告找出覆盖率低于 70% 的文件
- 按优先级排序（核心模块优先）

#### 任务 1.3: 添加核心模块单元测试
目标模块：
- `public/formats/*.js` - 格式转换核心
- `public/core/*.js` - 核心工具函数
- `public/workers/*.js` - Worker 逻辑
- `src/*.js` - 服务端逻辑

每个模块需要覆盖：
- 成功路径
- 错误处理路径
- 边界条件
- 异常输入

#### 任务 1.4: 提升分支覆盖率
重点测试：
- if/else 两个分支
- switch 所有 case
- 三元运算符
- 逻辑运算符短路
- try/catch

### Phase 2: 按 DevDocsKit 规范整理项目（2-3天）

#### 任务 2.1: 创建项目根文档
按 DevDocsKit 个人开发者规范体系创建：

1. **PRD.md** (需求文档)
   - 产品定位
   - 核心功能
   - 用户场景
   - 非功能需求

2. **APP_FLOW.md** (流程与路由)
   - 用户操作流程
   - 页面跳转关系
   - 状态转换图

3. **TECH_STACK.md** (技术栈与架构)
   - 技术选型
   - 架构设计
   - 模块划分
   - 依赖关系

4. **FRONTEND_GUIDELINES.md** (前端规范)
   - 代码风格
   - 组件规范
   - 状态管理
   - API 调用规范

5. **BACKEND_STRUCTURE.md** (后端结构)
   - 服务架构
   - API 设计
   - 数据模型
   - 安全策略

6. **TEST_PLAN.md** (测试计划)
   - 测试策略
   - 测试分层
   - 覆盖率目标
   - 测试数据

7. **AGENT_RULES.md** (AI 协作规则)
   - 开发约束
   - 代码风格
   - 提交规范
   - 审核流程

8. **progress.md** (进度追踪)
   - 已完成功能
   - 进行中任务
   - 待办事项

9. **lessons.md** (经验教训)
   - 技术决策
   - 问题解决
   - 优化方案
   - 避坑指南

#### 任务 2.2: 建立 Issue 标签体系
按 DevDocsKit 要求创建标签：

**严重级别**：
- `P0` - 阻断性问题，立即修复
- `P1` - 严重问题，本版本必须修复
- `P2` - 重要问题，计划修复
- `P3` - 优化建议，择机修复

**问题类型**：
- `bug` - 功能缺陷
- `security` - 安全漏洞
- `performance` - 性能问题
- `robustness` - 健壮性问题
- `ux` - 用户体验
- `test` - 测试相关
- `docs` - 文档相关
- `refactor` - 重构需求

**模块标签**：
- `module:core` - 核心模块
- `module:formats` - 格式转换
- `module:workers` - Worker 相关
- `module:ui` - 用户界面
- `module:server` - 服务端
- `module:ocr` - OCR 相关
- `module:pdf` - PDF 处理

**阶段标签**：
- `phase:design` - 设计阶段
- `phase:dev` - 开发阶段
- `phase:test` - 测试阶段
- `phase:release` - 发布阶段

#### 任务 2.3: 更新 README.md
补充内容：
- 项目定位（一句话描述）
- 快速开始
- 功能特性
- 技术架构
- 开发指南
- 测试指南
- 贡献指南
- License

#### 任务 2.4: 创建 CLAUDE.md
项目级 AI 协作入口文件：
- 启动顺序
- 模块化开发约束
- 小步提交强约束
- 阶段代码审核要求
- 质量与覆盖率红线
- AI 开发节制规则

### Phase 3: 完善测试套件（2-3天）

#### 任务 3.1: 添加单元测试
为每个核心模块创建独立测试文件：

```
test/
├── unit/
│   ├── core/
│   │   ├── binary-utils.test.js
│   │   ├── format-registry.test.js
│   │   ├── document-model.test.js
│   │   └── ...
│   ├── formats/
│   │   ├── markdown-input.test.js
│   │   ├── pdf-output.test.js
│   │   ├── xlsx-reader.test.js
│   │   └── ...
│   └── workers/
│       ├── conversion-worker.test.js
│       └── ...
├── integration/
│   ├── conversion-pipeline.test.js
│   ├── format-round-trip.test.js
│   └── ...
└── e2e/
    ├── user-upload-convert.test.js
    └── ...
```

#### 任务 3.2: 添加集成测试
测试模块间协作：
- 完整转换流程
- Worker 通信
- 格式往返转换
- 错误传播

#### 任务 3.3: 添加 E2E 测试
使用 Puppeteer 测试关键用户路径：
- 上传文件 → 转换 → 下载
- 格式选择 → 预览 → 导出
- 错误处理 → 重试流程

#### 任务 3.4: 添加性能基准测试
- 大文件转换性能
- 内存使用监控
- 并发处理能力
- 响应时间阈值

### Phase 4: 建立代码审核流程（1天）

#### 任务 4.1: 创建代码审核检查清单
- 正确性检查
- 安全性检查
- 性能检查
- 可维护性检查
- 测试覆盖检查

#### 任务 4.2: 集成到 CI/CD
- GitHub Actions 配置
- 自动化测试
- 覆盖率报告
- 代码质量检查

#### 任务 4.3: 制定发布流程
- 版本号规则（SemVer）
- 发布检查清单
- 回滚预案
- 变更日志

### Phase 5: 验证与复盘（1天）

#### 任务 5.1: 完整测试运行
```bash
npm run coverage
```

验证：
- ✅ 所有测试通过
- ✅ 覆盖率 ≥ 85%
- ✅ 分支覆盖率 ≥ 80%
- ✅ 无 P0/P1 未关闭 Issue

#### 任务 5.2: 文档审核
- 所有必需文档已创建
- 内容完整且一致
- 版本信息正确

#### 任务 5.3: 编写复盘报告
- 完成时间线
- 遇到的问题
- 解决方案
- 经验教训
- 后续改进计划

## 4. 质量门禁

### Gate-1: 进入 Phase 2
- ✅ 资源预算测试通过
- ✅ 覆盖率达到 83%+

### Gate-2: 进入 Phase 3
- ✅ 核心文档已创建
- ✅ Issue 标签体系建立
- ✅ CLAUDE.md 完成

### Gate-3: 进入 Phase 4
- ✅ 单元测试覆盖率 ≥ 85%
- ✅ 集成测试完成
- ✅ E2E 测试通过

### Gate-4: 项目完成
- ✅ 所有测试通过
- ✅ 覆盖率 ≥ 85%
- ✅ 文档完整
- ✅ 代码审核通过
- ✅ 无阻断性问题

## 5. 风险与应对

### 风险 1: 测试编写耗时超预期
**应对**：
- 优先覆盖核心模块
- 使用测试生成工具
- 复用现有测试模式

### 风险 2: 覆盖率难以达到 85%
**应对**：
- 排除生成代码和第三方库
- 关注关键路径覆盖
- 适当调整目标（不低于 82%）

### 风险 3: 文档编写工作量大
**应对**：
- 使用模板快速起步
- 从现有代码提取信息
- 分阶段完善细节

## 6. 资源需求

- **时间**: 7-10 天
- **工具**: c8, puppeteer, GitHub Actions
- **参考**: DevDocsKit 规范文档

## 7. 成功标准

- ✅ 所有测试通过（115+ 测试用例）
- ✅ 代码覆盖率 ≥ 85%
- ✅ 分支覆盖率 ≥ 80%
- ✅ 9 个核心文档完成
- ✅ Issue 标签体系建立
- ✅ CI/CD 集成完成
- ✅ 无 P0/P1 未关闭问题
- ✅ 代码审核报告完成

## 8. 变更记录

- v1.0.0 (2026-06-23): 初版实施计划，基于 DevDocsKit v2.1.1
