# 生成真实世界样本文件：python-docx / openpyxl / reportlab / GBK 编码文本
import os
import docx
from docx.shared import Pt, RGBColor
import openpyxl
from openpyxl.styles import Font, PatternFill
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

OUT = "samples/realworld"
os.makedirs(OUT, exist_ok=True)

# 1. 真实 DOCX：标题样式、编号列表、表格、图片占位、页眉
doc = docx.Document()
doc.add_heading("季度运营报告", 0)
doc.add_heading("一、业绩概览", 1)
doc.add_paragraph("本季度营收为 1,230 万元，同比增长 15%。其中核心业务占比 78%，新业务占比 22%。")
p = doc.add_paragraph()
run = p.add_run("重点：")
run.bold = True
p.add_run("华东区域超额完成目标，完成率 112%。")
doc.add_heading("二、待办事项", 1)
for item in ["完成客户回访", "更新产品手册", "筹备年度会议"]:
    doc.add_paragraph(item, style="List Number")
table = doc.add_table(rows=3, cols=3)
table.style = "Table Grid"
for i, row in enumerate([["指标", "目标", "实际"], ["营收(万元)", "1100", "1230"], ["客户数", "85", "92"]]):
    for j, val in enumerate(row):
        table.rows[i].cells[j].text = val
doc.save(f"{OUT}/report.docx")

# 2. 真实 XLSX：样式、合并单元格、公式
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "销售数据"
ws.append(["月份", "销售额", "增长率"])
for row in [["一月", 12500, None], ["二月", 13800, "=C2*1.1"], ["三月", 15200, "=C3*1.1"]]:
    ws.append(row)
ws["A1"].font = Font(bold=True, color="FF0000")
ws.merge_cells("A6:C6")
ws["A6"] = "备注：数据截至季度末"
wb.save(f"{OUT}/sales.xlsx")

# 3. 真实 PDF：reportlab + STSong-Light CID 字体（典型中文 PDF 做法）
pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
c = canvas.Canvas(f"{OUT}/chinese.pdf", pagesize=A4)
c.setFont("STSong-Light", 16)
c.drawString(72, 780, "年度总结报告")
c.setFont("STSong-Light", 11)
y = 750
for line in [
    "一、工作回顾",
    "本年度完成了三个重点项目，覆盖华东、华南两个区域。",
    "二、数据分析",
    "营收增长 15%，客户满意度达到 92%。",
    "English mixed line: revenue reached $1.23M in Q3.",
    "三、未来展望",
    "计划在明年扩展至五个新城市。",
]:
    c.drawString(72, y, line)
    y -= 24
c.save()

# 4. GBK 编码 TXT（中文 Windows 默认）
with open(f"{OUT}/gbk.txt", "wb") as f:
    f.write("会议纪要\n\n时间：2026年10月\n地点：上海\n\n一、议题讨论\n参会人员一致认为方案可行。\n二、后续安排\n由张三负责跟进。".encode("gbk"))

# 5. GBK 编码 CSV
with open(f"{OUT}/gbk.csv", "wb") as f:
    f.write("姓名,部门,工资\n张三,技术部,15000\n李四,市场部,12000\n王五,人事部,11000\n".encode("gbk"))

# 6. UTF-8 无 BOM CSV（对照）
with open(f"{OUT}/utf8.csv", "w", encoding="utf-8") as f:
    f.write("姓名,部门,工资\n张三,技术部,15000\n")

print("generated:", os.listdir(OUT))
