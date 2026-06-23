# Trans2Former 项目经验教训

**文档版本**: v1.0.0  
**创建日期**: 2026-06-23  
**项目版本**: v2.3.0（262 commits）

---

## 1. 技术决策及理由

### 1.1 本地优先架构

**决策**: 所有文档转换在浏览器/桌面端本地执行，零云端处理。

**理由**:
- **隐私保护**: 用户文档、文件名、转换结果不上传，避免隐私泄露风险
- **离线可用**: 不依赖网络，适合对网络敏感的使用场景（企业内网、安全环境）
- **成本控制**: 无服务器成本，可持续运行

**实施要点**:
- 前端禁用 `fetch`/`XMLHttpRequest` 等网络调用（安全中心监控）
- OCR、PDF.js、ONNX Runtime 全部本地加载
- 安全策略文档明确禁止云端文档处理 ([SECURITY_POLICY.md](docs/SECURITY_POLICY.md))

**教训**: 本地优先需要配套完善的资源预算和测试门禁，否则依赖膨胀会破坏初衷。


### 1.2 多模型架构而非单一 DocumentModel

**决策**: 采用五个并列规范模型（SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel / AssetGraph）+ 显式 Mapper。

**理由**:
- **避免语义失配**: 表格单元格的 `formula` / `merge` 无法优雅地塞入面向段落的 SemanticDoc
- **保真度透明**: 跨模型转换必发 warning，质量损失可见
- **扩展性**: 新增 OFD/图纸格式时可定义专属模型，不污染现有模型

**实施要点**:
- Reader/Writer 声明 `producesModels` / `acceptsModels`
- Mapper 注册 `lossLevel`，RoutePlanner 自动规划路径
- 质量报告记录 `executedMappers` / `routeClass`（hot/warm/cold）

**教训**: 跨模型转换的 warning 必须有实际 UI 展示，否则用户看不到质量降级信息。


### 1.3 核心内置模块化而非插件系统

**决策**: 取消插件安装模式，OCR/OFD/高保真渲染作为核心本地模块按需加载。

**理由**:
- **安全性**: 插件下载链易被劫持，用户无法验证来源
- **体验一致**: 核心能力开箱即用，不需要用户手动"安装插件"
- **维护成本**: 插件版本管理、兼容性测试成本高

**实施要点**:
- 重模型资源不入 git，由 vendor 脚本从钉定来源下载（SHA-256 校验）
- PP-OCRv5 模型随 `release:prepare` 打包到发布包
- model-cache 目录支持按需下载和用户清理

**教训**: 初期曾考虑插件化，但安全审查发现插件下载环节无法保证零网络泄漏，遂改为核心内置。


### 1.4 纯 ESM + 零构建步骤

**决策**: 前端代码使用原生 ES Modules，不使用 Webpack/Vite 构建。

**理由**:
- **调试友好**: 浏览器 DevTools 直接映射源码，不需要 source map
- **依赖透明**: 每个模块的导入导出关系一目了然
- **启动快速**: 无需构建等待，`npm start` 即启动

**实施要点**:
- 所有模块后缀 `.js`，导入路径必须带扩展名
- Web Worker 使用 `type: 'module'` 加载
- 资源预算测试直接统计 `public/` 目录体积

**教训**: ESM 在 Node.js 测试中需要注意 `import.meta.url` / 动态 import 的路径解析差异。


### 1.5 ONNX Runtime WebGPU + WASM 双后端

**决策**: PP-OCRv5 OCR 使用 onnxruntime-web，优先 WebGPU，回落 WASM。

**理由**:
- **性能**: WebGPU 利用 GPU 加速，OCR 速度提升 3-5 倍
- **兼容性**: WASM 后端保证旧浏览器/无 GPU 环境可用
- **本地**: 完全本地推理，不依赖云端 API

**实施要点**:
- `vendor:onnx` 同步 onnxruntime-web 到 `public/vendor/onnxruntime/`
- PP-OCRv5 det/rec/cls 模型转 ONNX 格式（ImageNet 归一化 + 32 倍数 padding）
- 方向校正（cls 180°）、倾斜纠偏、自适应去噪、版面归并在前后处理层实现

**教训**: ONNX 模型的 input shape / 归一化参数必须与原始 PaddlePaddle 训练配置严格一致，否则识别精度崩溃。


---

## 2. 遇到的主要问题和解决方案

### 2.1 PDF 预览空白问题

**问题**: 首页加载后空白，无任何 UI 渲染。

**根因**: `browser-transformer.js` 漏 re-export `getKnownInputFormats`，导致 `landing-view.js` 模块加载失败。

**解决方案**:
```javascript
// browser-transformer.js
export { getKnownInputFormats } from './core/format-registry.js';
```

**教训**: ESM 模块导出必须有端到端测试覆盖，`browser-smoke-test.js` 现已加载所有前端入口模块。


### 2.2 OCR 实际不触发

**问题**: 图片/扫描 PDF 上传后转换为空白文档，OCR 未执行。

**根因**: 转换走 Web Worker 同步路径，绕过了主线程的 OCR 异步管线。

**解决方案**:
- 图片/PDF 改走主线程异步管线（`async-ocr-pipeline.js`）
- Worker 只处理纯文本格式转换

**教训**: 异步能力（OCR / 网络请求）无法在 Worker 内直接调用，需要主线程协调。


### 2.3 Tesseract Worker 资源泄漏

**问题**: Tesseract Worker 初始化超时后，Worker 线程未终止，导致内存泄漏。

**根因**: `createWorker` 超时后直接抛错，未调用 `worker.terminate()`。

**解决方案** (Issue #163):
```javascript
let workerPromise;
try {
  workerPromise = createWorker(...);
  const worker = await Promise.race([
    workerPromise,
    timeoutPromise(15000)
  ]);
  return worker;
} catch (err) {
  if (workerPromise) {
    workerPromise.then(w => w.terminate()).catch(() => {});
  }
  throw err;
}
```

**教训**: 异步资源（Worker / 网络请求 / 文件句柄）的清理必须在 catch 块中兜底。


### 2.4 ZIP Bomb 绕过防护

**问题**: 小于 64 字节的文件不检查压缩比，攻击者可用 63B 压缩包膨胀到 1GB。

**根因**: `if (uncompressedSize >= 64)` 判断过于宽松。

**解决方案** (Issue #162):
```javascript
if (compressedSize > 0) {  // 移除 64B 阈值
  const ratio = uncompressedSize / compressedSize;
  if (ratio > MAX_COMPRESSION_RATIO) {
    throw new Error(`Compression ratio ${ratio.toFixed(1)} exceeds ${MAX_COMPRESSION_RATIO}`);
  }
}
```

**教训**: 安全防护不能有"特殊尺寸豁免"逻辑，攻击者会专门针对边界条件构造输入。


### 2.5 ConversionError 构造函数调用错误

**问题**: `throw new ConversionError(message, "convert", "INPUT_BUDGET_EXCEEDED")` 导致错误对象字段为空。

**根因**: 构造函数签名是 `ConversionError(message, { category, code, format, details })`，传参顺序错误。

**解决方案** (Issue #161):
```javascript
throw new ConversionError(message, {
  category: 'convert',
  code: 'INPUT_BUDGET_EXCEEDED',
  format: formatName,
  details: { inputBytes, maxInputBytes }
});
```

**教训**: 构造函数签名变更必须全局搜索调用点，或使用 TypeScript / JSDoc 类型检查。


### 2.6 DOCX 读取丢失分级

**问题**: DOCX 导入后所有标题变成普通段落。

**根因**: `word/styles.xml` 中样式名为中文别名（如"标题 1"），无法匹配英文 `heading 1`。

**解决方案**:
- 新增 `parseHeadingStyleMap` 解析 styleId→level 映射
- 按 styleId / name / basedOn 多路兜底识别

**教训**: Office 格式存在大量地区化变体，不能假设样式名为英文。


### 2.7 高保真 PDF 输出文本重叠

**问题**: FixedLayoutModel → PDF 输出时文本坐标错误，字符重叠。

**根因**: dx 累加计算错误，导致字符 x 坐标始终为页面起点。

**解决方案**:
```javascript
let dx = 0;
for (const glyph of run.glyphs) {
  content += `${dx} 0 Td (${glyph}) Tj\n`;
  dx += glyphWidth;  // 累加偏移
}
```

**教训**: PDF 坐标系与 HTML/Canvas 不同，必须手工验证渲染结果。


---

## 3. 性能优化经验

### 3.1 bytesToBase64 O(n²) → O(n)

**问题**: DOCX/PPTX 写入时，图片 base64 编码耗时随图片大小指数增长。

**根因**: 使用 `result += chunk` 字符串拼接，每次拼接创建新字符串，总复杂度 O(n²)。

**优化** (Issue #164):
```javascript
// 前：O(n²)
let result = '';
for (const chunk of chunks) {
  result += chunk;
}

// 后：O(n)
const chunks = [];
for (...) {
  chunks.push(chunk);
}
return chunks.join('');
```

**收益**: 10MB 图片编码从 8s 降至 0.2s。

**教训**: JavaScript 字符串不可变，循环拼接必须用数组 + join。


### 3.2 XLSX Writer 双重遍历消除

**问题**: XLSX 写入时先遍历所有单元格构建 rows 数组，再遍历一次生成 XML。

**优化** (Issue #165):
```javascript
// 前：两次遍历
const rows = buildRows(cells);  // O(n)
const xml = rowsToXml(rows);    // O(n)

// 后：单次遍历
let xml = '';
for (const cell of cells) {
  xml += cellToXml(cell);       // O(n)
}
```

**收益**: 10 万单元格写入从 3.2s 降至 1.8s。

**教训**: 流式生成 XML 比先构建 DOM 树再序列化更高效。


### 3.3 资源预算强制执行

**问题**: 核心模块体积不受控，从 200KB 膨胀至 500KB。

**解决方案** (Issue #167):
- 新增 `resource-budget-test.js` 强制门禁
- `public/core` <= 460KB（含 OCR 结构识别、Repair Engine）
- `public/formats` <= 0.50 MB
- `public` total（排除 vendor）<= 2.00 MB

**收益**: 阻止重依赖进入核心路径，保持默认包轻量。

**教训**: 性能预算必须自动化测试，否则会在不知不觉中退化。


---

## 4. 安全问题处理

### 4.1 ZIP Bomb 防护完善

**问题**: 见 2.4

**防护措施**:
- 单文件压缩比 <= 100:1
- 总解压大小 <= 256 MB（v0.3.0 从 1GB 收紧）
- 移除小文件豁免逻辑

**教训**: 压缩包攻击是本地应用的常见攻击面，必须在解压前校验。


### 4.2 XSS 防护（HTML 输入）

**防护措施**:
- `<script>` / `<style>` 标签在 reader 阶段移除
- 事件处理器属性（`onclick` / `onerror`）不保留
- 预览时使用 `DOMPurify` 二次清洗（TODO）

**教训**: HTML 输入是 XSS 高风险点，必须多层防护。


### 4.3 安全中心网络监控

**实施**:
- 拦截 `XMLHttpRequest` / `fetch` 请求
- 文档处理阶段阻止所有非同源请求
- 安全中心 UI 实时展示外部请求

**教训**: 本地优先需要可验证，用户能看到"零网络请求"才能建立信任。


### 4.4 模型资源 SHA-256 校验

**实施**:
- `paddleocr-models.manifest.json` 钉定模型 URL 和 SHA-256
- `sync-paddleocr-vendor.js` 下载后强制校验
- 校验失败时清理文件并报错

**教训**: 模型文件是攻击者投毒的目标，必须校验完整性。


### 4.5 Tauri 权限最小化

**实施**:
- 默认只声明 `core:default` 权限
- 移除未使用的 `fs` / `dialog` / `shell` 插件
- 禁止后台网络访问

**教训**: 桌面应用的权限膨胀会带来安全隐患，定期审计并清理。


---

## 5. 测试策略演进

### 5.1 从手工测试到自动化门禁

**演进路径**:
1. **v1.0**: 手工浏览器测试（易漏测）
2. **v2.0**: 新增 `smoke-test.js` 核心流程覆盖
3. **v2.2**: 新增 28 个测试脚本，`npm test` 串联执行
4. **v2.3**: 新增 `resource-budget-test` / `pdf-reader-test` / `tesseract-worker-cleanup-test`

**当前测试链**:
```bash
npm test  # 28 个脚本，覆盖核心转换、OCR、安全、性能、发布
```

**教训**: 测试脚本数量增长时，必须保证每个脚本独立可运行，否则调试困难。


### 5.2 快照测试 vs 断言测试

**快照测试** (`conversion-snapshot-test.js`):
- 适合检测意外变更（回归测试）
- 首次运行生成基线，后续运行对比

**断言测试** (`smoke-test.js`):
- 适合验证核心逻辑（如 MD → HTML 的标题层级）
- 明确预期输出

**教训**: 两种测试互补，快照测试覆盖广但难定位问题，断言测试精准但覆盖窄。


### 5.3 Node.js 测试 vs 浏览器测试

**Node.js 测试**:
- 适合纯函数逻辑（Markdown parser / SSIM 计算）
- 速度快，适合 CI

**浏览器测试**:
- 适合 DOM 操作 / WebGPU / Web Worker
- 需要 Puppeteer 启动浏览器，速度慢

**教训**: 优先用 Node.js 测试覆盖纯逻辑，只在必要时用浏览器测试。


### 5.4 测试数据管理

**问题**: 测试样例散落在代码中，难以复用。

**解决方案**:
- `npm run samples:generate` 生成标准测试语料
- 覆盖全格式、复杂排版、大文件（>= 3MB）
- 样例文件 `.gitignore`，避免仓库膨胀

**教训**: 测试数据生成必须可重现，避免手工维护样例文件。


---

## 6. 未来改进方向

### 6.1 OCR 精度提升

**当前状态**: PP-OCRv5 mobile 模型，精度中等。

**改进方向**:
- 支持用户导入 PP-OCRv5 server 模型（更大更准）
- cls 角度旋转校正（当前只支持 180°）
- 多栏阅读顺序优化

**挑战**: server 模型体积 > 100MB，需要按需下载 + 降级提示。


### 6.2 表格识别

**当前状态**: OCR 只识别文字，表格结构丢失。

**改进方向**:
- 集成表格检测模型（PaddleOCR Table）
- 输出结构化表格（行列合并关系）

**挑战**: 表格模型需要额外 50-100MB，且精度依赖训练数据覆盖。


### 6.3 公式识别

**当前状态**: LaTeX 公式需要原文档已有 `$...$` 标记。

**改进方向**:
- 集成公式检测模型（LaTeX-OCR）
- 图片中的公式转 LaTeX 代码

**挑战**: 公式识别模型复杂度高，浏览器端推理慢。


### 6.4 批量转换

**当前状态**: 单文件上传转换。

**改进方向**:
- 支持拖拽文件夹
- 批量转换队列
- 进度条 + 失败重试

**挑战**: 浏览器 File API 不支持读取文件夹，需要 Tauri 桌面端能力。


### 6.5 转换质量自动评分

**当前状态**: 三层检验（rule-diff / SSIM / OCR 回读）输出原始指标。

**改进方向**:
- 综合三层指标计算质量分（0-100）
- 根据质量分推荐用户是否需要人工复核

**挑战**: 不同格式的质量标准不同，需要分类定义阈值。


### 6.6 多语言 OCR

**当前状态**: PP-OCRv5 中英文模型。

**改进方向**:
- 支持用户导入多语言模型（日语 / 韩语 / 阿拉伯语）
- 自动语言检测 + 模型切换

**挑战**: 每个语言模型 20-40MB，全语言覆盖会膨胀默认包。


### 6.7 PDF 高保真输出优化

**当前状态**: 高保真路径保留坐标和字体，但无法保留复杂排版。

**改进方向**:
- 保留原始 PDF 的图形对象（矢量图 / 渐变）
- 支持 PDF/A 归档格式输出

**挑战**: PDF 规范复杂，完全保真需要深度解析原始 PDF 结构。


### 6.8 性能优化

**当前瓶颈**:
- 大文件（> 50MB）解压慢
- OCR 单页识别 > 2s

**改进方向**:
- 解压使用 Web Worker 并行
- OCR 使用 GPU 加速（WebGPU 优化）
- 分块转换（不一次性加载全文档）

**挑战**: Web Worker 数量受限，过度并行会导致浏览器卡顿。


### 6.9 测试覆盖率提升

**当前覆盖率**: ~60%（基于 c8 统计）。

**改进方向**:
- 核心模块覆盖率 >= 80%
- 格式模块覆盖率 >= 70%
- 边界条件（空文档 / 超大文档）全覆盖

**挑战**: 测试脚本数量已达 28 个，继续增加会拖慢 CI。


### 6.10 文档完善

**当前状态**: 核心文档齐全，但用户指南简陋。

**改进方向**:
- 新增用户手册（安装 / 使用 / 故障排查）
- 新增开发者指南（架构 / 新增格式 / 调试）
- 新增视频教程

**挑战**: 文档维护成本高，需要与代码同步更新。


---

## 7. 关键指标总结

| 指标 | 数值 | 说明 |
|---|---|---|
| 项目版本 | v2.3.0 | 262 commits |
| 支持格式 | 14 输入 / 11 输出 | 含实验性 DOC/OFD |
| 测试脚本 | 28 个 | `npm test` 串联执行 |
| 核心模块 | 65 个 JS 文件 | `public/core/` |
| 资源预算 | core <= 460KB | `public/` total <= 2MB（排除 vendor）|
| 依赖数量 | 2 个 dependencies | express + puppeteer |
| OCR 引擎 | 2 个 | PP-OCRv5 + Tesseract.js |
| 安全问题修复 | 4 个 P1 | ZIP Bomb / XSS / 资源泄漏 |
| 性能优化 | 3 个 | base64 / XLSX / 响应性 |

---

## 8. 核心经验总结

1. **本地优先是约束也是优势**: 隐私保护和离线可用是核心竞争力，但需要配套完善的资源预算和测试门禁。

2. **模型架构决定转换质量**: 单一 DocumentModel 无法承载所有格式语义，多模型 + 显式 Mapper 是正确方向。

3. **安全防护必须多层**: ZIP Bomb / XSS / 网络监控缺一不可，且必须有自动化测试覆盖。

4. **性能优化靠测试驱动**: 没有 `resource-budget-test` 就没有轻量核心，没有性能基准就不知道哪里慢。

5. **OCR 本地化是技术突破**: PP-OCRv5 + ONNX Runtime + WebGPU 证明浏览器端可以运行复杂模型。

6. **测试是质量保障**: 从 0 个测试到 28 个测试，每个重大 bug 都推动测试策略演进。

7. **文档与代码同等重要**: SECURITY_POLICY / RESOURCE_BUDGET / MULTI_MODEL_ARCHITECTURE 是决策依据，不是事后补充。

8. **用户反馈驱动优先级**: 首页空白 / OCR 不触发 / PDF 输出重叠都是用户报告的真实问题。

---

## 8. 代码审核经验（2026-06-23）

### 8.1 全面代码审核发现的关键问题

**审核方法**: High Effort（10 角度 × 8 候选 + 验证 + 扫尾）  
**审核范围**: 全代码库（15,757 行）  
**发现**: 15 个问题（1 P0, 3 P1, 7 P2, 4 P3）

#### P0: 资源预算检查完全失效 (Issue #181)

**问题**: `_checkResourceBudget` 调用 `getCapabilities(f)` 期望返回单个对象，但实际返回数组。访问数组的 `.resourceBudget` 返回 `undefined`，导致预算检查总是提前返回。

**根因**: 类型混淆 - 方法返回数组但调用者期望对象。

**影响**: 所有输入大小限制被绕过，用户可上传任意大小文件，导致浏览器崩溃或 OOM。

**修复**:
```javascript
// 错误：
const m = this.getCapabilities(f)?.resourceBudget?.maxInputBytes;

// 正确：
const capabilities = this.capabilityDetails?.get(f);
const m = capabilities?.resourceBudget?.maxInputBytes;
```

**教训**: 
- 类型混淆是常见 bug 来源，TypeScript 或 JSDoc 可以预防
- 资源预算等安全关键功能必须有单元测试覆盖

#### P1: XLSX 日期转换错误 (Issue #182)

**问题**: Excel 错误地将 1900 年视为闰年，序列号 60 代表不存在的 1900-02-29。代码未补偿此 bug，且使用错误的 epoch (1899-12-30)，导致 1900 年 3 月 1 日前的日期偏移 1 天。

**根因**: 历史兼容性问题未在代码中显式处理。

**影响**: 数据完整性问题，历史日期数据不准确。

**修复**:
```javascript
function excelSerialDateToIso(serial) {
  const days = Number(serial);
  if (!Number.isFinite(days)) return String(serial ?? "");
  
  // 补偿 Excel 1900 闰年 bug
  let adjustedDays = days;
  if (days > 60) adjustedDays -= 1;
  
  // 使用正确的 epoch
  const epoch = Date.UTC(1899, 11, 31);
  const date = new Date(epoch + adjustedDays * 86400000);
  return date.toISOString().slice(0, 10);
}
```

**教训**:
- 历史兼容性需要显式处理，不能依赖"应该正确"的假设
- 所有兼容性决策应该文档化并有测试覆盖

#### P1: HTML 实体解析崩溃 (Issue #183)

**问题**: `decodeHtmlEntities` 在调用 `String.fromCodePoint()` 前缺少 Unicode 范围验证（0x0 到 0x10FFFF）。无效实体如 `&#x110000;` 抛出 RangeError，导致转换失败。

**根因**: 输入验证不完整。

**影响**: 恶意或格式错误的 HTML 导致转换崩溃。

**修复**:
```javascript
.replace(/&#x([0-9a-f]+);/gi, (_, n) => {
  const code = Number.parseInt(n, 16);
  return (code >= 0 && code <= 0x10FFFF) ? String.fromCodePoint(code) : '�';
})
```

**教训**:
- 所有外部输入必须完整验证
- 边界值测试（最大有效值、超出范围）必不可少

#### P1: Worker 异步转换取消竞态 (Issue #184)

**问题**: 异步转换路径的 `activeConversion.reject` 函数抛出错误而不是正确拒绝 Promise。用户取消时，`reject()` 抛出的错误未被捕获，Promise 永远不会 reject。

**根因**: Promise 取消逻辑设计错误 - `reject` 函数不在 Promise 执行器上下文中。

**影响**: 取消操作后 UI 状态不恢复，按钮保持禁用。

**修复**:
```javascript
reject: (error) => {
  // 只调用 abort，让 Promise 链自然拒绝
  abortController.abort();
  // 不抛出错误
}
```

**教训**:
- 异步取消逻辑容易出错，应标准化取消模式
- Promise 链的错误处理需要特别小心

### 8.2 代码审核方法论

#### 多角度审核有效

10 个独立审核角度捕获了不同类型的问题：
1. Workers 正确性（并发、取消）
2. App.js 正确性（状态管理、DOM）
3. Formats 正确性（解析、编码）
4. Server 安全性（路径遍历、头部）
5. Core 正确性（资源预算、验证）
6. 简化机会（深度嵌套、重复代码）
7. 代码复用（重复实现、不一致）
8. 效率问题（冗余计算、循环扫描）
9. 高度审核（CLAUDE.md 规范合规）
10. 扫尾角度（捕获遗漏）

#### 验证步骤关键

6 个初始候选经验证被 REFUTED（如 Express.static 路径遍历保护、Worker 取消竞态的早期判断）。验证流程防止了误报。

#### 常见问题模式

1. **类型混淆**: 期望对象但收到数组（#181）
2. **边界验证缺失**: Unicode 范围、资源预算（#181, #183）
3. **历史兼容性**: Excel 1900 闰年 bug（#182）
4. **状态一致性**: 并行更新、异步读取（#188, #192）
5. **变异副作用**: 预期不可变但实际变异（#187, #189）

### 8.3 修复流程最佳实践

1. **每个修复独立提交** - 便于回滚和追踪
2. **修复前先写测试** - TDD 方法论确保问题可复现
3. **完整测试套件验证** - 确保无回归
4. **清晰的提交信息** - 包含问题、修复、验证、关联 Issue

本次修复：
- 4 个 P0/P1 问题
- 7 个独立提交
- 3 个新测试文件（24 个测试用例）
- 所有测试通过（EXIT_CODE: 0）

---

## 附录：相关文档

- [README.md](README.md) - 项目简介
- [CHANGELOG.md](CHANGELOG.md) - 版本变更记录
- [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) - 安全策略
- [docs/RESOURCE_BUDGET.md](docs/RESOURCE_BUDGET.md) - 资源预算
- [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) - 多模型架构
- [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) - 转换路由
- [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md) - OCR 验证清单
- [docs/development-standards/05_QUALITY_GATES.md](docs/development-standards/05_QUALITY_GATES.md) - 质量门禁
- [AUDIT_REPORT.md](AUDIT_REPORT.md) - 代码审核报告

---

**维护者**: Trans2Former Team  
**最后更新**: 2026-06-23
