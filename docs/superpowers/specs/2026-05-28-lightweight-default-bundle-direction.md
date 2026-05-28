# Lightweight Default Bundle + On-Demand Model Direction

状态：生效（覆盖 2026-05-27 spec 中冲突部分）
日期：2026-05-28
适用范围：默认安装包形态、OCR / 版面 / 表格能力交付方式、转换后检验路线、P9 阶段分解
前置基础：S1 矩阵真值与方向同步门禁、S2 Repair Engine 与审核数据契约
被替换文档：[../specs/2026-05-27-local-document-model-auto-repair-output-closure-design.md](2026-05-27-local-document-model-auto-repair-output-closure-design.md) 中「模型随桌面安装包内置」「正式安装包包含 model assets」相关段落

## 一、项目定位确认

Trans2Former 的核心定位保持为：

> 本地优先的多格式文档转换工具。核心转换依靠可测试的软件算法完成；OCR、版面分析和转换后校验作为核心内置增强能力按需加载，并始终在本机执行。

项目不走云端 OCR / 云端 AI / 远程转换路线，也不恢复插件路线。

## 二、核心原则

1. **主转换仍然依靠软件算法**

   - Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、PPTX、PDF 等格式转换，仍然主要依靠自研 reader / mapper / writer。
   - 不允许把 LLM / VLM 作为核心转换器。
   - AI / OCR 只负责识别、辅助结构恢复、质量检验，不直接负责生成最终文件。

2. **坚持本地优先**

   - 用户文档、图片、文件名、转换结果、错误日志不得上传。
   - 不接入远程 OCR API、云端 AI API、第三方转换 API。
   - 所有 OCR、版面分析、质量检验必须在用户本机执行。

3. **放弃插件路线**

   - 不再设计 plugin install / external plugin marketplace。
   - OCR、OFD、版面分析、表格恢复、高保真渲染等能力作为核心内置模块演进。
   - 但「核心内置」不等于「默认全部打包」，重能力仍然按需启用、按需加载。

4. **默认安装包必须保持轻量**

   - 默认包不内置 PaddleOCR-VL、Qwen-VL、MinerU 等 GB 级模型。
   - 默认包只包含主程序、基础转换能力、必要的轻量依赖。
   - 目标安装包体积控制在 30–80 MB 左右。
   - OCR 模型资源应在用户首次启用 OCR 时单独下载或本地配置。

## 三、OCR 路线

OCR 分成两层：

### 1. 轻量 OCR 模式

目标：

- 图片文字识别
- 扫描 PDF 基础识别
- 中英文基础 OCR
- OCR 结果转 TXT / Markdown / PDF
- 普通电脑 CPU 可运行

实现要点：

- 第一阶段可使用 Tesseract.js 或轻量 PaddleOCR / PP-OCR。
- OCR 资源不进入默认主包，首次启用时提示用户下载本地 OCR 资源。
- 下载完成后模型保存在本地 model-cache。
- 整个识别过程不得联网上传文档。

### 2. 高级 OCR / 文档解析模式

目标：

- 复杂扫描 PDF
- 表格恢复
- 公式识别
- 多栏版面
- 图表识别
- 阅读顺序恢复
- 高质量版面分析

实现要点：

- 后续接入 PaddleOCR-VL / MinerU 等本地文档解析模型。
- 这类模型体积可能达到 1 GB 以上，不得默认内置。
- 用户主动启用高级模式时，明确提示模型体积、硬件要求、运行成本。
- 仍然必须本地执行，不调用远程 API。

## 四、OCR 接入架构

OCR 不作为独立产品功能孤立存在，而应该进入现有转换链路。推荐流程：

```text
PNG / 扫描 PDF
  ↓
Page Rasterizer
  ↓
OCR Engine
  ↓
Layout Recovery
  ↓
FixedLayoutModel
  ↓
fixedLayoutToSemantic
  ↓
目标 Writer
```

OCR 输出不应该直接变成 Markdown，而应该先进入固定版式模型。

建议新增核心目录：

```text
public/core/ocr/
├── ocr-engine.js
├── ocr-types.js
├── image-preprocess.js
├── light-ocr-engine.js
├── paddleocr-bridge.js
└── ocr-quality.js

public/core/layout/
├── layout-recovery.js
├── reading-order.js
├── table-recovery.js
└── fixed-layout-builder.js

public/core/verification/
├── rule-verifier.js
├── visual-diff.js
├── ocr-roundtrip.js
└── quality-score.js
```

这些不是插件目录，而是核心内置模块目录。

## 五、模型与工具选择

```text
默认转换：
  自研 reader / mapper / writer

轻量 OCR：
  Tesseract.js 或轻量 PaddleOCR / PP-OCR

高级 OCR：
  PaddleOCR-VL / MinerU

转换后检验：
  规则 diff + SSIM + OCR 回读

不推荐：
  云端 OCR API
  通用 VLM 直接生成目标文件
  默认内置 GB 级模型
```

PaddleOCR 不需要调用云 API，可以本地运行。但 PaddleOCR-VL 体积较大，应作为高级本地 OCR 资源按需下载，而不是默认打包。

## 六、转换后文件检验

转换后检验是 Trans2Former 的核心增强点，分三层：

### 1. 规则级检验

不用 AI，直接检查：

- 页数是否异常变化
- 文本长度是否明显减少
- 图片数量是否丢失
- 表格数量是否丢失
- 标题数量是否异常
- 是否出现空白页
- 是否出现乱码
- 是否出现异常超长行

### 2. 视觉级检验

用于高保真转换路径：

```text
源文件渲染为页面图片
目标文件渲染为页面图片
逐页 SSIM / pixel diff
异常页写入 QualityReport
```

先做非 AI 版 SSIM，不一开始引入大模型。

### 3. OCR 回读检验

本项目的重要差异化能力：

```text
源文档文本 / OCR 文本
  ↓
目标文档渲染截图
  ↓
目标截图 OCR
  ↓
源文本与目标 OCR 文本 diff
  ↓
生成质量报告
```

可检测：

- 漏字
- 乱码
- 内容丢失
- 表格文字丢失
- 图片中文字丢失
- 页眉页脚丢失
- 排版导致的文本不可读

## 七、质量报告接入

所有 OCR、版面恢复、转换后检验结果都应该写入现有 QualityReport / warnings 机制，不另起一套报告系统。示例形态：

```json
{
  "score": 0.91,
  "textConsistency": 0.96,
  "layoutConsistency": 0.88,
  "assetConsistency": 0.93,
  "ocrConfidence": 0.89,
  "issues": [
    {
      "severity": "warning",
      "page": 3,
      "type": "OCR_LOW_CONFIDENCE",
      "message": "第 3 页部分文字 OCR 置信度较低，建议人工复核。"
    },
    {
      "severity": "error",
      "page": 5,
      "type": "TEXT_CONTENT_LOST",
      "message": "第 5 页转换后疑似存在文本丢失。"
    }
  ]
}
```

## 八、开发阶段建议（P9-A/B/C/D）

### P9-A：OCR 基线

目标：

- PNG 能本地 OCR
- 扫描 PDF 能先渲染成页面图片，再 OCR
- 输出 OCRResult
- 接入 warnings / QualityReport

不要求：

- 完美表格恢复
- 公式识别
- 复杂版面恢复

### P9-B：OCR 到模型

目标：

- OCRResult → FixedLayoutModel
- FixedLayoutModel → SemanticDoc
- 保留 bbox、confidence、page index、reading order
- 对视觉损耗和阅读顺序推断发 warning

### P9-C：转换后检验

目标：

- 规则 diff
- 文本 diff
- SSIM 视觉对比
- OCR roundtrip 检验
- 统一写入 QualityReport

### P9-D：高级 OCR

目标：

- 接入 PaddleOCR-VL / MinerU
- 支持表格、公式、复杂版面、多栏文档
- 模型资源按需下载
- 明确体积、运行内存、降级路径和失败提示

P9-A 之前还需要先完成 **S3：按需下载与本地缓存治理**，定义 model-cache 目录结构、manifest 字段、checksum 校验、可清理入口、断网降级提示和首次启用的下载提示流程。

## 九、最终决策

Trans2Former 后续不应该变成「AI 文档转换器」，而应该变成：

> 确定性格式转换 + 本地 OCR + 本地版面恢复 + 转换质量检验的文档转换系统。

最终策略：

```text
默认主程序：
  轻量、本地、可测试、无云端依赖

OCR：
  核心内置能力，但按需启用、按需下载模型

高级 OCR：
  独立本地模型资源，不进入默认安装包

转换检验：
  规则 diff + SSIM + OCR 回读，作为项目核心差异化能力
```

一句话总结：

> 主转换靠软件算法，OCR 和质量检验作为本地核心增强；坚持不上传、不调用云 API、不默认内置大模型，以「轻量默认包 + 按需本地 OCR + 高级模型独立资源」的方式落地。

## 与 2026-05-27 spec 的差异点

| 维度 | 2026-05-27 spec | 本 spec（2026-05-28） |
| --- | --- | --- |
| 模型交付方式 | 「正式桌面安装包包含 document recognition and review model assets」 | OCR 模型资源不进入默认安装包；首次启用时本地下载到 model-cache |
| 默认安装包形态 | 未给具体体积上限，仅说「分项体积报告」 | 目标 30–80 MB；构建后必须报告主程序、轻量依赖、空 model-cache 总和 |
| OCR / layout / table 资源 | 「随应用升级替换」「manifest 记录模型资产」（暗示打包） | 按 OCR 启用动作触发下载；manifest、checksum、缓存路径、可清理入口、断网降级提示作用于下载缓存目录而非安装包 |
| 高级 OCR（PaddleOCR-VL / MinerU） | 与轻量 OCR 同列在「内置模型 manifest」下 | 明确为「独立本地模型资源，不进入默认安装包」，启用时明确提示体积与硬件要求 |
| 阶段编排 | S3「本地模型运行容器与交付治理：接入内置模型目录」 | S3 重新定义为「按需下载与缓存治理」；其后依次推进 P9-A/B/C/D |
| 转换后检验 | 未单独成阶段 | 提升为 P9-C 核心差异化能力，包含规则 diff、SSIM、OCR 回读三层 |

不受影响（继续生效）：

- 五个并列规范模型（SemanticDoc / WorkbookModel / SlideModel / FixedLayoutModel / AssetGraph）。
- S2 Repair Engine 设计与实现（[../../core/repair-engine.js](../../../public/core/repair-engine.js) 等）。
- 「不依赖云端 OCR/AI、processing 阶段禁联网、不上传任何文档内容」边界。
- 产品矩阵真值与文档守门（S1 矩阵 / 方向同步测试）。
