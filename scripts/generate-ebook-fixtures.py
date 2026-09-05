"""Deterministic original CC0 ebook regression fixtures; no third-party book text."""
from pathlib import Path
import hashlib, io, json, struct, zipfile, zlib
ROOT = Path(__file__).resolve().parents[1] / 'docs/ebooks/fixtures'
ROOT.mkdir(parents=True, exist_ok=True)

def png(w=80,h=120,color=(45,125,170)):
    def chunk(t,b): return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b))
    data=b''.join(b'\0'+bytes(color)*w for _ in range(h))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(data))+chunk(b'IEND',b'')
def archive(entries):
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w') as z:
        for name,content in entries:
            info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_STORED if name=='mimetype' else zipfile.ZIP_DEFLATED
            z.writestr(info,content.encode() if isinstance(content,str) else content)
    return output.getvalue()
def save(name,entries): (ROOT/name).write_bytes(archive(entries))

def epub(version=3,rtl=False,malicious=False):
    ns='http://www.w3.org/1999/xhtml'
    chapters=[]
    for i in range(1,6):
        body=f'<h1 id="start">Chapter {i}</h1><p>Original local reading fixture. Chapter {i}.</p>'
        body+=''.join(f'<p id="p{j}">Paragraph {j}. The reader keeps every word on this page in the browser. Testing reflow and scrolling.</p>' for j in range(25))
        body+='<img src="images/page.png" alt="Blue test page"/><a href="chapter2.xhtml#p12">Chapter two anchor</a><ruby>字<rt>zi</rt></ruby>'
        if rtl: body+='<p dir="rtl">مرحبا بالعالم — שלום עולם</p>'
        if malicious: body+='''<script>parent.__ebookAttack=1;fetch('https://ebook.invalid/script')</script><img src="https://ebook.invalid/image" onerror="parent.__ebookAttack=2"/><iframe src="https://ebook.invalid/frame"/><form action="https://ebook.invalid/form"><input name="secret"/><button>Send</button></form><object data="https://ebook.invalid/object"/><a href="javascript:parent.__ebookAttack=3">Bad link</a><a href="https://ebook.invalid/nav" target="_top">External</a><svg xmlns="http://www.w3.org/2000/svg" onload="parent.__ebookAttack=4"><foreignObject><iframe src="https://ebook.invalid/nested"/></foreignObject></svg>'''
        chapters.append((f'OPS/chapter{i}.xhtml',f'<html xmlns="{ns}"><head><title>Chapter {i}</title><link rel="stylesheet" href="style.css"/></head><body>{body}</body></html>'))
    items=''.join(f'<item id="c{i}" href="chapter{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1,6))
    nav='<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' if version==3 else '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
    opf=f'''<package xmlns="http://www.idpf.org/2007/opf" version="{version}.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">fixture</dc:identifier><dc:title>Local reading fixture</dc:title><dc:creator>Anyfile tests</dc:creator></metadata><manifest>{items}{nav}<item id="style" href="style.css" media-type="text/css"/><item id="image" href="images/page.png" media-type="image/png"/></manifest><spine toc="ncx" page-progression-direction="{'rtl' if rtl else 'ltr'}">{''.join(f'<itemref idref="c{i}"/>' for i in range(1,6))}</spine></package>'''
    entries=[('mimetype','application/epub+zip'),('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),('OPS/book.opf',opf),*chapters,('OPS/images/page.png',png()),('OPS/style.css','h1{color:#164e63;font-weight:bold}p{text-indent:1em}'+('@import "https://ebook.invalid/import";p{background-image:url(https://ebook.invalid/css)}' if malicious else ''))]
    entries.append(('OPS/nav.xhtml',f'<html xmlns="{ns}" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>'+''.join(f'<li><a href="chapter{i}.xhtml#start">Chapter {i}</a></li>' for i in range(1,6))+'</ol></nav></body></html>'))
    entries.append(('OPS/toc.ncx','<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>'+''.join(f'<navPoint id="n{i}"><navLabel><text>Chapter {i}</text></navLabel><content src="chapter{i}.xhtml#start"/></navPoint>' for i in range(1,6))+'</navMap></ncx>'))
    return entries
save('epub3.epub',epub());save('epub2.epub',epub(2));save('rtl.epub',epub(rtl=True));save('malicious.epub',epub(malicious=True))
resources=epub()
font=(ROOT/'fonts/Abel-Regular.ttf').read_bytes()
resources=[(n,b.replace('</manifest>','<item id="font" href="Abel.ttf" media-type="font/ttf"/><item id="svg" href="picture.svg" media-type="image/svg+xml"/></manifest>') if n=='OPS/book.opf' else b.replace('</body>','<img src="picture.svg" alt="Safe SVG"/></body>') if n.startswith('OPS/chapter') else b) for n,b in resources]
resources=[(n,b+'@font-face{font-family:Abel;src:url("Abel.ttf")}body{font-family:Abel}' if n=='OPS/style.css' else b) for n,b in resources]
save('resources.epub',resources+[('OPS/Abel.ttf',font),('OPS/picture.svg','<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#b45309"/><text x="10" y="40">SVG test</text></svg>')])
images=ROOT.parents[2]/'viewer/plugins/browser-image/examples'
save('image-formats.cbz',[(str(i+1)+'.'+name.split('.')[-1],(images/name).read_bytes()) for i,name in enumerate(['sample.jpg','sample.png','animated.gif','sample-lossless-alpha.webp','sample.avif'])])
save('drm.epub',epub()+[('META-INF/encryption.xml','<encryption/>')])
save('missing-image.epub',[(n,b) for n,b in epub() if n!='OPS/images/page.png'])
save('missing-spine.epub',[(n,b) for n,b in epub() if n!='OPS/chapter3.xhtml'])
save('deep.epub',[(n,('<html xmlns="http://www.w3.org/1999/xhtml"><body>'+'<div>'*80+'deep'+'</div>'*80+'</body></html>') if n=='OPS/chapter1.xhtml' else b) for n,b in epub()])
save('large-chapter.epub',[(n,'x'*(2*1024*1024+1) if n=='OPS/chapter1.xhtml' else b) for n,b in epub()])
save('entity.epub',[(n,'<!DOCTYPE x [<!ENTITY leak SYSTEM "https://ebook.invalid/entity">]><container>&leak;</container>' if n=='META-INF/container.xml' else b) for n,b in epub()])
comic=[(f'volume1/{i}.png',png(color=(30+i*10,100,160))) for i in [10,3,1,2,4]]
(ROOT/'legacy-names.cbz').write_bytes(archive([('a.png',png()),('b.png',png())]).replace(b'a.png',b'\x82.png').replace(b'b.png',b'\x83.png'))
save('pages.cbz',comic);save('manga.cbz',comic+[('ComicInfo.xml','<ComicInfo><Manga>YesAndRightToLeft</Manga><Pages><Page Image="0" Type="FrontCover"/><Page Image="3" DoublePage="true"/></Pages></ComicInfo>')])
save('pixel-budget.cbz',[(f'{i}.png',png(2000,4000)) for i in range(1,7)])
save('hundreds.cbz',[(f'{i}.png',png()) for i in range(1,301)])
save('duplicate.cbz',[('1.png',png()),('1.png',png())]);save('traversal.cbz',[('../1.png',png())]);save('empty.cbz',[('notes.txt','No pages')]);save('damaged-image.cbz',[('1.png',b'broken')])
big=bytearray(png());big[16:24]=struct.pack('>II',100000,100000);save('huge-pixels.cbz',[('1.png',bytes(big))])
save('bomb.cbz',[('1.png',b'x'*(33*1024*1024))]);save('many-entries.cbz',[(f'{i}.png',b'x') for i in range(10001)])
enc=bytearray(archive(comic));pos=0
while True:
    pos=enc.find(b'PK\x01\x02',pos)
    if pos<0:break
    enc[pos+8]|=1;pos+=4
(ROOT/'encrypted.cbz').write_bytes(enc)
base=archive(comic);eocd=base[-22:];count=struct.unpack_from('<H',eocd,10)[0];size,offset=struct.unpack_from('<II',eocd,12)
record=struct.pack('<IQHHIIQQQQ',0x06064b50,44,45,45,0,0,count,count,size,offset)
locator=struct.pack('<IIQI',0x07064b50,0,len(base)-22,1)
trailer=struct.pack('<IHHHHIIH',0x06054b50,0,0,65535,65535,0xffffffff,0xffffffff,0)
(ROOT/'zip64.cbz').write_bytes(base[:-22]+record+locator+trailer)
# Original CC0 FictionBook subset and encoding/security fixtures.
import base64
fbns='http://www.gribuser.ru/xml/fictionbook/2.0'
fb=f'<FictionBook xmlns="{fbns}" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>Original fixture</book-title><author><first-name>Local</first-name><last-name>Author</last-name></author><coverpage><image l:href="#cover"/></coverpage></title-info></description><body>'
for i in range(1,6):
    fb+=f'<section id="c{i}"><title><p>Chapter {i}</p></title><p id="start{i}">Local reading. <a l:href="#note" type="note">Footnote</a></p><subtitle>Verse and quotation</subtitle><poem><stanza><v>First verse</v><v>Second verse</v></stanza><text-author>Poet</text-author></poem><epigraph><p>Epigraph</p></epigraph><cite><p>Quotation</p></cite><table><tr><th>Key</th><td>Value</td></tr></table>'+''.join(f'<p id="p{i}-{j}">Reading paragraph {j}. '+('Readable local text. '*15)+'</p>' for j in range(30))+f'<section id="nested{i}"><title><p>Nested {i}</p></title><p>Nested text.</p></section></section>'
fb+=f'</body><body name="notes"><section id="note"><title><p>Notes</p></title><p>Footnote explanation.</p></section></body><binary id="cover" content-type="image/png">{base64.b64encode(png()).decode()}</binary></FictionBook>'
(ROOT/'normal.fb2').write_text(fb)
save('normal.fb2.zip',[('book.fb2',fb)])
save('single-fb2.zip',[('nested/book.fb2',fb),('readme.txt','Original CC0 fixture')])
save('multiple-fb2.zip',[('one.fb2',fb),('two.fb2',fb)])
(ROOT/'utf16.fb2').write_bytes(('<?xml version="1.0" encoding="UTF-16"?>'+fb).encode('utf-16'))
(ROOT/'utf16be.fb2').write_bytes(b'\xfe\xff'+('<?xml version="1.0" encoding="UTF-16"?>'+fb).encode('utf-16be'))
(ROOT/'cp1251.fb2').write_bytes(('<?xml version="1.0" encoding="windows-1251"?>'+fb.replace('Original fixture','Книга')).encode('cp1251'))
(ROOT/'malicious.fb2').write_text(fb.replace('Local reading.', '<script>parent.__ebookAttack=1</script><image l:href="https://ebook.invalid/image"/><a l:href="javascript:alert(1)">Bad link</a><p onclick="alert(1)">Safe text</p>'))
(ROOT/'entity.fb2').write_text('<!DOCTYPE FictionBook [<!ENTITY x SYSTEM "https://ebook.invalid/entity">]><FictionBook>&x;</FictionBook>')
(ROOT/'deep.fb2').write_text(f'<FictionBook xmlns="{fbns}"><body>'+'<section>'*80+'<p>Deep</p>'+'</section>'*80+'</body></FictionBook>')
(ROOT/'invalid.fb2').write_text(f'<FictionBook xmlns="{fbns}"><body></FictionBook>')
(ROOT/'huge-binary.fb2').write_text(fb.replace('</FictionBook>','<binary id="huge" content-type="image/png">'+'A'*(12*1024*1024)+'</binary></FictionBook>'))
records=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source':'scripts/generate-ebook-fixtures.py','license':'CC0-1.0 + OFL-1.1' if p.name=='resources.epub' else 'Apache-2.0 generated image fixtures' if p.name=='image-formats.cbz' else 'CC0-1.0','purpose':p.stem} for p in sorted(ROOT.iterdir()) if p.suffix in ['.epub','.cbz','.fb2','.zip']]
for record in records:
    if record['file'].endswith(('.epub','.cbz','.zip')):
        with zipfile.ZipFile(ROOT/record['file']) as z:
            record['parameters']={'entries':len(z.infolist()),'declaredExpandedBytes':sum(i.file_size for i in z.infolist())}
inputs=[{'file':'fonts/'+name,'source':'https://raw.githubusercontent.com/google/fonts/3b99d83d2625944fc0b8bd328d793fa819b92381/ofl/abel/'+name,'sha256':hashlib.sha256((ROOT/'fonts'/name).read_bytes()).hexdigest(),'license':'OFL-1.1'} for name in ['Abel-Regular.ttf','OFL.txt']]
inputs += [{'file':str((images/name).relative_to(ROOT.parents[2])),'source':'viewer/plugins/browser-image/scripts/generate-examples.mjs','sha256':hashlib.sha256((images/name).read_bytes()).hexdigest(),'license':'Apache-2.0 original generated fixtures'} for name in ['sample.jpg','sample.png','animated.gif','sample-lossless-alpha.webp','sample.avif']]
(ROOT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'fixtures':records,'inputs':inputs},indent=2)+'\n')
