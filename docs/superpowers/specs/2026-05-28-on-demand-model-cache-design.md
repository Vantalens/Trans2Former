# On-Demand Model Cache Design (S3)

状态：生效
日期：2026-05-28
前置基础：S1 矩阵真值、S2 Repair Engine、UI-A 三视图重构、[2026-05-28-lightweight-default-bundle-direction.md](2026-05-28-lightweight-default-bundle-direction.md)
后续阶段：P9-A OCR 基线、P9-B OCR→FixedLayoutModel、P9-C 转换后检验三层、P9-D 高级 OCR

## 目标

为「OCR / 版面 / 表格 / 质量审核模型资源不进入默认安装包，首次启用时本地下载到 model-cache」的方向决策，提供**可被 P9-A 直接接入的代码契约与基础设施**，但不实际下载、不接入第三方 OCR 引擎、不修改 Tauri CSP。

S3 落地后：
- 任何未来的 OCR / layout / table / quality-reviewer 实现，只要构造合法的 `ModelManifest` 并 `defaultModelCache.register(manifest)`，立刻获得：
  - SHA-256 校验
  - 状态机（not-downloaded / importing / verifying / available / degraded / disabled）
  - 安全中心 UI 卡片自动渲染
  - 中文文案（首次启用 / 断网降级 / 清理）
  - 稳定的缓存路径：`model-cache/<task>/<engine>/<modelVersion>/...`
- Repair Engine 的 `modelReview` 元数据将能引用 `ModelCacheRegistry.getStatus(manifestId).summary` 把模型 manifest 信息回填到 QualityReport。

## 数据契约

### `ModelManifest`

```js
{
  schemaVersion: "trans2former.model-manifest.v1",
  manifestId: string,        // 全局唯一，如 "ocr-text.tesseract.1.0.0"
  task: "ocr-text" | "ocr-layout" | "ocr-table" | "quality-reviewer",
  engine: "tesseract" | "paddleocr" | "paddleocr-vl" | "mineru" | "custom",
  modelVersion: string,      // SemVer 或自定义版本串
  bundleSize: number,        // bytes，> 0
  quantization: "fp32" | "fp16" | "int8" | "none",
  minMemoryMB: number,       // >= 0
  sources: [{ kind, path, ... }],  // 用户导入文件路径或内置 vendor 路径，禁止远程 URL（CSP 也禁）
  checksums: {
    algorithm: "SHA-256",    // 锁死，禁用 MD5/SHA-1
    digest: string,          // hex
    perFile: { [relPath]: hex }
  },
  fallback: {
    onFailure: "skip-task" | "use-degraded-route" | "fail-quality-gate",
    message: string,
  },
  ui: {
    label: string,           // 用户可见任务名
    description: string,
    enableHint: string,
  }
}
```

`createModelManifest` 自动填默认字段并冻结深层对象；`validateModelManifest` 在缺字段、未知 task/engine、非 SHA-256、不存在的 fallback 策略等情况下抛 `ConversionError({ code: "MODEL_MANIFEST_INVALID" })`。

### 状态机

```
not-downloaded → importing → verifying → available
                      ↓             ↓        ↓
                  degraded ←────────┘        disabled (用户主动)
```

允许的状态常量：`STATUS_NOT_DOWNLOADED`、`STATUS_IMPORTING`、`STATUS_VERIFYING`、`STATUS_AVAILABLE`、`STATUS_DEGRADED`、`STATUS_DISABLED`。`setStatus` 接收未在列表中的状态会抛 `MODEL_CACHE_STATUS_INVALID`。

### 缓存路径

唯一格式 `model-cache/<task>/<engine>/<modelVersion>/<relative-file>`，由 `getCacheKey` / `getCacheDirectory` / `getCacheFilePath` 计算。任何函数都不能写文件系统（S3 阶段保持内存状态）；P9-A 接入时再桥接 IndexedDB / Tauri fs。

`fileName` 必须是相对路径，禁止 `..` / 绝对路径 / `\`，否则抛 `MODEL_CACHE_PATH_INVALID`。

## 运行时模块

| 文件 | 职责 |
| --- | --- |
| [`public/core/model-cache/manifest.js`](../../../public/core/model-cache/manifest.js) | `createModelManifest` / `validateModelManifest` / `summarizeManifest` / 常量 |
| [`public/core/model-cache/checksum.js`](../../../public/core/model-cache/checksum.js) | `sha256Hex` / `verifyChecksum`（crypto.subtle.digest） |
| [`public/core/model-cache/cache-paths.js`](../../../public/core/model-cache/cache-paths.js) | 缓存路径推导 |
| [`public/core/model-cache/availability.js`](../../../public/core/model-cache/availability.js) | `ModelCacheRegistry` + `defaultModelCache` + 状态常量 |
| [`public/core/model-cache/ui-text.js`](../../../public/core/model-cache/ui-text.js) | 4 类任务的中文 UI 文案常量 |

全部模块对外通过 [`public/browser-transformer.js`](../../../public/browser-transformer.js) 顶层导出，P9-A 实施时 `import { defaultModelCache, createModelManifest, sha256Hex, ... } from "./browser-transformer.js"` 即可。

## UI 接入

安全中心 dialog (`public/index.html`) 新增「模型缓存」card：

```
┌── 模型缓存 · model-cache ───────────────────┐
│ 规划任务：文字 OCR / 版面分析 / 表格恢复 / 质量审核 │
│                                              │
│  ┌── 文字 OCR · tesseract · 1.0.0 ─ 未启用 ─┐ │
│  │  12 MB · 首次启用本地导入                  │ │
│  └─────────────────────────────────────────┘ │
│  （S3 阶段：尚未注册模型清单）               │
└──────────────────────────────────────────────┘
```

由 [`public/security-center.js`](../../../public/security-center.js) 的 `renderModelCache` 渲染，监听 `defaultModelCache.onChange` 自动刷新。S3 阶段无任何 register 调用，因此卡片显示空状态文案；P9-A 接入第一条 manifest 后自动出现条目。

## 不引入

- **不引入 npm 依赖**：SHA-256 用浏览器/Node 内置 `crypto.subtle.digest`。
- **不实际下载模型**：sources 数组现阶段只接受 user-provided / vendor-bundle 两种 kind；不出现远程 URL；不调用 fetch。
- **不修改 Tauri CSP**：`connect-src 'self'` 保留。
- **不修改 Repair Engine**：S2 接口与 P9-A 接入点保持稳定。
- **不持久化状态**：S3 阶段所有状态在内存 Map 中；P9-A 接入实际下载机制时再决定 IndexedDB / Tauri fs。

## 守门

- 新增脚本 [`scripts/model-cache-test.js`](../../../scripts/model-cache-test.js) 覆盖 manifest 校验、checksum、缓存路径、状态机、UI 文案 9 组断言。
- [`scripts/local-model-direction-test.js`](../../../scripts/local-model-direction-test.js) 多模型架构守门增加 `defaultModelCache` / `MODEL_TASKS` / `MODEL_ENGINES` / `createModelManifest` 关键词锁定。
- [`scripts/local-security-test.js`](../../../scripts/local-security-test.js) 自动覆盖 `public/core/model-cache/**` —— 这 5 个文件不含 `fetch` / `localStorage` / `XHR` / `WebSocket`，符合 local-only 默认策略。

## 未来扩展（P9 之后实施，不在本 spec 范围）

- IndexedDB / Tauri fs 持久化：把已校验通过的模型字节落地，下次启动免重新导入。
- 模型来源治理：vendor-bundle 走仓库内 sample manifest；user-provided 走"选择文件"对话框。仍然不引入远程 URL。
- Repair Engine 集成：把 `modelReview` 中 engine / modelVersion 替换为实际 manifest 数据。
- 安全中心管理操作：手动清理、禁用、强制重新校验入口。
