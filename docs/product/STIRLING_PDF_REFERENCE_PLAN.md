# Stirling-PDF Reference Plan for Trans2Former

版本：v0.1.0
状态：方案草案
日期：2026-06-27

## 1. 背景

Stirling-PDF 是一个 PDF 工具平台，而不是单纯的格式转换器。它的可借鉴价值主要在产品组织方式：把 PDF 处理拆成明确的小工具，再用工作台、历史、批处理、API 和部署形态把这些工具串起来。

Trans2Former 当前定位是本地优先的多格式文档转换工作台，已经具备格式注册、产品矩阵、模型路由、质量报告、OCR 和 repair cycle 的基础。下一步不应盲目扩格式，而应先把真实转换链路修复到可用，再围绕高频文档任务建设工作台。

## 2. Stirling-PDF 可迁移思路

### 2.1 工具货架化

Stirling-PDF 将能力组织为用户任务，而不是输入输出矩阵：

- 页面操作：合并、拆分、旋转、重排、提取页面、添加页码、删除空白页。
- 转换：Office / 图片 / HTML / Markdown / Email 到 PDF，以及 PDF 到 Word / 图片 / 文本 / CSV / HTML / XML / PDF-A。
- 内容编辑：图片提取与添加、印章、元数据、颜色替换、附件、表单。
- 安全：密码、权限、水印、签名、证书签名、签名验证、脱敏、sanitize。
- 自动化：Multi-Tool、pipeline、批处理和 API。

Trans2Former 应参考这种任务分类，把用户入口从“选择输入格式和输出格式”提升为“我要完成什么任务”。

### 2.2 Stateful Workbench

Stirling-PDF V2 的关键产品思路是 upload once, chain operations。文件进入工作台后，可被多个工具复用，并保留操作历史。

Trans2Former 的对应目标：

- 上传后形成本地 asset record，包含文件名、格式、MIME、大小、内容引用、预览状态和转换历史。
- 工具操作只消费 asset id，不要求重复上传。
- 每次转换生成 operation record，记录输入、输出、参数、warnings、qualityReport、错误详情和可下载结果。
- 支持撤销、重试、另存为和继续处理。

### 2.3 UI 与 API 同构

Stirling-PDF 的多数工具都有 API。Trans2Former 是浏览器优先项目，不必照搬 Spring Boot，但应让每个工具有统一 descriptor：

```js
{
  id: "convert-md-to-pdf",
  category: "convert",
  inputTypes: ["md"],
  outputTypes: ["pdf"],
  optionsSchema: {},
  handler: convertHandler,
  qualityGates: ["rule-diff", "ssim", "ocr-readback"],
  offlineDependencies: ["pdfjs"]
}
```

同一份 descriptor 应服务于工具目录、UI 表单、worker payload、测试矩阵和用户文档。

### 2.4 部署分层

Stirling-PDF 有桌面、浏览器、自托管服务、Docker fat / ultra-lite 等形态。Trans2Former 应保留本地优先和零上传底线，但可以借鉴“能力按环境启用”的表达方式：

- Web 基础版：轻量文本、HTML、Markdown、CSV、JSON、XML。
- Web 增强版：PDF.js、OCR、OOXML、XLSX、PPTX。
- Tauri 桌面版：文件关联、批处理目录、后台任务、离线模型缓存。
- 发布包：随包 vendor 校验、无网络处理阶段、可清理本地缓存。

## 3. Trans2Former 优先级

### P0：修复真实转换链路

这是所有方案的前提。必须证明以下路径可用：

1. 打开 Web UI。
2. 上传或输入真实内容。
3. 自动识别输入格式。
4. 输出格式下拉框按产品矩阵刷新。
5. 点击转换。
6. 主线程或 worker 完成转换。
7. 预览区展示结果。
8. 下载按钮可生成正确文件。
9. 质量报告和错误详情可解释。

最低验证路径：

- TXT -> HTML
- Markdown -> HTML
- Markdown -> PDF
- DOCX -> Markdown
- PDF -> Markdown
- CSV -> XLSX
- XLSX -> CSV

### P1：任务式工具目录

在 P0 稳定后，把现有格式矩阵包装成任务入口：

- 转换文档
- 转换为 PDF
- 从 PDF 提取内容
- OCR 扫描件
- 表格互转
- 查看质量报告

先不实现所有 Stirling 工具，只重组现有能力，降低用户理解成本。

### P2：PDF 高频工具

优先选择浏览器端可控、无需外部二进制的 PDF 工具：

- PDF 合并
- PDF 拆分
- PDF 旋转
- PDF 重排
- PDF 文本提取
- PDF 元数据查看
- PDF OCR

压缩、签名、深度脱敏、PDF/A 和复杂编辑可以后置，因为它们需要更强的 PDF 写入和安全验证。

### P3：Pipeline / Batch

做最小可用批处理：

- 多文件队列。
- 操作步骤列表。
- 顺序执行。
- 每步输出状态、错误和下载项。
- 完成后打包下载。

## 4. 架构落点

### 4.1 Tool Descriptor Registry

新增工具注册层，但不替代当前 `ConverterRegistry`：

- `ConverterRegistry` 继续负责格式读写、模型路由和质量报告。
- `ToolRegistry` 负责用户任务、输入约束、参数 schema、UI 分类和批处理执行。
- 转换类工具内部调用 `convertContent` / `convertContentAsync`。

### 4.2 Workbench Asset Store

短期可先使用内存状态，后续再落 IndexedDB：

- `assets`: 上传文件和中间结果。
- `operations`: 每次工具执行记录。
- `downloads`: 可下载产物。
- `errors`: 脱敏后的错误详情。

### 4.3 Repair and Verification First

所有新工具必须先接入可验证链路：

- 成功路径要能下载和预览。
- 失败路径要显示 `ConversionError` 的 category / code / format / message。
- 质量报告必须显示 routeTemperature、routeClass、warnings、repairStatus、finalDecision。

## 5. 本次修复执行路线

本轮先不实现 P1/P2/P3 新功能，专注 P0：

1. 跑现有转换相关测试，确认当前失败点。
2. 用最小真实样例复现 UI 或核心转换失败。
3. 追踪 `app.js -> convertWithWorker -> browser-transformer.js -> ConverterRegistry` 数据流。
4. 写失败测试覆盖根因。
5. 只修复根因，不做无关重构。
6. 跑相关测试和必要的端到端 smoke。
7. 更新本方案或测试文档中的验证记录。

## 6. 成功标准

- 至少一个自动化测试能覆盖本轮发现的转换链路根因。
- 核心转换 smoke、worker payload、browser smoke、conversion snapshot / quality 相关测试通过，或明确记录已有基线门禁。
- 真实用户路径不再出现“点击转换后所有格式均失败”的共性错误。
- 错误信息如果仍存在，必须指向具体格式或具体能力缺失，而不是共享链路崩溃。

## 7. 不做事项

- 不引入 LibreOffice、Pandoc、云端 OCR 或远程转换 API。
- 不照搬 Stirling-PDF 的 Spring Boot 后端。
- 不新增大型运行时依赖。
- 不在修复链路时顺手重构整个 UI。
- 不把低保真路径包装成稳定互转能力。
