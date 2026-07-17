#!/bin/bash
# GitHub Issues 创建脚本
# 用法: bash scripts/create-github-issues.sh

echo "创建 Trans2Former 代码审核发现的问题 Issues..."
echo ""

# 已创建的 Issues
echo "✅ 已创建:"
echo "  #195 - perf(ui): 启动时 DOM 查询重复 69 次"
echo "  #196 - perf(core): 格式解析器嵌套 matchAll 循环"
echo ""

# P2 问题 - 剩余 6 个

echo "创建 Issue #3: DOCX 扫描器优化..."
gh issue create --title "perf(formats): DOCX 扫描器深度计数低效" \
  --body "**问题描述**
\`scanBalanced\` 和 \`scanTopLevelBlocks\` 对每个标签都执行正则匹配和字符串切片，嵌套表格需要维护 depth 计数器。

**位置**: \`public/formats/docx.js:69-88, 93-122\`

**影响**:
- 复杂 DOCX（多层嵌套表格）可能触发 O(n²) 行为
- 字符串切片每次都拷贝大块内存
- 200 页 DOCX 可能包含数千个 \`<w:p>\` 和表格

**建议方案**:
- 缓存 token 匹配结果，避免重复正则执行
- 使用索引数组而非字符串切片，延迟到最后才提取内容
- 考虑流式 XML 解析器（如 SAX）替代正则

**预期效果**:
- 改善复杂 DOCX 文档的解析性能

**参考**: CODE_ISSUES_CHECKLIST.md #4, CODE_REVIEW Efficiency #4" \
  --label "P2,performance,module:formats"

echo "创建 Issue #4: ZIP 解压优化..."
gh issue create --title "perf(core): ZIP deflate 解压内存分配优化" \
  --body "**问题描述**
\`copyDistance\` 函数使用 \`output.push()\` 逐字节追加，每次 push 都可能触发数组重新分配。

**位置**: \`public/core/zip-container.js:119-131, 133-150\`

**影响**:
- 对 10MB 压缩文件，可能执行数百万次 push 操作
- 数组动态扩容导致多次大块内存拷贝
- DOCX/XLSX/EPUB 等 ZIP 容器格式受影响
- 浏览器 GC 压力增大

**建议方案**:
- 预分配固定大小的 Uint8Array（基于预期解压大小）
- 使用索引写入而非 push
- 批量写入而非逐字节

**技术挑战**:
- 需要保持错误检测行为一致（\`ZIP_DEFLATE_SIZE_ERROR\`）
- LZ77 距离复制的正确实现（自我引用）
- 预分配数组与动态数组的错误抛出时机一致性

**状态**: ⏸️ 暂缓，需更深入分析

**参考**: CODE_ISSUES_CHECKLIST.md #5, CODE_REVIEW Efficiency #5" \
  --label "P2,performance,module:core"

echo "创建 Issue #5: 文件队列渲染优化..."
gh issue create --title "perf(ui): 文件队列全量渲染导致卡顿" \
  --body "**问题描述**
\`renderQueueList\` 被频繁调用，每次都重建整个队列 DOM，未实现虚拟化或差异更新。

**位置**: \`public/app.js:227-249\`

**影响**:
- 10+ 文件队列时，每次状态更新触发全量 DOM 操作
- 批量处理时频繁重绘导致 UI 卡顿
- 用户体验下降

**建议方案**:
- 实现增量更新（仅更新变化的队列项）
- 对大队列使用虚拟滚动（代码中已有 \`VIRTUAL_LIST_ITEM_LIMIT\` 但未用于队列）
- 批量状态更新后再统一渲染

**预期效果**:
- 改善多文件批量处理的 UI 响应性

**参考**: CODE_ISSUES_CHECKLIST.md #7, CODE_REVIEW Efficiency #7" \
  --label "P2,performance,module:ui"

echo "创建 Issue #6: 文档审核重复调用..."
gh issue create --title "perf(core): ensureDocumentAudit 在转换管线中重复调用" \
  --body "**问题描述**
\`ensureDocumentAudit\` 在转换管线中被多次调用（5+ 次），每次都遍历 model.blocks 和 metadata。

**位置**: \`public/core/format-registry.js:369-373, 386-390, 463-470, 503-513, 555-566, 618-621\`

**调用链**:
- \`prepareConversionModel\` 调用一次
- 每个 mapper 后又调用一次
- writer 后又调用一次
- repair cycle 中再调用多次

**影响**:
- 对同一个 model 可能调用 5+ 次
- 复杂转换路径（如 PDF → OCR → SemanticDoc → DOCX）尤为明显
- 虽然有缓存，但多次调用检查开销累积

**建议方案**:
- 仅在管线关键节点调用（reader 后、writer 前、最终输出）
- 中间 mapper 步骤跳过或使用轻量级验证
- 添加 \`skipAudit\` 选项供内部调用

**预期效果**:
- 减少重复审核开销

**参考**: CODE_ISSUES_CHECKLIST.md #8, CODE_REVIEW Efficiency #8" \
  --label "P2,performance,module:core"

# P3 问题 - 7 个

echo ""
echo "创建 P3 问题（代码优化）..."

gh issue create --title "refactor(formats): HTML 转义函数重复定义" \
  --body "**问题描述**
HTML 转义逻辑在三处独立实现。

**位置**:
- \`public/formats/text-utils.js:1-8\` - \`escapeHtml()\`
- \`public/preview.js:236-242\` - \`escapeHtml()\`
- \`public/core/models/semantic-inlines.js:46-53\` - \`escapeHtmlInline()\`

**建议**:
统一使用 \`text-utils.js\` 的 \`escapeHtml()\`，删除其他两处重复实现。

**参考**: CODE_REVIEW Reuse #1" \
  --label "P3,refactor,module:formats"

gh issue create --title "refactor(formats): 换行符规范化函数重复" \
  --body "**问题描述**
换行符规范化逻辑在 5 处重复实现。

**位置**:
- \`public/formats/text-utils.js:33-35\` - \`normalizeNewlines()\`
- \`public/core/document-audit.js:11-13\` - 重复定义
- \`public/core/chunking.js:15\` - 内联实现
- \`public/formats/plain-text.js:7-8\` - 内联实现
- \`public/core/ocr/paddle-ocr-pipeline.js:22\` - 内联实现

**建议**:
统一使用 \`text-utils.normalizeNewlines()\`。

**参考**: CODE_REVIEW Reuse #2" \
  --label "P3,refactor,module:formats"

gh issue create --title "perf(formats): bytesToBase64 重复实现且性能差异大" \
  --body "**问题描述**
字节数组转 Base64 有逐字节和分块两种实现，且有重复代码。

**位置**:
- \`public/core/binary-utils.js:51-61\` - 逐字节转换
- \`public/formats/docx.js:48-54\` - 分块转换（8192字节/块）
- \`public/formats/pptx.js:17-23\` - 分块转换（与 docx 完全相同）
- \`public/formats/pdf.js:56-60\` - 分块转换
- 其他多处内联实现

**建议**:
- 将分块实现移到 \`binary-utils.js\` 作为优化版本
- 所有调用点改为导入统一函数
- 删除重复代码

**优先级**: P1（代码质量影响最大）

**参考**: CODE_REVIEW Reuse #3" \
  --label "P3,refactor,module:formats"

gh issue create --title "refactor(formats): MIME 类型判断函数重复" \
  --body "**问题描述**
\`mimeFromPath()\` 在 docx.js 和 pptx.js 中完全相同。

**位置**:
- \`public/formats/docx.js:58-64\`
- \`public/formats/pptx.js:27-33\`

**建议**:
提取到 \`public/formats/ooxml-utils.js\` 作为共享工具函数。

**参考**: CODE_REVIEW Reuse #4" \
  --label "P3,refactor,module:formats"

gh issue create --title "refactor(formats): PDF 文本转义函数重复" \
  --body "**问题描述**
PDF 文本转义逻辑有两处实现，方法不同但结果一致。

**位置**:
- \`public/formats/pdf-output.js:17-19\` - 使用 \`.replace()\`
- \`public/formats/pdf-output-high-fidelity.js:12-14\` - 使用 \`.replaceAll()\`

**建议**:
统一到一个函数，放在 \`pdf-output.js\` 或独立的 \`pdf-utils.js\`。

**参考**: CODE_REVIEW Reuse #5" \
  --label "P3,refactor,module:formats"

gh issue create --title "refactor(app): 重复的输出状态赋值" \
  --body "**问题描述**
\`transformContent()\` 中对 \`currentOutputType/Format/Mime\` 进行了重复赋值。

**位置**: \`public/app.js:1565-1601\`

**代码**:
\`\`\`javascript
// 第一次赋值
currentOutputType = result.type;
currentOutputFormat = result.format;
currentOutputMime = result.mime;

// 二进制分支又赋值一次
if (result.type === \"binary\") {
  currentOutputType = \"binary\";  // 重复
  currentOutputFormat = result.format;  // 重复
  currentOutputMime = result.mime;  // 重复
\`\`\`

**建议**:
只在开头赋值一次，后续分支只处理差异化逻辑。

**收益**: 减少 6 行重复代码

**参考**: CODE_REVIEW Simplification #1" \
  --label "P3,refactor,module:ui"

gh issue create --title "refactor(app): 可推导的嵌套条件判断" \
  --body "**问题描述**
\`renderVerificationReport()\` 有 5 层嵌套的条件检查，且包含大量可推导的局部变量。

**位置**: \`public/app.js:570-652\`

**建议**:
提取独立的辅助函数，扁平化逻辑。

**收益**: 降低圈复杂度，提高可测试性

**参考**: CODE_REVIEW Simplification #2" \
  --label "P3,refactor,module:ui"

echo ""
echo "✅ 所有 Issues 创建完成！"
echo ""
echo "总计："
echo "  P2: 8 个（已修复 2 个，待处理 6 个）"
echo "  P3: 7 个"
echo "  总计: 15 个问题"
