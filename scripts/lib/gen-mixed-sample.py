# 生成仿真中英文混排 PDF：表单字段 + 表格 + 双栏 + 多页，模拟真实办公文档。
# 使用 reportlab 的 CID 字体（STSong-Light，Adobe-GB1，不嵌入字体文件）——这是最常见的
# 中文 PDF 形态，也正好覆盖 pdfjs CMap 加载路径。
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

OUT = "samples/generated/mixed-cn-en-form.pdf"
W, H = A4  # 595.27 x 841.89 pt

c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle("Customer Information Form 客户信息表")

# ---------- 第 1 页：表单 ----------
c.setFont("STSong-Light", 16)
c.drawCentredString(W / 2, H - 60, "客户信息表 Customer Information Form")

c.setFont("STSong-Light", 10)
c.drawCentredString(W / 2, H - 80, "Form No. 表格编号: field__id__legacy-A102  Rev. 2026-09")

# 双列表单字段：左列标签 x=60，值 x=200；右列标签 x=320，值 x=460
fields_left = [
    ("姓名 Name:", "张三 Zhang San"),
    ("客户编号 Account ID:", "ACCT-10245"),
    ("日期 Date:", "2026-09-24"),
    ("电子邮箱 Email:", "zhangsan@example.com"),
]
fields_right = [
    ("电话 Phone:", "+86 138-0000-1234"),
    ("币种 Currency:", "人民币 CNY"),
    ("金额 Amount:", "$1,234.56"),
    ("税率 Tax Rate:", "13.00%"),
]
y = H - 130
for (label, value), (rlabel, rvalue) in zip(fields_left, fields_right):
    c.setFont("STSong-Light", 11)
    c.drawString(60, y, label)
    c.drawString(200, y, value)
    c.drawString(320, y, rlabel)
    c.drawString(460, y, rvalue)
    y -= 24

# 地址块（多行英文 + 中文）
c.setFont("STSong-Light", 11)
c.drawString(60, y, "账单地址 Billing Address:")
c.drawString(200, y, "42 Cedar Road, Pudong")
y -= 20
c.drawString(200, y, "Shanghai 200120, China 中国上海")
y -= 36

# 表格：5 列，英文表头 + 混排内容
c.setFont("STSong-Light", 12)
c.drawString(60, y, "明细 Items")
y -= 22
headers = ["Item 项目", "Description 描述", "Qty 数量", "Unit Price 单价", "Amount 金额"]
rows = [
    ["A-101", "伺服电机 Servo Motor", "2", "¥3,200.00", "¥6,400.00"],
    ["B-205", "精密齿轮 Precision Gear", "10", "¥85.50", "¥855.00"],
    ["C-310", "Controller 控制器", "1", "¥12,000.00", "¥12,000.00"],
]
col_x = [60, 160, 300, 370, 470]
row_h = 20
table_w = 480
x0, ytop = 60, y
for r, row in enumerate([headers] + rows):
    for i, cell in enumerate(row):
        c.setFont("STSong-Light", 10 if r else 10)
        c.drawString(col_x[i] + 3, ytop - r * row_h - 14, cell)
# 表格框线
for r in range(len(rows) + 2):
    c.line(x0, ytop - r * row_h, x0 + table_w, ytop - r * row_h)
for i in range(len(col_x)):
    c.line(col_x[i], ytop, col_x[i], ytop - (len(rows) + 1) * row_h)
c.line(x0 + table_w, ytop, x0 + table_w, ytop - (len(rows) + 1) * row_h)
y = ytop - (len(rows) + 1) * row_h - 40

# 混排长段落（自动换行效果由手工断行模拟）
c.setFont("STSong-Light", 11)
para = [
    "备注 Remarks: 本订单包含 Rush Delivery 加急服务费。All prices are",
    "subject to final confirmation 以最终确认为准。付款方式 Payment Terms:",
    "Net 30 days 自发票开具之日起计算。",
]
for line in para:
    c.drawString(60, y, line)
    y -= 20

c.showPage()

# ---------- 第 2 页：条款与签名区 ----------
c.setFont("STSong-Light", 14)
c.drawString(60, H - 60, "条款 Terms and Conditions")
c.setFont("STSong-Light", 10)
terms = [
    "1. Delivery 交付: The Supplier shall deliver the Goods 货物 within 15 business days.",
    "2. Warranty 保修: 保修期为十二个月 Twelve (12) months from the date of acceptance.",
    "3. Liability 责任: Total liability shall not exceed 100% of the Contract Price 合同总价.",
    "4. Governing Law 适用法律: 本合同受中华人民共和国法律管辖。This Contract is",
    "   governed by the laws of the People's Republic of China.",
]
y = H - 90
for line in terms:
    c.drawString(60, y, line)
    y -= 20

y -= 30
c.setFont("STSong-Light", 11)
c.drawString(60, y, "供方签字 Supplier Signature:")
c.drawString(320, y, "需方签字 Buyer Signature:")
y -= 40
c.drawString(60, y, "Date 日期: ____________")
c.drawString(320, y, "Date 日期: ____________")

c.showPage()
c.save()
print(f"generated: {OUT}")

# 用 pypdf 验证一下外部可读性
from pypdf import PdfReader
r = PdfReader(OUT)
print(f"pages: {len(r.pages)}")
text = r.pages[0].extract_text() or ""
print(f"pypdf page1 chars: {len(text)}")
print("sample:", text.replace("\n", " | ")[:160])
