"""Generate owned solid RAR5/7z fixtures with a temporary, pinned RAR trial CLI.
The archiver is used only for fixture generation and is never shipped with the app.
"""
from pathlib import Path
import hashlib, json, os, subprocess, tarfile, tempfile, urllib.request, zipfile
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'docs/ebooks/fixtures/phase45'
URL = 'https://www.rarlab.com/rar/rarmacos-arm-723.tar.gz'
HASH = '68b393c000758d477fde43c955ff7542f12f76f3f5e87cdda923152fc791bd4d'
with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    data = urllib.request.urlopen(URL,timeout=60).read()
    if hashlib.sha256(data).hexdigest()!=HASH: raise ValueError('RAR CLI hash mismatch')
    archive=work/'tool.tar.gz';archive.write_bytes(data)
    with tarfile.open(archive) as source: source.extractall(work/'tool',filter='data')
    rar=work/'tool/rar/rar';pages=work/'pages';pages.mkdir()
    with zipfile.ZipFile(ROOT/'docs/ebooks/fixtures/hundreds.cbz') as z:
        for name in z.namelist():
            p=pages/name;p.parent.mkdir(exist_ok=True,parents=True);p.write_bytes(z.read(name));os.utime(p,(0,0))
    names=sorted(str(p.relative_to(pages)) for p in pages.rglob('*') if p.is_file())
    for name,opts in [('solid-rar5.cbr',['-s','-m5','-md16m']),('encrypted-headers.cbr',['-hpfixture-test-password'])]:
        (OUT/name).unlink(missing_ok=True)
        subprocess.run([str(rar),'a','-idq','-ma5','-ts-',*opts,str(OUT/name),*names],cwd=pages,check=True)
    for name,method in [('solid-lzma2.cb7','lzma2'),('copy.cb7','copy')]:
        subprocess.run(['/usr/bin/tar','--format','7zip','--options','7zip:compression='+method,'-cf',str(OUT/name),'-C',str(pages),*names],check=True)
manifest=OUT/'manifest.json';record=json.loads(manifest.read_text());record['tools']['rar']={'version':'7.23 macOS arm64','url':URL,'sha256':HASH,'use':'temporary trial CLI generating project-owned fixtures only'};record['files']=[{'path':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.name!='manifest.json'];manifest.write_text(json.dumps(record,indent=2)+'\n')
