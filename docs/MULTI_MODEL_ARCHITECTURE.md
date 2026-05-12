# Multi-Model Architecture

版本：v0.1.0
状态：方案落地，分阶段实施（P8-M1 ~ M6）
最后更新：2026-05-12

## 设计原则

Trans2Former 的转换核心从"单一 `DocumentModel`"升级为**五个并列规范模型 + 一个共享资产图**。每个模型只承载它擅长的对象语义，不再硬塞跨类对象到同一个 9-block 容器里。

- **规范模型不是文件**：是 reader/writer 之间的内存对象，不存盘、不序列化为 docx/html 文件作为中转。
- **不写 N×N 直连**：reader 输出某个规范模型，writer 消费某个规范模型，跨模型走显式 mapper。
- **降级显式可见**：跨模型 mapper 必发 warning，质量等级写入 `qualityReport`，不静默丢信息。
- **本地优先不变**：所有模型在 worker / 主线程内部流转，不走网络。external engine 一律插件化，核心包不引依赖。

## 五个规范模型

### SemanticDoc

承载流式语义文档：标题、段落、列表、引用、表格、代码、行内格式（粗体/斜体/链接/行内代码）、脚注、交叉引用。

| 字段 | 含义 |
|---|---|
| `title` | 文档标题 |
| `lang` | 语言标记，影响换行与字体 fallback |
| `blocks[]` | 块级节点：heading / paragraph / list / quote / code / table / image / asset / raw |
| `inlines[]` | 行内节点（嵌在 paragraph/heading 等里）：strong / em / link / code-inline / del / sup / sub |
| `footnotes[]` | 脚注定义，与正文中的 `{type:"footnote-ref", id}` 配对 |
| `metadata` | warnings / sourceSpan / qualityReport / provenance |

**reader 来源**：md, html, txt, json, xml, docx, epub, doc。
**writer 目标**：md, html, txt, json, xml, docx, epub。

### WorkbookModel

承载工作簿：sheet、cell、merge、formula cache、style hint。

| 字段 | 含义 |
|---|---|
| `sheets[]` | 工作表数组 |
| `sheets[].name` | 工作表名 |
| `sheets[].cells[]` | 单元格 `{ref, value, formula, style, type}` |
| `sheets[].merges[]` | 合并单元格区域 `{from, to}` |
| `sheets[].columns[]` | 列宽和样式 |
| `definedNames[]` | 命名区域 |
| `metadata` | 同 SemanticDoc |

**reader 来源**：csv, xlsx。
**writer 目标**：csv, xlsx。

### SlideModel

承载演示稿：slide、shape、speaker notes、layout slot。

| 字段 | 含义 |
|---|---|
| `slides[]` | 幻灯片数组 |
| `slides[].layout` | 布局名 |
| `slides[].shapes[]` | 形状节点 `{type, bbox, text, asset, style}` |
| `slides[].notes` | 演讲者备注（SemanticDoc） |
| `master` | 母版引用 |
| `metadata` | 同 SemanticDoc |

**reader 来源**：pptx。
**writer 目标**：pptx。

### FixedLayoutModel

承载固定页面：page、textRun、glyph、bbox、annotation、signature。

| 字段 | 含义 |
|---|---|
| `pages[]` | 页面数组 |
| `pages[].size` | `{width, height, unit}` |
| `pages[].textRuns[]` | 文本块 `{text, bbox, fontSize, fontWeight, fontFamily}` |
| `pages[].annotations[]` | 注释/链接 `{type, bbox, target}` |
| `pages[].signatures[]` | 签章占位 |
| `pages[].assets[]` | 页内图像引用 |
| `metadata` | 同 SemanticDoc，含 `provenance.engine`（pdfjs / ofdrw / ocr-plugin / ...） |

**reader 来源**：pdf, ofd, png（经 OCR/layout 插件）。
**writer 目标**：pdf, png。

### AssetGraph

跨模型共享的资产图，把图片、字体、媒体、附件、来源溯源统一管理。

| 字段 | 含义 |
|---|---|
| `assets{id}` | 资产对象 `{mime, bytes, hash, sourceRef}` |
| `references{}` | 哪些模型块在引用这个资产 |
| `provenance{}` | 每个资产的来源溯源（哪个 reader、哪个文件、哪一页） |

不再像旧 `DocumentModel.assets[]` 那样挂在每个模型里，而是顶层共享。同一份图片在 docx 正文和 pptx 备注里出现时不重复存储。

## DocumentModel 兼容别名

旧代码里的 `DocumentModel` 保留为 `SemanticDoc` 的别名。`createDocumentModel(...)` / `createParagraph(...)` / `createHeading(...)` 等 API 行为不变，内部转新结构。**外部调用方零改动**。

需要使用 inline 节点时调用新 API：

```js
import { createInlineStrong, createInlineLink } from "./core/models/semantic-doc.js";
createParagraph([
  "Hello ",
  createInlineStrong("world"),
  ", visit ",
  createInlineLink({ text: "site", href: "https://example.com" })
]);
```

字符串入参仍然支持，自动包裹成 plain inline。

## 跨模型 Mapper

不写 N×N 直连函数，跨模型走显式 mapper。每个 mapper 必带降级 warning：

| Mapper | 方向 | 损耗等级 | 强制 warning |
|---|---|---|---|
| `semanticToWorkbook` | SemanticDoc.table → WorkbookModel | low | `MODEL_NO_FORMULA_INFO` |
| `workbookToSemantic` | WorkbookModel → SemanticDoc.table | low | `MODEL_STYLE_DROPPED`, `MODEL_FORMULA_AS_VALUE` |
| `semanticToSlide` | SemanticDoc.heading/list → SlideModel | medium | `MODEL_LAYOUT_AUTO_GENERATED` |
| `slideToSemantic` | SlideModel.shapes → SemanticDoc | medium | `MODEL_VISUAL_LAYOUT_DROPPED` |
| `semanticToFixedLayout` | SemanticDoc → FixedLayoutModel（程序化排版） | medium | `MODEL_PAGINATION_AUTO_GENERATED` |
| `fixedLayoutToSemantic` | FixedLayoutModel → SemanticDoc | high | `MODEL_VISUAL_FIDELITY_LOST`, `MODEL_TEXT_ORDER_HEURISTIC` |
| `workbookToFixedLayout` | WorkbookModel → FixedLayoutModel（仅打印路径） | medium | `MODEL_SHEET_TO_PAGE_PRINT_ONLY` |
| `slideToFixedLayout` | SlideModel → FixedLayoutModel（导出 PDF） | medium | `MODEL_ANIMATION_DROPPED` |

反向 mapper 不全：`fixedLayoutToWorkbook` / `fixedLayoutToSlide` 不实现，必须先 `fixedLayoutToSemantic` 再目标转换，明确双重 warning。

## 与现有架构的关系

| 现有组件 | 在新架构中的位置 |
|---|---|
| `public/core/document-model.js` | 改名为 `models/semantic-doc.js`；旧文件保留为兼容 re-export |
| `public/core/document-audit.js` | 升级为模型无关：所有 5 个模型共用 audit 字段 |
| `public/core/asset-store.js` | 演化为 `models/asset-graph.js`，跨模型共享 |
| `public/core/format-registry.js` | 升级为 Capability Registry，详见 [CONVERSION_ROUTING.md](CONVERSION_ROUTING.md) |
| `public/core/warnings.js` | 不变，仍然是 info / lossy / unsupported / security / performance 五级 |
| `public/core/plugin-runtime.js` | 增加 `engine-bridge` 类型，详见 [PLUGIN_DISTRIBUTION.md](PLUGIN_DISTRIBUTION.md) |

## 不做什么（明确边界）

- **不引入 DOCX / HTML / PDF 文件级 pivot**：pivot 是内存对象，不是落盘文件。
- **不在核心包引入 LibreOffice / Pandoc / OCR**：external engine 全部插件化。
- **不破坏 local-only / no-network processing**：所有模型流转在浏览器内或桌面 worker 内。
- **不允许任何 mapper 静默丢信息**：跨模型必发 warning，并写入 qualityReport。
- **不强求 14×11 矩阵全可用**：UI 显示不推荐路径但加严重 warning，不"假装能用"。

## 阶段实施

详细 milestone 见 [DEVELOPMENT_TASKS.md](../DEVELOPMENT_TASKS.md) P8。每个 M1-M6 独立可验收，不破坏旧路径。
