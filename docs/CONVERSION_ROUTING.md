# Conversion Routing

版本：v0.1.0
状态：方案落地，分阶段实施
最后更新：2026-05-12

[CONVERSION_PATHS.md](CONVERSION_PATHS.md) 仍然是当前生效的产品路径矩阵。本文档是 P8 之后的目标设计，描述 Capability Registry 自动派生路径的机制。

## 痛点回顾

`public/core/format-registry.js` 现有的 `ALLOWED_OUTPUTS_BY_INPUT` 是手写表，每加一个格式都要在多处同步：reader 注册、`ALLOWED_OUTPUTS_BY_INPUT`、UI 矩阵、smoke 测试断言。手写表无法表达"质量等级"和"是否推荐"，UI 也只能用 boolean。

## 新机制：Capability Registry + Route Planner

### Capability 声明

每个 reader / writer 注册时声明：

```js
registry.registerReader("pdf", {
  read: readPdf,
  inputModels: ["FixedLayoutModel"],   // 这个 reader 能产出哪些规范模型
  qualityGrade: "enhanced",
  warnings: ["PDF_TEXT_ORDER_APPROXIMATED"],
  ...
});

registry.registerWriter("md", {
  write: writeMarkdown,
  acceptModels: ["SemanticDoc"],        // 这个 writer 接受哪些规范模型
  qualityGrade: "ai-ready",
  ...
});
```

模型间的 mapper 单独注册：

```js
registry.registerMapper({
  from: "FixedLayoutModel",
  to: "SemanticDoc",
  fn: fixedLayoutToSemantic,
  lossLevel: "high",
  forcedWarnings: ["MODEL_VISUAL_FIDELITY_LOST", "MODEL_TEXT_ORDER_HEURISTIC"],
});
```

### Route Planner

`getAllowedOutputs(from)` 不再读硬编码表，而是计算：

```
1. reader[from].inputModels 给出可达模型集合 M0
2. 从 M0 出发，走 mapper 图（BFS），扩展出可达模型集合 M*
3. 收集所有 writer w 满足 w.acceptModels ∩ M* ≠ ∅
4. 输出格式列表 = w.format
5. 按"模型距离 + lossLevel"给每条路径打分（hot / warm / cold）
```

**hot**：reader → writer 共享同一模型，无 mapper（如 `md → md`、`xlsx → xlsx`）。
**warm**：经过一次 low-loss mapper（如 `csv → md`：WorkbookModel → SemanticDoc.table）。
**cold**：经过一次 high-loss mapper 或多次 mapper 链（如 `pdf → docx`：FixedLayoutModel → SemanticDoc → DOCX）。

UI 显示时按温度排序，cold 路径打 ⚠️ 标记。

### 路径示例

| 用户请求 | Planner 推导路径 | 温度 |
|---|---|---|
| md → html | reader=md→SemanticDoc → writer=html | hot |
| md → docx | reader=md→SemanticDoc → writer=docx | hot |
| csv → md | reader=csv→Workbook → mapper.workbookToSemantic → writer=md | warm |
| pdf → md | reader=pdf→FixedLayout → mapper.fixedLayoutToSemantic → writer=md | cold |
| pdf → docx | reader=pdf→FixedLayout → mapper.fixedLayoutToSemantic → writer=docx | cold |
| xlsx → docx | reader=xlsx→Workbook → mapper.workbookToSemantic → writer=docx | warm |
| pptx → md | reader=pptx→Slide → mapper.slideToSemantic → writer=md | warm |
| pptx → docx | reader=pptx→Slide → mapper.slideToSemantic → writer=docx | warm |
| pptx → xlsx | reader=pptx→Slide → mapper.slideToSemantic → mapper.semanticToWorkbook → writer=xlsx | cold |
| png → md | reader=png→FixedLayout（OCR 插件）→ mapper.fixedLayoutToSemantic → writer=md | cold（依赖插件） |
| ofd → pdf | reader=ofd→FixedLayout → writer=pdf | warm |

## 不推荐路径

某些路径技术上可达但语义勉强（如 `pptx → xlsx`、`xlsx → pptx`、`pdf → epub`），Capability Registry 标记为 `not-recommended: true`：

- UI 仍然显示，但默认不在快捷选项里
- 转换时强制弹一条 `policy` 级 warning：`PATH_NOT_RECOMMENDED`
- qualityReport 注明"非推荐路径，输出仅供查看"

## External Engine Bridge

桌面环境（Tauri）下可以选择装本地引擎插件：LibreOffice / Pandoc / Calibre / ofdrw。

manifest 字段：

```json
{
  "type": "engine-bridge",
  "bridges": [
    { "from": "docx", "to": "pdf", "engine": "libreoffice", "command": "soffice --convert-to pdf" },
    { "from": "pdf",  "to": "docx", "engine": "libreoffice" }
  ],
  "securityScope": ["sidecar:soffice"],
  "requiresLocalBinary": "soffice"
}
```

行为：

- 装了 bridge 插件且本地有对应二进制，**Route Planner 优先选 bridge 路径**（温度 hot），核心 mapper 路径作为 fallback
- 浏览器端 bridge 不暴露（沙箱不允许调本地命令）
- bridge 失败自动回落到核心 mapper，发 `BRIDGE_FALLBACK` warning，不阻塞主流程
- bridge 调用全程 local-only，不允许带网络权限

## 与 CONVERSION_PATHS.md 的关系

| 文档 | 内容 |
|---|---|
| [CONVERSION_PATHS.md](CONVERSION_PATHS.md) | 当前 P0~P7 生效的产品路径矩阵，硬编码在 ALLOWED_OUTPUTS_BY_INPUT |
| 本文档 | P8 之后的目标设计，矩阵从 reader/writer/mapper 声明自动派生 |

P8-M1 完成后两者合并，CONVERSION_PATHS.md 改为引用本文档生成的矩阵快照。

## 程序层规则

P8-M1 完成后：

- `getAllowedOutputs(from)` 改为 Planner 计算，不再读硬编码表
- `ConverterRegistry.convert()` 必须先调 Planner 选路径，校验通过才执行
- 不支持的路径返回 `UNSUPPORTED_CONVERSION_PATH`，未注册 reader/writer 返回 `UNSUPPORTED_INPUT_FORMAT` / `UNSUPPORTED_OUTPUT_FORMAT`
- 新增格式时只改 reader/writer 注册和（如必要）添加 mapper，矩阵自动更新
- [scripts/conversion-capability-audit-test.js](../scripts/conversion-capability-audit-test.js) 用 Planner 输出做矩阵稳定性断言

## 阶段实施

详细 milestone 见 [DEVELOPMENT_TASKS.md](../DEVELOPMENT_TASKS.md) P8-M1。先做"零行为变化"重构：把现有路径矩阵用新机制描述出来，旧 ALLOWED_OUTPUTS_BY_INPUT 删除前自动比对一致。
