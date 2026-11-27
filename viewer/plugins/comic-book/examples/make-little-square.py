import io, sys, zipfile
from PIL import Image, ImageDraw

out = sys.argv[1]
def page(w, h, bg, draw_fn, fmt):
    img = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(img)
    draw_fn(d, w, h)
    buf = io.BytesIO()
    img.save(buf, fmt, **({"quality": 80} if fmt == "JPEG" else {"optimize": True}))
    return buf.getvalue()

def cover(d, w, h):
    d.rectangle([10, 10, w - 10, h - 10], outline="black", width=4)
    d.rectangle([60, 120, 140, 200], fill="#f59e0b", outline="black", width=3)
    d.text((40, 40), "THE LITTLE SQUARE", fill="black")
    d.text((70, 260), "Issue #1", fill="black")
def panel_grid(d, w, h):
    for i, y in enumerate((10, 105, 200)):
        d.rectangle([10, y, w - 10, y + 85], outline="black", width=3)
        d.rectangle([30 + i * 40, y + 25, 70 + i * 40, y + 65], fill="#f59e0b", outline="black", width=2)
def spread(d, w, h):
    d.rectangle([10, 10, w - 10, h - 10], outline="black", width=4)
    d.ellipse([w // 2 - 60, 90, w // 2 + 60, 210], fill="#38bdf8", outline="black", width=3)
    d.rectangle([w // 2 - 20, 130, w // 2 + 20, 170], fill="#f59e0b", outline="black", width=2)
def ending(d, w, h):
    d.rectangle([10, 10, w - 10, h - 10], outline="black", width=4)
    d.text((80, 140), "THE END", fill="black")

pages = [
    ("pages/01.jpg", page(200, 300, "#fde68a", cover, "JPEG")),
    ("pages/02.png", page(200, 300, "white", panel_grid, "PNG")),
    ("pages/03.jpg", page(400, 300, "white", spread, "JPEG")),
    ("pages/10.png", page(200, 300, "white", ending, "PNG")),
]
info = """<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Title>The Little Square</Title>
  <Series>Anyfile Sample Comics</Series>
  <Number>1</Number>
  <Count>1</Count>
  <Summary>A small orange square leaves its panel, meets a blue circle on a two-page spread, and returns home.</Summary>
  <Year>2026</Year>
  <Writer>anyfile-viewer contributors</Writer>
  <Penciller>anyfile-viewer contributors</Penciller>
  <Genre>Sample</Genre>
  <LanguageISO>en</LanguageISO>
  <Manga>No</Manga>
  <PageCount>4</PageCount>
  <Pages>
    <Page Image="0" Type="FrontCover" ImageWidth="200" ImageHeight="300"/>
    <Page Image="1" ImageWidth="200" ImageHeight="300"/>
    <Page Image="2" DoublePage="True" ImageWidth="400" ImageHeight="300"/>
    <Page Image="3" Type="BackCover" ImageWidth="200" ImageHeight="300"/>
  </Pages>
</ComicInfo>
"""
with zipfile.ZipFile(out, "w") as z:
    z.writestr(zipfile.ZipInfo("ComicInfo.xml", (2026, 1, 1, 0, 0, 0)), info, compress_type=zipfile.ZIP_DEFLATED)
    for name, data in pages:
        z.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), data, compress_type=zipfile.ZIP_STORED)
