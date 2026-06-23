# Dynamic Chunking And Merge Design

版本：v0.1.0
状态：规划中
最后更新：2026-04-26

## 目标

对单个超大文件执行动态拆分转换：先把文件切成可独立处理的语义子模块，分别转换为局部 `DocumentModel`，再执行结构化合并。合并后的转换产品应与直接整文件转换在语义结构、资源引用、顺序、warnings 和输出质量上没有可感知差异，同时避免超大文件一次性读入内存导致卡顿或崩溃。

## 基本流程

```text
large input file
-> chunk planner
-> chunk reader
-> per-chunk parser/converter
-> partial DocumentModel[]
-> merge planner
-> merged DocumentModel
-> output writer
```

## 拆分原则

- 优先按格式天然边界拆分：Markdown 标题/段落、HTML 节点、CSV 行、XML 节点、PDF 页、DOCX 段落/表格、PPTX 幻灯片、XLSX 工作表。
- 不在语义结构中间硬切：代码块、表格行组、XML 标签、HTML 节点、图片资源、压缩包 entry 不能被破坏。
- 每个 chunk 必须携带顺序、来源范围、上下文摘要和资源引用表。
- 允许 overlap/context window，用于处理跨块链接、脚注、标题层级、表格连续性和列表连续性。

## 合并原则

- 保持顺序稳定：输出 blocks 顺序等同直接转换。
- 合并连续结构：跨 chunk 的段落、列表、表格、代码块、章节要按规则恢复。
- 资源去重：相同图片、附件、字体等 asset 合并为稳定 id。
- warnings 合并：保留来源 chunk、分类、严重度和去重后的说明。
- metadata 合并：保留全局 metadata，并记录 chunk provenance 供调试。

## 等价性要求

动态拆分转换结果应与直接转换结果满足：

- block 类型、顺序、正文文本一致或语义等价。
- 表格 headers、rows、单元格内容一致。
- 列表连续性不被错误打断。
- 标题层级不漂移。
- asset 数量和引用关系一致或可解释去重。
- Markdown/HTML/JSON 输出快照一致，或仅存在已登记的可解释差异。

## 测试策略

- small-file equivalence：同一小文件同时走直接转换和 chunk 转换，比较 DocumentModel 与输出快照。
- boundary tests：专测表格跨块、代码块跨块、XML/HTML 嵌套跨块、列表跨块、脚注跨块。
- large-file tests：100MB、500MB、1GB+ 样例记录内存峰值、耗时、取消恢复和合并正确性。
- merge tests：人工构造 partial DocumentModel，验证合并算法。

## 非目标

- 不为了分块绕过 `DocumentModel`。
- 不牺牲转换质量换取分块速度。
- 不把远程服务作为处理超大文件的默认路径。
