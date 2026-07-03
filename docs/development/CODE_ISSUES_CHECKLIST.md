# Trans2Former 代码问题清单

**审核日期**: 2026-07-03  
**总问题数**: 15 个（P2: 8个, P3: 7个）

---

## P2 - 重要问题（计划修复）

### 性能优化类

#### #1 启动路径 DOM 查询重复
- **文件**: `public/app.js:38-102`
- **问题**: 启动时同步查询 69 个 DOM 元素
- **影响**: 阻塞启动 5-10ms
- **建议**: 非关键元素改为懒加载 getter
- **标签**: P2, performance, module:ui

#### #2 历史键哈希重复计算
- **文件**: `public/app.js:349-356, 387-395`
- **问题**: 每次调用都重新计算完整文档哈希
- **影响**: 50KB+ 文档耗时 10-50ms
- **建议**: 实现 cachedHistoryKey 缓存
- **标签**: P2, performance, module:ui

#### #3 格式解析器嵌套循环
- **文件**: `public/formats/pdf.js`, `docx.js`, `xlsx.js`
- **问题**: 多层 matchAll 嵌套，大文档开销显著
- **影响**: XLSX 1000行×20列 = 20000次匹配
- **建议**: 缓存外层结果，使用非捕获组
- **标签**: P2, performance, module:formats

#### #4 DOCX 扫描器低效
- **文件**: `public/formats/docx.js:69-88, 93-122`
- **问题**: 每个标签都正则+切片，可能 O(n²)
- **影响**: 200页 DOCX 全文扫描慢
- **建议**: 使用索引数组或 SAX 解析
- **标签**: P2, performance, module:formats

#### #5 ZIP 解压内存分配
- **文件**: `public/core/zip-container.js:119-131, 133-150`
- **问题**: push() 逐字节追加，频繁扩容
- **影响**: 10MB 文件数百万次 push
- **建议**: 预分配 Uint8Array
- **标签**: P2, performance, module:core

#### #6 文件队列全量渲染
- **文件**: `public/app.js:227-249`
- **问题**: 每次状态更新重建整个队列 DOM
- **影响**: 10+ 文件时 UI 卡顿
- **建议**: 增量更新或虚拟滚动
- **标签**: P2, performance, ux, module:ui

#### #7 文档审核重复调用
- **文件**: `public/core/format-registry.js` 多处
- **问题**: 同一 model 可能调用 5+ 次
- **影响**: 复杂转换路径开销累积
- **建议**: 仅在关键节点调用
- **标签**: P2, performance, module:core

### 功能正确性类

#### #8 转换完成状态可能无法更新 UI
- **文件**: `public/app.js:1054`
- **问题**: "complete" 状态跳过 updateConversionProgress
- **影响**: 进度条可能卡在 99%，按钮未启用
- **建议**: 检查函数对 complete 的特殊处理
- **标签**: P2, bug, module:ui

---

## P3 - 优化建议（择机修复）

### 代码清理类

#### #9 重复的输出状态赋值
- **文件**: `public/app.js:1565-1601`
- **问题**: currentOutputType/Format/Mime 重复赋值
- **建议**: 只在开头赋值一次
- **标签**: P3, refactor, module:ui

#### #10 嵌套条件判断
- **文件**: `public/app.js:570-652`
- **问题**: renderVerificationReport() 5层嵌套
- **建议**: 提取辅助函数扁平化
- **标签**: P3, refactor, module:ui

#### #11 历史键冗余计算
- **文件**: `public/app.js:387-394, 402, 424`
- **问题**: getHistoryStorageKey() 重复计算
- **建议**: 输入变化时更新缓存
- **标签**: P3, performance, module:ui

### 代码复用类

#### #12 扫描器重复
- **文件**: `public/formats/docx.js:69-88, 93-122`
- **问题**: scanBalanced 和 scanTopLevelBlocks 逻辑相同
- **建议**: 统一为可配置的扫描器
- **标签**: P3, refactor, module:formats

#### #13 提取函数嵌套
- **文件**: `public/formats/pdf.js:192-242`
- **问题**: extractLiteralTextOperators() 4层嵌套
- **建议**: 拆分为独立提取器
- **标签**: P3, refactor, module:formats

#### #14 链式 replace
- **文件**: `public/formats/html.js:57-72`
- **问题**: decodeHtmlEntities() 3次遍历字符串
- **建议**: 单次扫描处理所有实体
- **标签**: P3, performance, module:formats

#### #15 队列查找重复
- **文件**: `public/app.js:214-225, 251-257, 292-314`
- **问题**: fileQueue.find() 重复使用，O(n)
- **建议**: 使用 Map 存储，O(1) 查找
- **标签**: P3, performance, module:ui

---

## 测试覆盖缺口

### 核心模块（≥90% 目标）

1. **chunking.js** - 文档分块逻辑
2. **output-directory.js** - 文件系统写入
3. **asset-store.js** - 资源异步加载

### 边界情况（提升分支覆盖率）

4. **epub.js** - 复杂结构解析
5. **pptx.js** - 图片和表格提取
6. **input-state.js** - 输入状态错误处理
7. **file-queue-ui.js** - UI 渲染边界

### 传统格式（长尾优化）

8. **doc.js** - DOC 格式错误处理
9. **ofd.js** - OFD 格式错误处理

---

## 创建 GitHub Issues 模板

### P2 问题模板

```markdown
**标题**: [P2][performance] 启动路径 DOM 查询重复（69次）

**描述**:
启动时使用 getElementById/querySelector 同步查询 69 个 DOM 元素并存储在全局变量中，阻塞启动路径约 5-10ms。

**位置**: `public/app.js:38-102`

**影响**:
- 启动延迟增加
- 未使用的元素也被缓存
- 可选功能元素无条件查询

**建议方案**:
1. 对非关键路径元素使用懒加载 getter
2. 按功能模块分组按需初始化
3. 可选元素延迟查询

**标签**: P2, performance, module:ui
```

### P3 问题模板

```markdown
**标题**: [P3][refactor] 重复的输出状态赋值

**描述**:
transformContent() 中对 currentOutputType/Format/Mime 进行了重复赋值。

**位置**: `public/app.js:1565-1601`

**影响**:
- 代码冗余
- 维护成本增加

**建议方案**:
只在开头赋值一次，后续分支只处理差异化逻辑。

**标签**: P3, refactor, module:ui
```

---

## 修复优先级矩阵

| 问题编号 | 类型 | 影响面 | 修复难度 | 优先级排序 |
|---------|------|--------|---------|-----------|
| #8 | 功能 | 高 | 低 | 1 |
| #2 | 性能 | 高 | 低 | 2 |
| #5 | 性能 | 高 | 中 | 3 |
| #6 | UX | 中 | 中 | 4 |
| #1 | 性能 | 中 | 中 | 5 |
| #3 | 性能 | 中 | 高 | 6 |
| #4 | 性能 | 中 | 高 | 7 |
| #7 | 性能 | 低 | 中 | 8 |
| #9-15 | 优化 | 低 | 低-中 | 9-15 |

---

## 相关文档

- **完整审核报告**: `docs/development/COMPREHENSIVE_CODE_REVIEW_2026-07-03.md`
- **执行摘要**: `docs/development/CODE_REVIEW_EXECUTIVE_SUMMARY.md`
- **实施计划**: `docs/development/IMPLEMENTATION_PLAN.md`
- **经验教训**: `docs/development/lessons.md`

---

**维护**: 发现新问题时更新此清单  
**状态**: P0/P1 = 0, P2 = 8, P3 = 7  
**更新日期**: 2026-07-03
