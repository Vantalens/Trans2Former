# P9-A.1 OCR Baseline Design (契约 + 占位 + 接入点)

状态：生效
日期：2026-05-28
前置基础：S1 矩阵真值 / S2 Repair Engine / S3 Model Cache / UI-A 三视图重构 / [2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-A.2 接入轻量 OCR runtime / P9-A.3 端到端 PNG + 扫描 PDF / P9-B OCR→FixedLayoutModel / P9-C 转换后检验三层 / P9-D 高级 OCR

## 目标

为 OCR 转换链路提供**可被未来真实引擎接入的代码契约与占位实现**，但不引入任何 OCR runtime（Tesseract / PaddleOCR / MinerU），不修改 Tauri CSP，不实际跑推理。

P9-A.1 落地后：
- 任何未来的 OCR 引擎，只要构造一个符合 `OCREngine` 接口的对象并 `defaultOCRRegistry.register(engine)`，立刻获得：路径调度（`pickForTask("ocr-text")`）、结构化 OCRResult 数据契约（含语言、页面、行、置信度、bbox）、统一 warning 编号、安全中心 UI 显示位、Repair Engine `modelReview` 回填位。
- PNG reader 现在能感知 OCR engine 状态：未启用时输出 `OCR_UNAVAILABLE` info 级 warning，但仍按"图片资产"路径产生 SemanticDoc，不阻塞 md / txt / html 输出。

## 数据契约

### `OCRResult`

```js
{
  schemaVersion: "trans2former.ocr-result.v1",
  language: "zh-CN" | "zh-TW" | "en" | "ja" | "ko" | "auto",
  pages: [
    {
      pageIndex: number,        // >= 0
      width: number,             // >= 0
      height: number,            // >= 0
      lines: [
        {
          text: string,
          confidence: number,    // in [0, 1]
          bbox: { x, y, w, h } | null,
        }
      ]
    }
  ],
  fullText: string,
  averageConfidence: number,    // in [0, 1]
  runtimeMs: number,             // >= 0
  engine: string,                // engine id
  modelVersion: string,
  warnings: Warning[],           // 可选 OCR_LOW_CONFIDENCE 等
}
```

`createOCRResult` 自动填默认字段并深度冻结；`validateOCRResult` 在缺字段、未知 language、非数组 pages、超出 [0,1] 的置信度等情况下抛 `ConversionError({ code: "OCR_RESULT_INVALID" })`。`summarizeOCRResult` 返回 `{ pageCount, lineCount, averageConfidence, fullTextLength, engine, modelVersion, runtimeMs, language }`，供 modelReview / QualityReport 引用。

### `OCREngine` 接口

```js
{
  id: string,                       // 全局唯一，非空，如 "placeholder"、"tesseract-zh"
  taskCapabilities: ["ocr-text"],   // 必须非空数组
  manifestId?: string,              // 对应 defaultModelCache 的 manifestId
  isAvailable(): boolean,
  recognize({ image, options }): Promise<OCRResult>,
}
```

- 不强制 `engine` 是 class 或 Object.create — 任何符合接口的 plain object 都能注册。
- `isAvailable()` 必须是同步函数（PNG reader 同步签名需要）；`recognize` 必须是异步函数。
- `manifestId` 为可选字段；若指定，建议与 ModelCacheRegistry 中已 register 的 manifest 一致。

### `OCREngineRegistry`

```
register(engine)        // 检查接口合规、ID 不重复
unregister(id)
has(id), list(), pickById(id)
pickForTask(task)       // 优先 isAvailable === true 的 engine；都不可用时返回最后一条
onChange(callback)
reset()
```

错误编号：`OCR_ENGINE_INVALID` / `OCR_ENGINE_DUPLICATE` / `OCR_ENGINE_UNKNOWN`。

`defaultOCRRegistry` 是模块级单例，由 `ocr-bootstrap.js` 在第一次 import 时注册 `placeholderOCREngine`。

### Warning 编号

- `OCR_UNAVAILABLE`（info） —— OCR engine 未启用或未注册时由 reader / convert pipeline 注入。
- `OCR_LOW_CONFIDENCE`（lossy） —— 真实 engine 接入后，averageConfidence 低于阈值时使用。
- `OCR_ENGINE_FAILED`（lossy） —— recognize 抛错时降级使用。
- `OCR_DEGRADED_ROUTE`（info） —— 整条路径被强制降级到 fallback 时使用。

所有 warning 工厂在 `public/core/ocr/ocr-warnings.js` 中。

## 运行时模块

| 文件 | 职责 |
| --- | --- |
| [`public/core/ocr/ocr-result.js`](../../../public/core/ocr/ocr-result.js) | OCRResult 契约 + `createOCRResult` / `validateOCRResult` / `summarizeOCRResult` |
| [`public/core/ocr/ocr-warnings.js`](../../../public/core/ocr/ocr-warnings.js) | OCR warning code 常量 + 工厂函数 |
| [`public/core/ocr/ocr-engine.js`](../../../public/core/ocr/ocr-engine.js) | `OCREngine` 接口校验 + `OCREngineRegistry` + `defaultOCRRegistry` 单例 |
| [`public/core/ocr/placeholder-engine.js`](../../../public/core/ocr/placeholder-engine.js) | `placeholderOCREngine` —— 永远 unavailable，调用 recognize 抛 `OCR_UNAVAILABLE` |
| [`public/core/ocr/ocr-bootstrap.js`](../../../public/core/ocr/ocr-bootstrap.js) | 副作用模块：import 时把 placeholder engine 注册到 `defaultOCRRegistry`、对应 manifest 注册到 `defaultModelCache` 并立刻设为 `disabled` |

[`public/browser-transformer.js`](../../../public/browser-transformer.js) 顶层 `import "./core/ocr/ocr-bootstrap.js"` 触发副作用，并把 OCR 模块的所有 API export 出去，P9-A.2 接入真实 engine 时一处 import 即可。

## 接入点

### PNG reader

[`public/formats/png.js`](../../../public/formats/png.js) 在 `readPng` 末尾调用 `defaultOCRRegistry.pickForTask("ocr-text")`：

- engine 不可用 → `metadata.warnings` 注入 `OCR_UNAVAILABLE`，含 `engineId` / `manifestId` / `reason`。
- engine 可用 → P9-A.2 在这里调用 `engine.recognize(...)` 把 OCR 文本作为 paragraph blocks 插入 SemanticDoc；recognize 抛错时降级到现有 image asset 路径并发 `OCR_ENGINE_FAILED`。

PNG reader 同步签名不变；P9-A.2 接入真实 engine 时可以选择：
1. 把 reader 切成 async（影响 format-registry.js read() 签名）。
2. 或新增 convert pipeline 的"OCR enhancement stage"在 read 之后异步增强 model。

建议走 (2)，把 reader 保持 pure 同步、async OCR 作为独立 stage 注入。本 spec 不在 P9-A.1 阶段决定。

### Repair Engine `modelReview`

`defaultRepairEngine.runCycle` 在生成 `modelReview` 占位字段时，P9-A.2 真实 engine 接入后可以把 `summarizeOCRResult(result)` 输出回填进去，使 QualityReport 可观察。`tasks` 数组可以扩展为 `["lossy-warning-scan", "route-class-check", "ocr-text-recognition"]`。

### 安全中心

S3 已经搭好的「模型缓存」card 在 `defaultModelCache.onChange` 时自动刷新；bootstrap 注册 placeholder manifest 后立即显示「OCR 文字识别 · 占位」条目，状态显示「已禁用」，提示文案说明"等待 P9-A.2 接入真实模型"。无需改 UI 代码。

## 守门

新增脚本 [`scripts/ocr-baseline-test.js`](../../../scripts/ocr-baseline-test.js) 10 组断言：
- Schema 常量稳定（OCR_RESULT_SCHEMA_VERSION、OCR_LANGUAGES、OCR_WARNING_CODES.length === 4）。
- `createOCRResult` 冻结结果 + 字段填充 + `summarizeOCRResult` 计算正确。
- `validateOCRResult` 拒绝错误 language / 非数组 pages / 越界 averageConfidence / 越界 runtimeMs / 错误页几何 / 错误行置信度。
- 4 个 warning 工厂返回正确 code / severity。
- `OCREngineRegistry`：register 合规校验、重复 register 抛 `OCR_ENGINE_DUPLICATE`、错误对象抛 `OCR_ENGINE_INVALID`。
- `pickForTask` 优先选 isAvailable 的 engine；都不可用时 fallback 到最后一条。
- `placeholderOCREngine.isAvailable() === false`；`recognize` 抛 `OCR_UNAVAILABLE`。
- `ensureOCRBootstrap` 幂等；调用后 `defaultModelCache.getStatus(PLACEHOLDER_OCR_MANIFEST_ID).status === STATUS_DISABLED`、`defaultOCRRegistry.pickForTask("ocr-text").id === "placeholder"`。
- PNG reader 在 placeholder 模式下注入 `OCR_UNAVAILABLE` warning（含 engineId/manifestId）。
- PNG reader 在临时注册可用 stub engine 后不再注入 `OCR_UNAVAILABLE`。

`scripts/local-model-direction-test.js` 守门关键词增加 `defaultOCRRegistry` / `createOCRResult` / `OCR_UNAVAILABLE` / `placeholderOCREngine`。

`scripts/local-security-test.js` 自动覆盖 `public/core/ocr/**`：5 个文件 0 命中 `fetch` / `localStorage` / `XHR` / `WebSocket`，保持 local-only。

## 不引入

- 不引入 Tesseract.js、PaddleOCR、PaddleOCR-VL、MinerU 或任何第三方 OCR runtime。
- 不修改 Tauri CSP / capabilities。
- 不写实际 OCR 推理代码；不创建真实 OCR 测试 fixture。
- 不引入新 npm 依赖；`optionalDependencies` 保持仅含 `pdfjs-dist`。
- 不动 Repair Engine、转换核心、其它 reader / writer、UI 路由与预览。
- 不动产品矩阵（PNG 输出仍是 `["html","txt","json","pdf"]`）。

## 未来扩展（P9-A.2+，不在本 spec 范围）

- 把 Tesseract.js core 资源 vendor 到 `public/vendor/tesseract/`（类似 `sync-pdfjs-vendor.js`），实现 `TesseractEngine` 子类。
- 用户启用 OCR 时本地导入 tessdata 到 IndexedDB；SHA-256 校验通过后通过 `defaultModelCache.setStatus(manifestId, STATUS_AVAILABLE)` 激活。
- 修改 Tauri CSP 让 wasm 与 worker 加载。
- 引入扫描 PDF 渲染管线（pdfjs canvas → toBlob → recognize）。
- OCR 文本作为 paragraph blocks 写入 SemanticDoc；附 confidence 信息进入 RepairAction.evidence。
- Repair Engine 把 `summarizeOCRResult` 回填到 `modelReview`，让 QualityReport 携带 OCR 证据。
