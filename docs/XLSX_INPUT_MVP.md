# XLSX Input MVP

版本：v0.2.0
状态：P3 生效
最后更新：2026-04-30

XLSX input MVP 复用 ZIP/OOXML 容器基础设施，将工作表文本映射为 `DocumentModel` table。

## 当前支持

- 读取 `xl/workbook.xml`。
- 读取 `xl/_rels/workbook.xml.rels`。
- 读取 `xl/sharedStrings.xml`。
- 读取 `xl/worksheets/*.xml`。
- 读取 `xl/styles.xml` 中基础 date style。
- 每个 sheet 生成一个 heading。
- 每个 sheet 的第一行作为 table headers，其余行作为 rows。
- 公式单元格保留为 `=FORMULA => cachedValue`，不在浏览器端重新计算公式。
- 常见日期格式单元格转换为 ISO date。
- 合并单元格输出 `XLSX_MERGED_CELLS_APPROXIMATED` warning。
- Metadata 记录 sheet count、formula cell count、compression methods 和 entry count。

## 当前限制

- 不重新计算公式，只保留公式表达式和缓存值。
- 只处理基础日期格式，不完整还原全部 Excel 自定义数字格式。
- 暂不还原图表、图片、批注、条件格式和复杂样式。
- P3 支持 stored / deflate ZIP entries，但暂不支持 ZIP64 和 data descriptor。
