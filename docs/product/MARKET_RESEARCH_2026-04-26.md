# Market Research Notes

日期：2026-04-26

## 调研结论

Trans2Former 后续任务应从“任意格式互转”收敛为三条市场路径：

1. **AI-ready Markdown 路径**
   - MarkItDown、GetMarkdown、RawMark、Markitdown Online 都把 PDF、DOCX、PPTX、XLSX、HTML、CSV、JSON、XML 转 Markdown 作为核心卖点。
   - 这说明市场正在把“文档转换”用于 RAG、索引、知识库、LLM 输入清洗，而不只是人工阅读。
   - Trans2Former 应优先保证 `Office/PDF/HTML/Data -> DocumentModel -> Markdown/HTML/JSON` 的稳定输出。

2. **PDF/Office 高频办公路径**
   - Smallpdf、CloudConvert 等成熟产品把 PDF 与 Word/Excel/PowerPoint/Image 互转放在首页或 API 核心能力。
   - PDF to Office 高保真恢复很难，CloudConvert 也将其作为专业 API 能力强调准确率。
   - Trans2Former 在桌面 Web-GUI 路线下，应先做“可解释降级”的 PDF/Office 提取与 Markdown/HTML 输出，同时把高保真 PDF/OFD/Office 作为分阶段攻坚路线。

3. **隐私、本地、批量路径**
   - GetMarkdown、RawMark 等产品突出浏览器本地转换、文件不保存、多文件/ZIP 下载。
   - 这与 Trans2Former 的本地桌面工作台定位一致，应强化本地转换、批量处理、ZIP 导出、错误可解释、文件大小限制提示。

## 来源

- Microsoft MarkItDown: https://github.com/microsoft/markitdown
- GetMarkdown: https://www.getmarkdown.com/
- Smallpdf: https://smallpdf.com/
- CloudConvert Document Converter: https://cloudconvert.com/document-converter
- CloudConvert PDF to Office API: https://cloudconvert.com/apis/pdf-to-office
- RawMark: https://rawmark.tech/
