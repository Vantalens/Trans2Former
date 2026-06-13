# Public Fixture Index

P4 fixture 分层索引：

| Layer | Purpose | Current regression entry |
| --- | --- | --- |
| basic | 基础格式和最小结构 | `samples/md/`, `samples/csv/`, `samples/json/`, `samples/xml/`, `samples/png/` |
| edge | 表格、链接、metadata、命名空间和边界结构 | `samples/md/table-code.md`, `samples/html/inline-media.html`, `samples/xml/namespace.xml` |
| large | 大文件、渐进预览和资源预算 | `samples/txt/long-lines.txt`, `scripts/p2-responsiveness-test.js` |
| lossy | 可解释降级和 warning 回归 | `samples/png/tiny-red.data-url.txt`, `scripts/p4-p5-p6-test.js` |
| security | 本地优先、禁联网 | `scripts/local-security-test.js`, `scripts/p4-p5-p6-test.js` |

重格式公开样例当前以可重新生成的程序化 fixture 为主，避免把版权不明的 Office/PDF/OFD 文件放进仓库。新增公开授权文件时必须登记来源、许可、层级和对应快照。

## 程序化样例语料（`npm run samples:generate`）

为压力测试转换、版面与三层检验能力，`scripts/generate-samples.js` 程序化产出覆盖全部受支持格式、复杂排版、大小不一的样例到 `samples/generated/`（已 gitignore，不入库）：

- **内容复杂度**：多级标题、嵌套列表、任务项、对齐表格、多语言代码块、嵌套引用、脚注、图片、CJK/RTL/emoji/实体/特殊字符。
- **大小分层**：`small`（KB 级）/ `medium`（百 KB 级）/ `large`（**≥ 3 MB**，文本类 3MB+，docx/pdf/xlsx/epub 经 writer 放大到 4–20 MB）。
- **格式覆盖**：md / html / txt / json / xml / csv 直接产出；docx / pptx / epub / pdf / xlsx 经项目自带 writer 程序化产出；png 经 `scripts/lib/png-encode.js` 编码。
- **覆盖缺口**：`doc`（无 writer，reader best-effort）/ `ofd`（无 writer，reader L0）在 `MANIFEST.json.coverageGaps` 登记，待 OFD 攻坚补齐。
- **复用**：内容 builder 在 `scripts/lib/sample-content.js`（纯函数、确定性），由 `scripts/sample-corpus-test.js` 在 small scale 做跨格式可读性回归（不写 3MB，纳入 `npm test`）。

用法：

```
npm run samples:generate                       # small + medium + large 全量
node scripts/generate-samples.js --tiers small # 只生成指定层
node scripts/generate-samples.js --out tmp/dir # 自定义输出目录
```

每次运行会清空并重建输出目录；`MANIFEST.json` 登记每个文件的格式、层级、字节数与来源。
