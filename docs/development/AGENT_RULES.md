# AGENT_RULES.md

版本：v1.0.0  
状态：生效  
最后更新：2026-06-23

本文档为 AI 协作详细规则，作为 CLAUDE.md 和 `docs/development-standards/04_AI_COLLABORATION_RULES.md` 的实施细则补充。

---

## 1. 代码风格规范

### 1.1 JavaScript/ES Module 规范

- **使用 ES Module**：所有代码使用 `import`/`export`，不使用 `require`/`module.exports`
- **文件扩展名**：导入语句必须包含 `.js` 扩展名（如 `import { foo } from "./bar.js"`）
- **缩进**：使用 2 空格缩进，不使用 Tab
- **引号**：字符串优先使用双引号 `""`，模板字符串使用反引号 `` ` ``
- **分号**：语句末尾使用分号 `;`
- **行宽**：建议单行不超过 120 字符，长语句优先在逻辑边界换行
- **空行**：函数之间空一行，逻辑块之间适当空行提升可读性

### 1.2 常量与变量

```javascript
// 常量使用 UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;

// 变量使用 camelCase
let currentDocument = null;
const fileMetadata = {};

// 私有符号使用下划线前缀（约定）
const _internalCache = new Map();
```

### 1.3 函数声明

```javascript
// 导出函数使用命名函数
export function convertDocument(input, options) {
  // ...
}

// 内部函数可使用箭头函数
const parseMetadata = (data) => {
  // ...
};

// 异步函数明确标注 async
export async function convertDocumentAsync(input, options) {
  // ...
}
```

### 1.4 对象与数组

```javascript
// 对象属性对齐（可选，短对象可单行）
const config = {
  format: "pdf",
  outputPath: "./output",
  enableOCR: false,
};

// 数组解构
const [first, ...rest] = items;

// 对象解构
const { format, options = {} } = input;

// 展开运算符
const merged = { ...defaults, ...userOptions };
```

### 1.5 条件与循环

```javascript
// 简单条件可单行
if (!input) return null;

// 复杂条件需要括号和换行
if (
  format === "pdf" &&
  (options.enableOCR || options.highFidelity)
) {
  // ...
}

// 优先使用 for...of 而非 for...in
for (const item of items) {
  processItem(item);
}

// Map/Filter/Reduce 优先于手动循环（语义清晰时）
const validItems = items.filter(item => item.valid);
```

---

## 2. 命名约定

### 2.1 文件命名

- **核心模块**：`kebab-case.js`（如 `format-registry.js`, `document-model.js`）
- **格式适配器**：`format-name-input.js` / `format-name-output.js`（如 `pdf-input.js`, `xlsx-output.js`）
- **测试文件**：`feature-name-test.js`（如 `conversion-snapshot-test.js`）
- **工具脚本**：`action-name.js`（如 `generate-samples.js`, `sync-pdfjs-vendor.js`）

### 2.2 变量与函数命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 函数 | `camelCase` 动词开头 | `convertDocument`, `parseMetadata`, `validateSchema` |
| 变量 | `camelCase` 名词 | `currentFile`, `documentModel`, `outputPath` |
| 常量 | `UPPER_SNAKE_CASE` | `MAX_FILE_SIZE`, `DEFAULT_ENCODING` |
| 类 | `PascalCase` | `ConversionError`, `RoutePlanner`, `DocumentModel` |
| 私有 | `_prefixed` | `_internalCache`, `_parseNode` |

### 2.3 布尔变量命名

```javascript
// 使用 is/has/should/can/will 前缀
const isValid = checkValidity(input);
const hasWarnings = warnings.length > 0;
const shouldRetry = error.retryable;
const canConvert = checkCapability(format);
```

### 2.4 DocumentModel 术语约定

遵循 `docs/CONVERSION_ROUTING.md` 和项目核心模型：

- **DocumentModel**：规范化文档中间模型
- **blocks**：文档内容块数组（段落、标题、表格等）
- **assets**：资源数组（图片、字体等）
- **metadata**：文档元信息
- **warnings**：转换警告数组

---

## 3. 注释规范

### 3.1 注释原则

- **说明为什么，而非做什么**：代码应自解释，注释解释意图和上下文
- **中文注释**：项目使用中文注释，保持与文档语言一致
- **及时更新**：修改代码时同步更新相关注释

### 3.2 文件头注释

每个核心模块文件应包含简要说明：

```javascript
// DocumentModel 规范化中间模型定义。
// 提供统一的文档结构，支持多格式输入/输出适配。
// 详见 docs/CONVERSION_ROUTING.md

export function createDocumentModel() {
  // ...
}
```

### 3.3 函数注释

```javascript
/**
 * 将输入内容转换为指定格式。
 * 
 * @param {Uint8Array|string} input - 输入内容（二进制或文本）
 * @param {Object} options - 转换选项
 * @param {string} options.inputFormat - 输入格式（如 "docx"）
 * @param {string} options.outputFormat - 输出格式（如 "pdf"）
 * @param {boolean} [options.enableOCR=false] - 是否启用 OCR
 * @returns {Promise<Uint8Array>} 转换后的二进制内容
 * @throws {ConversionError} 转换失败时抛出
 */
export async function convertDocument(input, options) {
  // 实现...
}
```

### 3.4 行内注释

```javascript
// 正例：解释业务逻辑或非显而易见的决策
// issue #39: 删除 documentModelPreview 面板（已移除）
const warningsList = document.getElementById("warningsList");

// OFD reader 是 L0 占位（仅容器元信息，正文不提取）
if (format === "ofd") {
  return createRestrictedRoute();
}

// 反例：重复代码逻辑（避免）
// 设置 format 为 "pdf"
const format = "pdf"; // ❌ 无意义注释
```

### 3.5 TODO/FIXME 标记

```javascript
// TODO: 实现 PPTX 图表提取（issue #123）
// FIXME: 大文件内存占用过高，需要流式处理
// NOTE: Tesseract Worker 必须显式 terminate，否则资源泄漏
```

---

## 4. 错误处理标准

### 4.1 ConversionError 规范

项目使用 `ConversionError` 类（`public/core/conversion-error.js`）封装转换错误：

```javascript
import { ConversionError } from "./core/conversion-error.js";

// 抛出结构化错误
throw new ConversionError(
  "PARSE_FAILED",                    // code
  "conversion",                      // category
  "docx",                           // format
  "无法解析 document.xml 结构"       // message
);
```

### 4.2 错误分类

| category | 说明 | 示例 |
|----------|------|------|
| `conversion` | 格式转换错误 | 解析失败、不支持的特性 |
| `validation` | 输入校验错误 | 无效文件、格式不匹配 |
| `resource` | 资源限制错误 | 内存不足、文件过大 |
| `capability` | 能力限制 | 功能未实现、依赖缺失 |

### 4.3 错误码约定

- **PARSE_FAILED**：解析失败
- **UNSUPPORTED_FEATURE**：不支持的特性
- **INVALID_INPUT**：无效输入
- **RESOURCE_LIMIT**：资源限制
- **CAPABILITY_MISSING**：能力缺失

### 4.4 错误处理模式

```javascript
// 函数内错误处理
export function parseDocument(data) {
  try {
    const parsed = parseXml(data);
    if (!parsed) {
      throw new ConversionError(
        "PARSE_FAILED",
        "conversion",
        "docx",
        "XML 解析返回空结果"
      );
    }
    return parsed;
  } catch (error) {
    // 包装外部错误
    if (error instanceof ConversionError) throw error;
    throw new ConversionError(
      "PARSE_FAILED",
      "conversion",
      "docx",
      `解析异常: ${error.message}`
    );
  }
}

// 顶层错误捕获（UI 层）
try {
  const result = await convertDocument(input, options);
  displayResult(result);
} catch (error) {
  const normalized = normalizeConversionError(error);
  displayErrorDetails(normalized);
}
```

### 4.5 错误信息脱敏

遵循 `docs/SECURITY_POLICY.md`，错误信息不得包含：

- 用户文档正文
- 文件名或完整路径
- 用户编辑内容
- 堆栈中的敏感数据

```javascript
// 正例：脱敏后的错误信息
"无法解析 document.xml 结构"
"DOCX 容器缺少必需的 [Content_Types].xml"

// 反例：包含敏感信息（避免）
"文件 C:/Users/张三/机密报告.docx 解析失败"  // ❌
"表格内容'员工工资明细'格式错误"           // ❌
```

---

## 5. 性能优化指南

### 5.1 大文件处理原则

遵循 `CONTRIBUTING.md` 和 `COMMIT_CHECKLIST.md` 要求：

- **不设人为文件大小上限**
- **分片/流式处理**：避免一次性加载整个文件到内存
- **Web Worker**：耗时任务（OCR、解析）放入 Worker
- **渐进预览**：大文件先显示部分内容，逐步加载完整结果

### 5.2 内存管理

```javascript
// 及时释放大对象
let largeBuffer = new Uint8Array(10 * 1024 * 1024);
processBuffer(largeBuffer);
largeBuffer = null; // 显式释放引用

// Worker 资源清理
const worker = await Tesseract.createWorker();
try {
  const result = await worker.recognize(image);
  return result;
} finally {
  await worker.terminate(); // 必须终止 Worker
}

// Blob URL 清理
const blobUrl = URL.createObjectURL(blob);
try {
  // 使用 blobUrl
} finally {
  URL.revokeObjectURL(blobUrl); // 释放内存
}
```

### 5.3 避免 O(n²) 操作

```javascript
// 反例：字符串拼接（O(n²)）
let result = "";
for (const chunk of chunks) {
  result += chunk; // ❌ 每次拼接创建新字符串
}

// 正例：数组 join（O(n)）
const result = chunks.join("");

// 反例：嵌套循环查找
for (const item of list1) {
  for (const other of list2) {
    if (item.id === other.id) { /* ... */ } // ❌ O(n²)
  }
}

// 正例：Map 索引
const map = new Map(list2.map(x => [x.id, x]));
for (const item of list1) {
  const other = map.get(item.id); // ✓ O(n)
  if (other) { /* ... */ }
}
```

### 5.4 分块转换

遵循 `CONTRIBUTING.md` 动态分块要求：

```javascript
// 按语义边界分块（章节、页、表格等）
export async function convertLargeDocument(input, options) {
  const chunks = splitBySemanticBoundary(input); // 按章节分割
  const partialModels = [];
  
  for (const chunk of chunks) {
    const partial = await convertChunk(chunk); // 转换为 partial DocumentModel
    partialModels.push(partial);
  }
  
  return mergePlanner(partialModels); // 合并为完整 DocumentModel
}

// 等价性验证：分块转换 vs 直接转换
const directResult = await convertDocument(input);
const chunkedResult = await convertLargeDocument(input);
assertEquivalent(directResult, chunkedResult); // blocks/assets/warnings 等价
```

### 5.5 缓存策略

```javascript
// 模块级缓存（避免重复计算）
const _formatCapabilityCache = new Map();

export function getFormatCapabilities(format) {
  if (_formatCapabilityCache.has(format)) {
    return _formatCapabilityCache.get(format);
  }
  const capabilities = computeCapabilities(format);
  _formatCapabilityCache.set(format, capabilities);
  return capabilities;
}
```

---

## 6. 安全编码规范

### 6.1 本地优先底线

遵循 `docs/SECURITY_POLICY.md` 和 `docs/development-standards/06_SECURITY_AND_LOCAL_FIRST.md`：

- **禁止网络请求**：不得使用 `fetch`/`XMLHttpRequest`/`WebSocket` 上传用户数据
- **禁止云端处理**：不得引入远程转换/OCR/AI 服务
- **禁止遥测**：不得发送使用数据、错误详情、文件名
- **本地处理**：所有文档处理在浏览器/桌面端完成

```javascript
// ❌ 严格禁止
fetch("https://api.example.com/convert", {
  method: "POST",
  body: documentContent // 上传用户文档
});

// ❌ 严格禁止
localStorage.setItem("user-document", documentText); // 持久化用户正文

// ✓ 允许（本地处理）
const result = convertInBrowser(input, options);
```

### 6.2 输入验证

```javascript
// 文件类型验证
export function validateFileType(file, expectedFormat) {
  const detectedFormat = detectFormatFromName(file.name);
  if (detectedFormat !== expectedFormat) {
    throw new ConversionError(
      "INVALID_INPUT",
      "validation",
      expectedFormat,
      `文件类型不匹配，期望 ${expectedFormat}，检测到 ${detectedFormat}`
    );
  }
}

// 大小限制（软性，用于提示）
export function checkFileSizeWarning(size) {
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
  if (size > LARGE_FILE_THRESHOLD) {
    return createWarning(
      "LARGE_FILE",
      `文件较大 (${formatFileSize(size)})，转换可能需要较长时间`
    );
  }
  return null;
}

// ZIP Bomb 防护（参考 security: 完善 ZIP Bomb 防护 #162）
export function validateZipSafety(entries) {
  const totalUncompressedSize = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  const MAX_UNCOMPRESSED_SIZE = 1024 * 1024 * 1024; // 1GB
  
  if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
    throw new ConversionError(
      "RESOURCE_LIMIT",
      "resource",
      "zip",
      "ZIP 解压后大小超限，可能为 ZIP Bomb"
    );
  }
}
```

### 6.3 XSS 防护

```javascript
// HTML 内容插入时必须转义
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text; // 自动转义
  return div.innerHTML;
}

// 使用 textContent 而非 innerHTML（当不需要 HTML 时）
element.textContent = userInput; // ✓ 安全
element.innerHTML = userInput;   // ❌ XSS 风险

// Blob URL 预览（PDF/HTML）必须在沙箱 iframe
const iframe = document.createElement("iframe");
iframe.sandbox = "allow-scripts"; // 限制权限
iframe.src = blobUrl;
```

### 6.4 依赖安全

- **最小化依赖**：遵循 `docs/RESOURCE_BUDGET.md`
- **optionalDependencies**：重依赖（pdfjs-dist、tesseract.js、onnxruntime-web）放入 `optionalDependencies`
- **供应链安全**：使用 `npm audit` 检查漏洞

---

## 7. Git 提交规范

### 7.1 Commit Message 格式

遵循 Conventional Commits 规范：

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Type 类型：**

- `feat`: 新功能
- `fix`: 修复 Bug
- `perf`: 性能优化
- `refactor`: 重构（不改变功能）
- `test`: 测试相关
- `docs`: 文档更新
- `chore`: 构建/工具链
- `security`: 安全修复

**示例：**

```bash
feat(pdf): 添加 CID 字体子集化支持

- 实现 CID 字体 ToUnicode 映射提取
- 添加字形子集过滤逻辑
- 优化字体嵌入体积

Closes #156

git commit -m "feat(pdf): 添加 CID 字体子集化支持" -m "- 实现 CID 字体 ToUnicode 映射提取
- 添加字形子集过滤逻辑
- 优化字体嵌入体积

Closes #156"
```

### 7.2 Commit 粒度

- **原子提交**：每个 commit 只做一件事
- **可回滚**：每个 commit 都应是可独立回滚的完整单元
- **相关测试**：功能代码和测试应在同一 commit

```bash
# ✓ 正例：原子提交
git commit -m "feat: 添加 XLSX 公式解析"
git commit -m "test: 添加 XLSX 公式解析测试"

# ❌ 反例：混杂多个改动
git commit -m "添加 XLSX 公式、修复 PDF 预览、更新文档"
```

### 7.3 分支策略

- **main**：主分支，保持稳定
- **功能分支**：`feat/feature-name`
- **修复分支**：`fix/bug-description`
- **重构分支**：`refactor/module-name`

```bash
# 创建功能分支
git checkout -b feat/pptx-chart-extraction

# 开发完成后合并到 main
git checkout main
git merge feat/pptx-chart-extraction
```

### 7.4 Pull Request 规范

**PR 标题：**

遵循 commit message 格式，如：
```
feat(pptx): 添加图表提取支持 (#123)
```

**PR 描述模板：**

```markdown
## 变更说明

简要描述本次 PR 的目的和实现方式。

## 变更内容

- [ ] 添加 PPTX 图表解析逻辑
- [ ] 实现 Chart.js 到 DocumentModel 映射
- [ ] 添加图表转换测试

## 测试验证

- [x] `npm test` 通过
- [x] 手动测试 PPTX 图表上传和预览
- [x] 浏览器 smoke test 通过

## 相关 Issue

Closes #123

## 注意事项

本次改动仅支持柱状图和折线图，饼图待后续实现。
```

### 7.5 提交前检查清单

参考 `COMMIT_CHECKLIST.md`，每次提交前确认：

- [ ] 代码符合本文档规范
- [ ] `npm test` 全部通过
- [ ] 相关文档已更新（README/CONTRIBUTING/docs）
- [ ] 新增格式已更新格式矩阵和能力说明
- [ ] 没有引入禁止的依赖（Office/Electron/云端 SDK）
- [ ] 错误详情已脱敏
- [ ] 大文件处理已考虑分片/流式

---

## 8. 代码审核检查清单

### 8.1 功能正确性

- [ ] 代码逻辑正确，无明显 Bug
- [ ] 边界条件已处理（空输入、null、undefined、空数组等）
- [ ] 异步操作正确使用 async/await 或 Promise
- [ ] 错误处理完整，异常能正确传播

### 8.2 代码质量

- [ ] 命名清晰，符合项目约定
- [ ] 函数职责单一，长度合理（建议 < 50 行）
- [ ] 避免重复代码（DRY 原则）
- [ ] 避免过度抽象或过早优化
- [ ] 注释清晰，解释"为什么"而非"做什么"

### 8.3 性能考虑

- [ ] 避免 O(n²) 或更高复杂度算法
- [ ] 大数组/对象操作已优化
- [ ] 资源及时释放（Worker、Blob URL、大对象）
- [ ] 缓存合理使用，避免重复计算

### 8.4 安全合规

- [ ] 无网络请求上传用户数据
- [ ] 无远程 API 调用（转换/OCR/AI）
- [ ] 输入已验证，防止注入攻击
- [ ] HTML 输出已转义，防止 XSS
- [ ] 错误信息已脱敏

### 8.5 架构一致性

- [ ] 遵循 DocumentModel 中间模型设计
- [ ] 格式适配器符合 reader/writer 规范
- [ ] 新增格式已注册到 FormatRegistry
- [ ] Mapper 路由正确声明（inputModels/acceptModels）
- [ ] Warnings 使用统一的 `createWarning` 创建

### 8.6 测试覆盖

- [ ] 核心逻辑有单元测试
- [ ] 格式转换有快照测试（conversion-snapshot-test）
- [ ] 浏览器交互有 smoke test
- [ ] 边界情况有测试覆盖

### 8.7 文档完整性

- [ ] README 反映当前功能
- [ ] DEVELOPMENT_TASKS.md 已更新
- [ ] 新增格式已更新 FORMAT_ROADMAP.md
- [ ] 架构变更已更新对应专题文档
- [ ] API 变更有 JSDoc 或注释说明

### 8.8 依赖与资源

- [ ] 新增依赖已评估（体积/安全/维护状态）
- [ ] 重依赖放入 optionalDependencies
- [ ] 资源预算未超限（参考 RESOURCE_BUDGET.md）
- [ ] 核心路径不包含重格式依赖

### 8.9 用户体验

- [ ] 错误提示清晰友好
- [ ] 大文件转换有进度提示
- [ ] 预览功能正常（HTML/PDF/文本）
- [ ] UI 无明显卡顿或假死

### 8.10 发布准备

- [ ] `npm test` 全部通过
- [ ] `npm run release:prepare` 可生成发布包
- [ ] CHANGELOG.md 已更新
- [ ] 版本号已更新（package.json）

---

## 9. AI 协作特别约定

### 9.1 任务理解

- **阅读上下文**：开始任务前先阅读 DEVELOPMENT_TASKS.md 和相关文档
- **明确目标**：确认任务范围，避免超范围实现
- **及时提问**：不确定需求时主动询问，避免错误假设

### 9.2 实施约束

- **禁止引入重依赖**：不得擅自添加 Office/Electron/Pandoc/云端 SDK
- **禁止破坏安全底线**：不得添加网络上传、遥测、云端处理
- **禁止绕过 DocumentModel**：所有格式转换必须通过中间模型
- **禁止删除测试**：不得为了通过测试而删除或注释测试用例

### 9.3 质量保证

- **运行测试**：修改代码后必须运行 `npm test`
- **验证功能**：关键改动需手动验证（如预览、下载）
- **检查资源**：格式改动需运行 `resource-budget-test`
- **同步文档**：功能变更必须更新 DEVELOPMENT_TASKS.md

### 9.4 输出规范

任务完成时需说明：

1. **改动文件清单**（绝对路径）
2. **完成的功能点**
3. **运行的测试**（命令和结果）
4. **未完成项**（如有）
5. **风险提示**（如有）

**示例输出：**

```
完成 PPTX 图表提取功能：

改动文件：
- D:/Trans2Former/public/formats/pptx-input.js
- D:/Trans2Former/scripts/conversion-snapshot-test.js
- D:/Trans2Former/docs/FORMAT_ROADMAP.md

完成功能：
- 添加 PPTX 柱状图和折线图解析
- 实现 Chart.js 到 DocumentModel blocks 映射
- 更新格式能力矩阵

验证测试：
- npm test ✓ 全部通过
- 手动测试 sample-chart.pptx 上传和预览 ✓

未完成项：
- 饼图和散点图暂未支持（待后续实现）

风险提示：
- 图表数据量较大时可能影响预览性能，后续考虑分页
```

---

## 10. 附录：常用工具函数

### 10.1 格式检测

```javascript
import { normalizeFormat, detectFormatFromName } from "./core/format-registry.js";

const format = detectFormatFromName("document.docx"); // "docx"
const normalized = normalizeFormat("markdown"); // "md"
```

### 10.2 错误创建

```javascript
import { ConversionError } from "./core/conversion-error.js";

throw new ConversionError(
  "PARSE_FAILED",
  "conversion",
  "xlsx",
  "无法解析工作表结构"
);
```

### 10.3 警告创建

```javascript
import { createWarning } from "./core/warnings.js";

const warning = createWarning(
  "FORMULA_NOT_PRESERVED",
  "Excel 公式未保留，仅保留计算结果"
);
```

### 10.4 二进制工具

```javascript
import { bytesToBase64, base64ToBytes } from "./core/binary-utils.js";

const base64 = bytesToBase64(uint8Array);
const bytes = base64ToBytes(base64String);
```

### 10.5 DocumentModel 操作

```javascript
import { createDocumentModel, mergeDocumentModels } from "./core/document-model.js";

const model = createDocumentModel();
model.blocks.push({ type: "paragraph", text: "Hello" });
model.assets.push({ id: "img1", type: "image", data: imageBytes });

const merged = mergeDocumentModels([model1, model2]);
```

---

## 11. 变更记录

- **v1.0.0 (2026-06-23)**：初始版本，整合代码风格、命名、注释、错误处理、性能、安全、Git、代码审核和 AI 协作规则

---

**相关文档：**

- [CONTRIBUTING.md](CONTRIBUTING.md) - 贡献指南和项目结构
- [COMMIT_CHECKLIST.md](COMMIT_CHECKLIST.md) - 提交前检查清单
- [docs/development-standards/04_AI_COLLABORATION_RULES.md](docs/development-standards/04_AI_COLLABORATION_RULES.md) - AI 协作规则
- [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) - 安全策略
- [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md) - 资源预算
- [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) - 转换路由设计
