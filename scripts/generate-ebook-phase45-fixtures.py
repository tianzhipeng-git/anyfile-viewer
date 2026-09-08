"""Owned test publications and comic archives; no third-party book content."""
from pathlib import Path
import hashlib, io, json, struct, tarfile, zipfile, zlib, subprocess, tempfile, shutil
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/ebooks/fixtures/phase45'; OUT.mkdir(exist_ok=True)
def rar4(items, encrypted=False):
    def header(kind, flags, body):
        raw = struct.pack('<BHH',kind,flags,7+len(body))+body
        return struct.pack('<H',zlib.crc32(raw)&65535)+raw
    result=b'Rar!\x1a\x07\0'+header(0x73,0,b'\0'*6)
    for name,data in items:
        name=name.encode();body=struct.pack('<IIBIIBBHI',len(data),len(data),3,zlib.crc32(data),0,20,0x30,len(name),0o100644)+name
        result+=header(0x74,0x8004 if encrypted else 0x8000,body)+data
    return result+header(0x7b,0,b'')
def vint(n):
    result=bytearray()
    while True:
        result.append((n&127)|(128 if n>127 else 0));n>>=7
        if not n:return bytes(result)
def rar5(items):
    def block(kind,flags,body,data=b''):
        raw=vint(kind)+vint(flags)+(vint(len(data)) if flags&2 else b'')+body;raw=vint(len(raw))+raw
        return struct.pack('<I',zlib.crc32(raw))+raw+data
    result=b'Rar!\x1a\x07\x01\0'+block(1,0,vint(0))
    for name,data in items:
        name=name.encode();body=vint(4)+vint(len(data))+vint(0o100644)+struct.pack('<I',zlib.crc32(data))+vint(0)+vint(1)+vint(len(name))+name
        result+=block(2,2,body,data)
    return result+block(5,0,vint(0))
def tar(items):
    out=io.BytesIO()
    with tarfile.open(fileobj=out,mode='w',format=tarfile.USTAR_FORMAT) as archive:
        for name,data in items:
            info=tarfile.TarInfo(name);info.size=len(data);info.mtime=0;archive.addfile(info,io.BytesIO(data))
    return out.getvalue()
with zipfile.ZipFile(ROOT/'docs/ebooks/fixtures/pages.cbz') as z:
    pages=[(name,z.read(name)) for name in z.namelist()]
for name,data in [('pages.cbt',tar(pages)),('rar4.cbr',rar4(pages)),('rar5.cbr',rar5(pages)),('encrypted.cbr',rar4(pages,True)),('traversal.cbt',tar([('../page.png',pages[0][1])])),('duplicate.cbr',rar4([pages[0],pages[0]])),('damaged.cbr',rar5(pages)[:-40])]: (OUT/name).write_bytes(data)
with tempfile.TemporaryDirectory() as directory:
    work=Path(directory)
    for name,data in pages:
        p=work/name;p.parent.mkdir(exist_ok=True,parents=True);p.write_bytes(data)
    subprocess.run(['/usr/bin/tar','--format','7zip','-cf',str(OUT/'pages.cb7'),'-C',directory,*[name for name,_ in pages]],check=True)
# Minimal PalmDOC records exercise raw and PalmDOC compressed streams.
def pdb(text,compression=1):
    raw=text.encode('cp1252');data=raw if compression==1 else b''.join(bytes([min(8,len(raw)-i)])+raw[i:i+8] for i in range(0,len(raw),8))
    record=struct.pack('>HHIHHI',compression,0,len(raw),1,4096,0)
    head=bytearray(78);head[:12]=b'Anyfile Palm';head[60:68]=b'TEXtREAd';struct.pack_into('>H',head,76,2)
    return bytes(head)+struct.pack('>IB3sIB3s',96,0,b'\0\0\1',112,0,b'\0\0\2')+b'\0\0'+record+data
(OUT/'palmdoc.pdb').write_bytes(pdb('PalmDOC chapter\n\nLocal text and caf\xe9.'))
(OUT/'palmdoc-compressed.prc').write_bytes(pdb('PalmDOC compressed\n\nLocal text and caf\xe9.',2))
calibre=shutil.which('ebook-convert') or '/Applications/calibre.app/Contents/MacOS/ebook-convert'
for name,opts in [('mobi7.mobi',['--mobi-file-type','old']),('kf8.azw3',[]),('joint.mobi',['--mobi-file-type','both'])]:
    subprocess.run([calibre,str(ROOT/'docs/ebooks/fixtures/epub3.epub'),str(OUT/name),*opts],check=True,stdout=subprocess.DEVNULL)
# Malicious content passes through Calibre; raw mutations below are parser counterexamples.
subprocess.run([calibre,str(ROOT/'docs/ebooks/fixtures/malicious.epub'),str(OUT/'malicious.mobi'),'--mobi-file-type','old'],check=True,stdout=subprocess.DEVNULL)
normal=bytearray((OUT/'mobi7.mobi').read_bytes());first=struct.unpack_from('>I',normal,78)[0]
for name,mutate in [('drm.azw',lambda b:struct.pack_into('>H',b,first+12,2)),('offset.mobi',lambda b:struct.pack_into('>I',b,86,first)),('records.mobi',lambda b:struct.pack_into('>H',b,76,65535)),('bomb.mobi',lambda b:struct.pack_into('>I',b,first+4,0xffffffff))]:
    data=normal[:];mutate(data);(OUT/name).write_bytes(data)
out=OUT;data=(out/'mobi7.mobi').read_bytes();n=struct.unpack_from('>H',data,76)[0];offsets=[struct.unpack_from('>I',data,78+i*8)[0] for i in range(n)]+[len(data)];records=[bytearray(data[a:b]) for a,b in zip(offsets,offsets[1:])];textn=struct.unpack_from('>H',records[0],8)[0];flags=struct.unpack_from('>H',records[0],242)[0]
def decompress(raw):
    result=bytearray();i=0
    while i<len(raw):
        b=raw[i];i+=1
        if 1<=b<=8:result+=raw[i:i+b];i+=b
        elif b<128:result.append(b)
        elif b<192:
            v=b*256+raw[i];i+=1;distance=(v&16383)>>3
            for _ in range((v&7)+3):result.append(result[-distance])
        else:result+=bytes([32,b^128])
    return result
for j in range(1,textn+1):
    raw=records[j]
    for _ in range((flags>>1).bit_count()):
        size=0
        for b in raw[-4:]:
            if b&128:size=0
            size=(size<<7)|(b&127)
        raw=raw[:-size]
    if flags&1:raw=raw[:-((raw[-1]&3)+1)]
    records[j]=decompress(raw)
struct.pack_into('>H',records[0],242,0)
def pack(records):
    head=bytearray(data[:78]);struct.pack_into('>H',head,76,len(records));table=bytearray();pos=78+8*len(records)+2
    for i,r in enumerate(records):table+=struct.pack('>II',pos,i*2);pos+=len(r)
    return head+table+b'\0\0'+b''.join(records)
struct.pack_into('>H',records[0],0,1);(out/'uncompressed.mobi').write_bytes(pack(records))
struct.pack_into('>H',records[0],0,17480);struct.pack_into('>II',records[0],112,len(records),2)
huff=b'HUFF'+struct.pack('>III',24,24,1048)+b'\0'*8+struct.pack('>I',0xff88)*256+b'\0'*1536
cdic=b'CDIC'+struct.pack('>III',16,256,8)+b''.join(struct.pack('>H',512+i*3) for i in range(256))+b''.join(struct.pack('>HB',0x8001,255-i) for i in range(256))
records.extend([huff,cdic]);(out/'huffman.mobi').write_bytes(pack(records))
# A cyclic CDIC is rejected by libmobi's recursion limit.
records[-1]=bytearray(cdic);struct.pack_into('>H',records[-1],16+512+195*3,1);records[-1][16+514+195*3]=60
(out/'cyclic-huffman.mobi').write_bytes(pack(records))

# Append active-content probes to a valid raw MOBI text record without changing prior anchors.
data=(OUT/'uncompressed.mobi').read_bytes();n=struct.unpack_from('>H',data,76)[0]
offsets=[struct.unpack_from('>I',data,78+i*8)[0] for i in range(n)]+[len(data)]
parts=[bytearray(data[a:b]) for a,b in zip(offsets,offsets[1:])]
text_count=struct.unpack_from('>H',parts[0],8)[0]
attack=b'<font>Safe malicious fixture</font><script>top.__ebookAttack=99</script><img src="https://ebook.invalid/mobi"><iframe src="https://ebook.invalid/frame"></iframe><form action="https://ebook.invalid/form"><button>Submit</button></form><p onclick="top.__ebookAttack=99">Safe text</p><a href="https://ebook.invalid/nav" target="_top">External</a>'
parts[text_count]+=attack
struct.pack_into('>I',parts[0],4,struct.unpack_from('>I',parts[0],4)[0]+len(attack))
pos=78+n*8+2;table=b''
for i,part in enumerate(parts): table+=struct.pack('>II',pos,i*2);pos+=len(part)
(OUT/'malicious-raw.mobi').write_bytes(data[:78]+table+b'\0\0'+b''.join(parts))
manifest={'source':'Project-owned synthetic EPUB/CBZ fixtures; generated by this script. Apache-2.0. Calibre is a fixture tool, not a runtime dependency.','tools':{'calibre':subprocess.check_output([calibre,'--version'],text=True).splitlines()[0],'tar':subprocess.check_output(['/usr/bin/tar','--version'],text=True).strip()},'files':[{ 'path':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.name!='manifest.json']}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
