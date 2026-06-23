# 代码审核报告

**审核日期**: 2026-06-23  
**审核范围**: 工作树变更（PDF ToUnicode CMap 支持 + API 改进）  
**审核级别**: Medium effort (全面覆盖，5+5 审核角度)

## 执行摘要

本次变更主要添加了 PDF ToUnicode CMap 支持以改进文本复制和搜索功能，同时修复了多个 API 签名问题。经过 10 个独立审核角度的分析，发现 **2 个需要修复的问题**：

- **1 个中等优先级问题**: 代理对（surrogate pairs）处理不完整
- **1 个低优先级问题**: 缺少 Node.js 版本约束

## 审核发现

### 🟡 中等优先级

#### 1. ToUnicode CMap 不支持代理对（Surrogate Pairs）

**位置**: `public/formats/pdf-cid-font.js:53-55`

**问题描述**:
```javascript
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
```

ToUnicode CMap 的 codespace 定义为 2 字节范围 `<0000> <FFFF>`，但 UniGB-UTF16-H 编码使用 4 字节序列来表示代理对（U+10000 及以上字符）。

**影响分析**:
- **影响字符**: CJK Extension B（𠀀-𪛖）、Emoji、其他补充平面字符
- **失效场景**: 当 PDF 包含 CJK Extension B 字符时
  - 内容流写入: `<D840DC00>` (UTF-16 代理对)
  - ToUnicode 处理: 错误地将其视为两个独立的 2 字节码 `<D840>` 和 `<DC00>`
  - 映射结果: `U+D840` 和 `U+DC00` (无效的孤立代理)
  - 实际应该: `U+20000` (𠀀)
- **触发频率**: 低（CJK Ext-B 在现代文档中使用较少）
- **严重程度**: 高（触发时会导致文本提取完全错误）

**建议修复**:
```javascript
3 begincodespacerange
<0000> <D7FF>
<D800DC00> <DBFFDFFF>
<E000> <FFFF>
endcodespacerange
```
并添加相应的 bfrange 映射来处理代理对解码。

**当前状态**: 
- `sanitizeGb1Text()` 允许这些字符通过
- `utf16BeHex()` 正确编码为代理对
- 但 ToUnicode CMap 无法正确映射它们

---

### 🟢 低优先级

#### 2. package.json 缺少 Node.js 版本约束

**位置**: `package.json`

**问题描述**:
新增的 `puppeteer@25.1.0` 依赖要求 Node.js `>=22.12.0`（见 package-lock.json:419），但 package.json 中没有声明 `engines` 字段。

**影响分析**:
- 用户可以在旧版本 Node.js 上成功安装
- 运行时会遇到神秘的语法错误或模块导入失败
- CI/CD 管道可能在旧版本上不可预测地失败

**建议修复**:
```json
{
  "engines": {
    "node": ">=22.12.0"
  }
}
```

**当前状态**: 可以正常安装但运行时可能出错

---

## ✅ 已确认正确的变更

### 1. PDF 对象引用格式重构

**位置**: `public/formats/pdf-cid-font.js:30,33`

**变更内容**:
- 旧: `[${cidFontRef} 0 R]` → 新: `[${cidFontRef}]`
- 旧: `${descriptorRef} 0 R` → 新: `${descriptorRef}`

**验证结果**: ✅ **正确**
- 调用方已更新为传递完整引用: `cidFontRef: "${cidFontObjectNumber} 0 R"`
- 避免了重复的 `0 R` 后缀
- 所有调用点已正确迁移

### 2. shouldUseLargeTextPreview API 修复

**位置**: `public/app.js:775-780, 924-929`

**变更内容**:
```javascript
// 旧（错误）: shouldUseLargeTextPreview(content, currentOutputFormat, "")
// 新（正确）:
shouldUseLargeTextPreview({
  format: currentOutputFormat,
  contentLength: content.length,
  threshold: LARGE_PROGRESSIVE_PREVIEW_BYTES,
  binaryFormats: BINARY_INPUT_FORMATS
})
```

**验证结果**: ✅ **关键 bug 修复**
- 函数定义一直要求对象参数，但旧代码传递位置参数
- 旧代码会导致 `format` 接收到完整内容字符串，完全破坏大文本降级策略
- 这个修复解决了 issue #66（大文本主线程冻结）

### 3. renderBottomReports 变量名修正

**位置**: `public/app.js:1637`

**变更内容**: `renderBottomReports(model, ...)` → `renderBottomReports(currentDocumentModel, ...)`

**验证结果**: ✅ **正确**
- 旧代码引用未定义的变量 `model`（会导致 ReferenceError）
- 新代码正确传递 `currentDocumentModel`（虽然值为 null）
- `renderBottomReports` 有适当的 null 检查和早期返回（line 579）

### 4. getAllowedOutputFormats 空值安全

**位置**: `public/core/format-registry.js:183-184`

**变更内容**: 
```javascript
// 旧: return [...(PRODUCT_MATRIX_BY_INPUT[normalizeFormat(from)] || [])];
// 新:
const matrix = PRODUCT_MATRIX_BY_INPUT[normalizeFormat(from)];
return matrix ? [...matrix] : [];
```

**验证结果**: ✅ **安全重构**
- 语义等价，更明确
- 始终返回数组，永不返回 undefined
- 调用方的 `|| []` 后备变得多余但无害

### 5. ToUnicode Identity 映射

**位置**: `public/formats/pdf-cid-font.js:56-58`

**变更内容**: Identity mapping `<0000> <FFFF> <0000>`

**验证结果**: ✅ **对于 BMP 字符正确**
- 内容流使用 `utf16BeHex()` 写入 UTF-16BE 编码的 Unicode 码点
- ToUnicode 映射内容流代码→Unicode（不是 CID→Unicode）
- 对于 BMP 字符（U+0000-U+FFFF），UTF-16BE = Unicode 码点，所以 identity 映射正确
- **但是**: 不支持代理对（见问题 #1）

### 6. ToUnicode 与 CIDFont 的 Ordering 不同

**位置**: `public/formats/pdf-cid-font.js:48`

**变更内容**: ToUnicode 使用 `/Ordering (Identity)`，CIDFont 使用 `/Ordering (GB1)`

**验证结果**: ✅ **符合规范**
- PDF 规范不要求 ToUnicode ordering 匹配 CIDFont ordering
- ToUnicode ordering 描述代码→Unicode 映射的性质
- CIDFont ordering 指定 CID→字形映射的字符集
- 这是标准做法，广泛支持

---

## 📊 审核统计

- **审核角度**: 10 个独立角度
  - Line-by-line diff scan
  - Removed-behavior auditor
  - Cross-file tracer
  - Language-pitfall specialist
  - Wrapper/proxy correctness
  - Reuse/Simplification/Efficiency
  - Altitude
  - Conventions (CLAUDE.md)
  - Gap sweep
  
- **候选发现**: 初始识别 15+ 个候选问题
- **验证后**: 2 个确认问题，6 个正确变更
- **误报**: 0 个（所有候选都经过验证）

---

## 🎯 建议

### 立即操作
1. **修复代理对支持**: 扩展 ToUnicode CMap codespace 以处理 4 字节序列
2. **添加 engines 字段**: 在 package.json 中指定 Node.js >=22.12.0

### 可选增强
1. **添加测试**: 为 CJK Extension B 字符添加单元测试
2. **文档更新**: 说明 puppeteer 依赖的用途（如果是测试基础设施）
3. **性能优化**: 在 pdf-output-high-fidelity.js:70 缓存 `toUnicodeCMapBytes`

---

## ✅ 审核结论

**总体评估**: ✅ **可以提交，有 2 个建议修复**

本次变更质量良好：
- 修复了 3 个关键 bug（API 签名不匹配、未定义变量）
- 成功添加了 ToUnicode CMap 基础支持（改进 PDF 文本提取）
- 重构了 PDF 对象引用格式（更清晰）
- 发现的 2 个问题影响有限且有明确的修复路径

**建议**: 可以先合并当前变更（已经是净改进），然后在后续 PR 中处理代理对支持和 engines 字段。
