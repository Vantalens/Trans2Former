# MarkItDown Research Notes

版本：v0.1.0  
状态：生效  
最后更新：2026-04-25

参考项目：https://github.com/microsoft/markitdown

## 结论

`microsoft/markitdown` 对 Trans2Former 有借鉴价值，但不适合作为运行时依赖直接接入。

原因：

- MarkItDown 是 Python 工具链，Trans2Former 当前目标是浏览器端 JavaScript 应用。
- MarkItDown 的定位是将多种文件转为 Markdown，便于 LLM 和文本分析；Trans2Former 的目标是多格式之间任意互转。
- MarkItDown 可通过可选依赖和插件扩展格式，Trans2Former 应吸收“格式适配器/能力注册”的架构思想，但实现必须保持浏览器端可运行。

## 可借鉴点

1. 结构优先的 Markdown 输出
   - 输出应尽量保留标题、列表、表格、链接、图片等语义结构。
   - 本轮已补充 Markdown table -> DocumentModel table -> HTML/Markdown 输出能力。

2. Converter/插件式思路
   - 不同格式以独立适配器接入。
   - Trans2Former 已通过 `ConverterRegistry` 管理 read/write/capability。

3. 安全边界
   - 明确外部文件解析存在风险。
   - Trans2Former 不执行输入 HTML 中的脚本，复杂格式解析后续也应默认沙箱化在 Worker 中。

4. 面向 AI/自动化的干净文本
   - TXT/Markdown/JSON 输出应保持可读、可 diff、可被模型消费。
   - 后续快照测试应覆盖结构降级结果。

## 不直接采用的部分

- 不引入 Python runtime。
- 不引入本地 Office、LibreOffice、Pandoc、Playwright 等依赖。
- 不把项目目标收窄成“所有格式只转 Markdown”。

## 后续优化任务

- 完善 Markdown 表格、链接、图片、脚注等结构解析。
- 为 DOCX/EPUB/PPTX 建立独立 format adapter，而不是中心化硬编码。
- 扩展 capability table，暴露格式降级策略和安全限制。