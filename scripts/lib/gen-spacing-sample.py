# 生成空格压测 PDF：逐字符加字距（模拟 pdf.js 按字形拆 item 且带几何间距的场景）、
# 逐词正常词距、正常行，验证 shouldSeparatePdfItems 是否会插入多余空格。
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
OUT = "samples/generated/spacing-stress.pdf"
W, H = A4
c = canvas.Canvas(OUT, pagesize=A4)

c.setFont("STSong-Light", 11)
c.drawString(60, H - 80, "Normal spacing line 正常行 ACCT-10245")

# 逐字符绘制 + 2pt 字距（expanded tracking，排版软件常见）
x = 60
for ch in "Expanded tracking text 加字距版":
    c.drawString(x, H - 110, ch)
    x += c.stringWidth(ch, "STSong-Light", 11) + 2.0

# 逐词绘制，3pt 词距（正常单词空格宽度）
x = 60
for w in ["Word", "by", "word", "逐词", "绘制"]:
    c.drawString(x, H - 140, w)
    x += c.stringWidth(w, "STSong-Light", 11) + 3.0

# 逐字符但零字距（紧密排布，不应插入任何空格）
x = 60
for ch in "Compact":
    c.drawString(x, H - 170, ch)
    x += c.stringWidth(ch, "STSong-Light", 11)

c.showPage()
c.save()
print(f"generated: {OUT}")
