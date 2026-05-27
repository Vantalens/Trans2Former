# PDF Single-Page Visual Regression Design

状态：待实施
日期：2026-05-27
阶段：P9-A
前置基础：P8-B 已完成执行型 Workbook/Semantic 路由与高风险路径分级

## 目标

将现有 `scripts/visual-comparison-test.js` 从占位框架推进为可运行的视觉质量门禁，首批只验证已经具备真实输出能力的程序化 PDF 路径：

- `Markdown -> PDF`
- `HTML -> PDF`

本批验证“同一输入在固定渲染链上的输出视觉稳定性”，不声称解决 PDF 反向恢复、OFD 高保真渲染、扫描件 OCR 或 PPTX 版式保持。

## 范围边界

### 本批纳入

- 单页 PDF 产物的固定参数渲染。
- 两个稳定样例：正文/中文层级样例与表格/富文本样例。
- 视觉相似度评分、阈值判断和失败 JSON 报告。
- 经人工确认后的基线图像入库。
- 视觉测试接入项目测试命令。

### 本批排除

- OFD、扫描件和 OCR 视觉基线。
- PPTX 输出或 PDF 多页分页质量验证。
- 跨操作系统通用像素基线承诺。
- 运行时 UI 中的视觉 diff 查看器。
- 升级产品路径矩阵或提高任何高风险路径的质量等级。

上述排除项不是被放弃，而是必须等待真实 reader/writer payload、公开 fixture 或平台验证成立后单独进入后续阶段。

## 方案选择

### 采用方案：PDF 产物单页渲染基线

测试直接消费转换器生成的 PDF data URL，使用仓库已携带的 PDF.js 渲染第一页到确定尺寸的像素缓冲，再与已批准基线比较。此方案测量的是用户最终下载的 PDF 产物，而不是网页预览或 UI 布局。

### 未采用方案

| 方案 | 不采用原因 |
| --- | --- |
| 浏览器界面截图 diff | 混入工作台 CSS、窗口尺寸和浏览器绘制差异，不能证明 PDF writer 的产物质量。 |
| 同时启动 OFD/OCR/PPTX 视觉验证 | 当前没有对应的真实高保真写出或解析闭环，容易将占位能力误写为质量证据。 |
| 首批即支持多页与跨平台基线 | 显著扩大字体、分页和渲染环境变量，超出最小可验证增量。 |

## 架构

### 1. 测试数据流

```text
fixture source
  -> convertContent({ from, to: "pdf" })
  -> decode PDF data URL bytes
  -> PDF.js render page 1 with fixed scale / viewport
  -> RGBA pixel buffer
  -> compare against committed baseline pixel image
  -> similarity score + threshold result
  -> optional failure report and diff artifact
```

视觉测试不修改转换运行时的路由逻辑，也不依赖 UI。它只消费公开转换 API 的 PDF 输出，因此能够作为 writer 回归门禁独立执行。

### 2. 文件职责

| 文件 | 职责 |
| --- | --- |
| `scripts/visual-comparison-test.js` | 组织 fixture 转换、渲染、比较、阈值断言和控制台汇总。 |
| `scripts/lib/visual-comparison.js` | 提供纯函数像素相似度、差异统计与报告对象构建，便于 Node 测试覆盖。 |
| `tests/visual-baselines/pdf/` | 存放经人工确认的单页基线图像，只包含本批两个样例。 |
| `samples/md/chinese.md` | `Markdown -> PDF` 中文正文与标题层级视觉输入源。 |
| `samples/html/table-list.html` | `HTML -> PDF` 表格与列表视觉输入源。 |
| `tests/visual-reports/`、`tests/visual-diffs/` | 失败时生成的临时诊断产物，必须保持 git ignored。 |
| `package.json` | 增加视觉专项命令，并将稳定测试纳入 `npm test`。 |
| `docs/VISUAL_COMPARISON_PLAN.md` | 从历史占位计划更新为当前已落地范围、约束和后续阶段。 |
| `DEVELOPMENT_TASKS.md` | P9-A 实际完成并通过门禁后更新状态。 |

### 3. 渲染策略

- 统一使用仓库当前 PDF.js 资产和 Node 可执行适配链，不引入第二套 PDF 解析/渲染引擎。
- 首批仅渲染第一页，固定 viewport scale 和背景色。
- 基线生成与比较必须使用同一渲染配置，配置作为测试常量显式可见。
- 如果当前 Node 环境无法以 PDF.js 生成像素缓冲，则本阶段应先实现最小渲染适配，不改用网页截图替代 PDF 渲染。

### 4. 相似度与报告

本批的目标是建立稳定门禁，而不是证明绝对视觉质量。评分逻辑要求：

- 对完全相同像素返回满分。
- 对局部像素变化返回低于满分的分值，并暴露改变像素数量或改变比例。
- 单个 fixture 持有明确阈值；首次阈值依据已批准基线与固定渲染环境设定。
- 未达到阈值时测试失败，并生成机器可读 JSON 报告；差异图像只有在实现成本可控且不引入额外重型依赖时纳入本批。

报告至少记录：

```json
{
  "case": "markdown-to-pdf-basic",
  "threshold": 0.99,
  "score": 0.97,
  "changedPixels": 124,
  "baseline": "tests/visual-baselines/pdf/markdown-to-pdf-basic.png",
  "status": "failed"
}
```

### 5. 基线治理

- 基线只来自明确命名的固定 fixture，禁止以随手导出的用户文件生成。
- 基线初次生成后必须人工查看页面内容、中文显示和表格结构，再纳入提交。
- 常规 `npm test` 仅比较基线，不自动重写基线。
- 有意修改 PDF writer 后，如需要更新基线，必须随代码变更一起提交，并在 changelog 或任务状态中说明视觉变化原因。
- 临时报告和 diff 不作为源代码提交内容。

## 测试策略

实施按测试先行推进：

1. 为纯相似度函数写失败测试，覆盖相同图像、单点差异和尺寸不一致。
2. 为 PDF 渲染适配写失败测试，要求现有 PDF writer 生成的第一页能产出非空像素缓冲。
3. 为视觉测试 runner 写失败测试，要求缺失基线或低于阈值时产生可定位失败报告。
4. 生成并人工检查两份基线后，将视觉专项命令接入 `npm test`。
5. 运行项目既有发布验证链，证明本批不会改变转换矩阵、路由分类或 release 打包边界。

## 验收标准

1. `Markdown -> PDF` 与 `HTML -> PDF` 各至少一个固定样例进入视觉门禁。
2. 测试消费实际 PDF 产物并渲染第一页，不以网页截图或纯文本断言冒充视觉对比。
3. 相同基线通过；人为扰动的测试用例能够稳定失败并输出评分与报告定位信息。
4. 常规测试不会改写已提交基线，也不会提交运行时报告或 diff 文件。
5. `npm test`、`git diff --check`、`npm run release:prepare` 与 release ignore 核对通过。
6. 文档明确保留 OFD、OCR、PPTX 与多页 PDF 为后续证据阶段，不提升其现有能力声明。

## 风险与控制

| 风险 | 控制 |
| --- | --- |
| 字体或平台渲染差异导致不稳定 | 本批限定当前 Windows 开发/发布验证环境，固定 PDF.js 参数；跨平台基线留待 P7-B/P9 后续。 |
| 引入重型依赖扩大核心包 | 优先复用已携带的 PDF.js；任何新增依赖必须只服务测试侧且经过资源门禁确认。 |
| 基线更新掩盖回归 | 基线不自动更新，更新必须人工检查并与 writer 变更同提交。 |
| 测试范围被误解为高保真承诺 | 任务表、质量文档和路径说明继续将 OFD/PPTX 等路径维持为受限或生成型。 |

## 后续阶段

- P9-B：PDF 多页、分页与更复杂内容的视觉质量样例。
- P9-C：当 OFD 获得真实页面对象与本地渲染能力后，建立 OFD -> PDF/PNG 视觉证据。
- P9-D：当 OCR/layout 具备可运行本地实现后，增加扫描件恢复质量基线。
