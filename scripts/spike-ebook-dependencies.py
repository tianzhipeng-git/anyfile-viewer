"""Read-only upstream license/sample spike. Pins revisions; does not vendor runtimes."""
from pathlib import Path
import binascii, gzip, hashlib, io, json, struct, subprocess, tarfile, tempfile, urllib.request
ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.mkdtemp(prefix='anyfile-ebook-spike-'))
SOURCES = [
 ('epub.js','futurepress/epub.js','eee359d0790002115a1156a9833c54f4bcd44c1d',['license','package.json','src/archive.js','src/managers/views/iframe.js']),
 ('libmobi','bfabiszewski/libmobi','906274205c11944b628da1c553b255acb1af7c55',['COPYING','tests/samples/sample-unicode-uncompressed.mobi','tests/samples/sample-unicode-huffdic.mobi','tests/samples/sample-cp1252.mobi','tests/samples/sample-ncx.mobi','tests/samples/sample-multimedia.mobi']),
 ('DjVu.js','RussCoder/djvujs','eca3e69c966f3b7fcf0453f39029bc1e409fea8a',['LICENSE.md','library/package.json','library/assets/DjVu3Spec_bundled.djvu']),
 ('libarchive','libarchive/libarchive','ddf8247381814977c2f55a59f48d17460f7d00f0',['COPYING','libarchive/test/test_read_format_rar.rar.uu','libarchive/test/test_read_format_rar5_stored.rar.uu','libarchive/test/test_read_format_7zip_copy.7z.uu']),
 ('libmspack','kyz/libmspack','55d501976171397ccd5d5a7a1ca7da065b1d9a06',['libmspack/COPYING.LIB','libmspack/test/test_files/chmd/encints-32bit-both.chm']),
]
report=[]
for name,repo,revision,paths in SOURCES:
 commit=json.load(urllib.request.urlopen(f'https://api.github.com/repos/{repo}/commits/{revision}',timeout=30))
 entry={'commitDate':commit['commit']['committer']['date'],'candidate':name,'repository':f'https://github.com/{repo}','revision':revision,'files':[],'browserRuntime':'not adopted; no Worker/WASM shipped'}
 for path in paths:
  url=f'https://raw.githubusercontent.com/{repo}/{revision}/{path}'
  data=urllib.request.urlopen(url,timeout=30).read()
  record={'path':path,'url':url,'bytes':len(data),'gzipBytes':len(gzip.compress(data,mtime=0)),'sha256':hashlib.sha256(data).hexdigest()}
  target=CACHE/(name.replace('.','-')+'-'+Path(path).name);target.write_bytes(data)
  if path.endswith('.uu'):
   lines=data.splitlines();start=next(i for i,line in enumerate(lines) if line.startswith(b'begin '))+1
   decoded=b''.join(binascii.a2b_uu(line) for line in lines[start:] if line not in [b'end',b'`',b''] and not line.startswith(b'begin '))
   target=target.with_suffix('');target.write_bytes(decoded);record['decodedBytes']=len(decoded);record['decodedSha256']=hashlib.sha256(decoded).hexdigest()
   result=subprocess.run(['/usr/bin/tar','-tf',str(target)],capture_output=True,text=True)
   record['nativeIndexSpike']={'tool':'macOS bsdtar (system libarchive); not browser evidence','exitCode':result.returncode,'entries':result.stdout.splitlines()[:30],'stderr':result.stderr[:500]}
  elif path.endswith('.mobi'):
   count=struct.unpack_from('>H',data,76)[0];first=struct.unpack_from('>I',data,78)[0]
   record['headerSpike']={'databaseTypeCreator':data[60:68].decode('ascii'),'records':count,'palmdocCompression':struct.unpack_from('>H',data,first)[0],'encryption':struct.unpack_from('>H',data,first+12)[0],'mobiVersion':struct.unpack_from('>I',data,first+36)[0],'recordMobiVersions':[struct.unpack_from('>I',data,offset+36)[0] for offset in [struct.unpack_from('>I',data,78+i*8)[0] for i in range(count)] if data[offset+16:offset+20]==b'MOBI']}
  elif path.endswith(('.djvu','.chm')):record['headerSpike']={'signatureHex':data[:16].hex()}
  entry['files'].append(record)
 report.append(entry)
# Pin the rejected EPUB.js distribution as a size baseline; never import it into the app.
meta=json.load(urllib.request.urlopen('https://registry.npmjs.org/epubjs/0.3.93'))
data=urllib.request.urlopen(meta['dist']['tarball']).read()
report[0]['npmBaseline']={'version':'0.3.93','license':meta.get('license'),'tarballBytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'dependencies':meta.get('dependencies',{})}
with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
 runtime=archive.extractfile('package/dist/epub.min.js').read()
 report[0]['npmBaseline']['runtimeBytes']=len(runtime)
 report[0]['npmBaseline']['runtimeGzipBytes']=len(gzip.compress(runtime,mtime=0))
output=ROOT/'docs/ebooks/evidence/dependency-spike.json';output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({'schemaVersion':1,'samplePolicy':'Upstream research samples downloaded into a temporary directory only; not redistributed as publication fixtures. Source/license locations and hashes retained. Native header/index checks are not browser decoder support.','candidates':report},indent=2)+'\n')
print(output)
