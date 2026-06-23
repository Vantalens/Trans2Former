#!/bin/bash

# Trans2Former GitHub Issue 标签设置脚本
# 基于 DevDocsKit v2.1.1 规范

echo "开始创建 Trans2Former Issue 标签体系..."

# 严重级别（Priority）
gh label create "P0" --description "阻断性问题，立即修复" --color "d73a4a" --force
gh label create "P1" --description "严重问题，本版本必须修复" --color "ff9900" --force
gh label create "P2" --description "重要问题，计划修复" --color "ffcc00" --force
gh label create "P3" --description "优化建议，择机修复" --color "28a745" --force

# 问题类型（Type）
gh label create "bug" --description "功能缺陷" --color "d73a4a" --force
gh label create "security" --description "安全漏洞" --color "7057ff" --force
gh label create "performance" --description "性能问题" --color "ff9900" --force
gh label create "robustness" --description "健壮性问题" --color "ffcc00" --force
gh label create "ux" --description "用户体验" --color "0075ca" --force
gh label create "test" --description "测试相关" --color "00ffff" --force
gh label create "docs" --description "文档相关" --color "28a745" --force
gh label create "refactor" --description "重构需求" --color "7f8c8d" --force
gh label create "enhancement" --description "功能增强" --color "84b6eb" --force

# 模块标签（Module）
gh label create "module:core" --description "核心模块" --color "001f3f" --force
gh label create "module:formats" --description "格式转换" --color "39cccc" --force
gh label create "module:workers" --description "Worker 相关" --color "b10dc9" --force
gh label create "module:ui" --description "用户界面" --color "0074d9" --force
gh label create "module:server" --description "服务端" --color "2ecc40" --force
gh label create "module:ocr" --description "OCR 相关" --color "ff851b" --force
gh label create "module:pdf" --description "PDF 处理" --color "ff4136" --force
gh label create "module:test" --description "测试相关" --color "aaaaaa" --force

# 阶段标签（Phase）
gh label create "phase:design" --description "设计阶段" --color "d4c5f9" --force
gh label create "phase:dev" --description "开发阶段" --color "0e8a16" --force
gh label create "phase:test" --description "测试阶段" --color "fbca04" --force
gh label create "phase:release" --description "发布阶段" --color "0e8a16" --force

# 状态标签（Status）
gh label create "status:blocked" --description "被阻塞" --color "d73a4a" --force
gh label create "status:in-progress" --description "进行中" --color "fbca04" --force
gh label create "status:review" --description "待审核" --color "ff9900" --force
gh label create "status:done" --description "已完成" --color "28a745" --force

# 其他标签
gh label create "good first issue" --description "适合新手" --color "7057ff" --force
gh label create "help wanted" --description "需要帮助" --color "008672" --force
gh label create "duplicate" --description "重复问题" --color "cfd3d7" --force
gh label create "wontfix" --description "不会修复" --color "ffffff" --force
gh label create "invalid" --description "无效问题" --color "e4e669" --force

echo "✅ 标签创建完成！"
echo ""
echo "查看所有标签："
echo "  gh label list"
echo ""
echo "使用示例："
echo "  gh issue create --title '修复 PDF 导出问题' --label 'P1,bug,module:pdf'"
