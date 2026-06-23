# GitHub Issue 标签体系设置脚本

本脚本用于创建 Trans2Former 项目的 Issue 标签体系，符合 DevDocsKit 规范。

## 使用方法

```bash
# 批量创建标签
bash setup-labels.sh
```

## 标签列表

### 严重级别（Priority）
- P0 (red) - 阻断性问题，立即修复
- P1 (orange) - 严重问题，本版本必须修复
- P2 (yellow) - 重要问题，计划修复
- P3 (green) - 优化建议，择机修复

### 问题类型（Type）
- bug (red) - 功能缺陷
- security (purple) - 安全漏洞
- performance (orange) - 性能问题
- robustness (yellow) - 健壮性问题
- ux (blue) - 用户体验
- test (cyan) - 测试相关
- docs (green) - 文档相关
- refactor (gray) - 重构需求
- enhancement (brightgreen) - 功能增强

### 模块标签（Module）
- module:core (navy) - 核心模块
- module:formats (teal) - 格式转换
- module:workers (purple) - Worker 相关
- module:ui (blue) - 用户界面
- module:server (green) - 服务端
- module:ocr (orange) - OCR 相关
- module:pdf (red) - PDF 处理
- module:test (gray) - 测试相关

### 阶段标签（Phase）
- phase:design (lightgray) - 设计阶段
- phase:dev (blue) - 开发阶段
- phase:test (yellow) - 测试阶段
- phase:release (green) - 发布阶段

### 状态标签（Status）
- status:blocked (red) - 被阻塞
- status:in-progress (yellow) - 进行中
- status:review (orange) - 待审核
- status:done (green) - 已完成

### 其他标签
- good first issue (brightgreen) - 适合新手
- help wanted (blue) - 需要帮助
- duplicate (gray) - 重复问题
- wontfix (gray) - 不会修复
- invalid (gray) - 无效问题
