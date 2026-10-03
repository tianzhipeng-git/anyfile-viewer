"""Rebuild audited MPP runtime. Requires the pinned Go toolchain, no other packages."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
COMMIT = '0483da362cb316188eee9124d47d216c80078bb2'
VERSION = '0.0.0-0483da3-anyfile.1'
URL = f'https://codeload.github.com/TinToSer/mppgo/tar.gz/{COMMIT}'
SHA = 'b047180848b9f0e5f439f10e902496f3045428c78be4b4c493ddd8ea80270e24'
GO = os.environ.get('MPP_GO', 'go')
assert subprocess.check_output([GO, 'version'], text=True).split()[2] == 'go1.27.1'
OUT = ROOT / 'third_party/mppgo' / VERSION
OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='anyfile-mpp-') as temp:
    work = Path(temp)
    archive = work / 'source.tar.gz'
    urllib.request.urlretrieve(URL, archive)
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA
    with tarfile.open(archive) as tar:
        tar.extractall(work, filter='data')
    source = work / f'mppgo-{COMMIT}'
    adapter = source / 'cmd/anyfile'
    adapter.mkdir()
    shutil.copy(ROOT / 'tools/mppgo-build/main.go', adapter / 'main.go')
    env = {**os.environ, 'GOOS': 'js', 'GOARCH': 'wasm', 'CGO_ENABLED': '0', 'GOTOOLCHAIN': 'local'}
    subprocess.run([GO, 'build', '-trimpath', '-buildvcs=false', '-ldflags=-s -w -buildid=', '-o', str(OUT / 'mpp.wasm'), './cmd/anyfile'], cwd=source, env=env, check=True)
    goroot = Path(subprocess.check_output([GO, 'env', 'GOROOT'], text=True).strip())
    shutil.copy(goroot / 'lib/wasm/wasm_exec.js', OUT / 'wasm_exec.js')
    for file in ['LICENSE', 'NOTICE']:
        shutil.copy(source / file, OUT / file)
    shutil.copy(goroot / 'LICENSE', OUT / 'GO-LICENSE')
(OUT / 'SOURCE.md').write_text(f'''# MPP browser runtime\n\nMIT mppgo at [{COMMIT}](https://github.com/TinToSer/mppgo/tree/{COMMIT}).\nSource archive: {URL}\nSHA-256: {SHA}\nGo 1.27.1 (BSD-3-Clause), adapter revision 1.\nRebuild: `MPP_GO=/path/to/go python3 tools/mppgo-build/build.py`.\nThe adapter and recipe are in tools/mppgo-build in the Anyfile Viewer repository.\nNo upstream patches; only read-only task/resource projection is exposed.\n''')
artifacts = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.name != 'build-info.json'}
(OUT / 'build-info.json').write_text(json.dumps({'artifactVersion': VERSION, 'upstream': {'commit': COMMIT, 'sourceUrl': URL, 'sha256': SHA}, 'toolchain': {'version': 'go1.27.1', 'container': None}, 'adapterRevision': 1, 'flags': ['GOOS=js', 'GOARCH=wasm', '-trimpath', '-buildvcs=false', '-ldflags=-s -w -buildid='], 'artifacts': artifacts}, indent=2) + '\n')
