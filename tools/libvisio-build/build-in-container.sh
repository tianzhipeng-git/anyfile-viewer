#!/usr/bin/env bash
set -euo pipefail
apt-get update -qq
apt-get install -y -qq icu-devtools=70.1-2
python3 - <<'PY'
import hashlib, json, pathlib, tarfile, urllib.request
root = pathlib.Path('/work'); root.mkdir(exist_ok=True)
for name, source in json.load(open('/recipe/upstream.json'))['sources'].items():
    if name not in ('libvisio', 'librevenge', 'libxml2'): continue
    archive = root / (name + '.tar.xz')
    if not archive.exists(): urllib.request.urlretrieve(source['url'], archive)
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == source['sha256'], name
    with tarfile.open(archive) as contents: contents.extractall(root, filter='data')
PY
emcmake cmake -S /recipe -B /work/build -DSOURCE_ROOT=/work -DCMAKE_BUILD_TYPE=Release
cmake --build /work/build -j6
python3 - <<'PYPORTS'
import hashlib, json, pathlib
sources = json.load(open('/recipe/upstream.json'))['sources']
for name, archive in [('icu','icu.zip'), ('boost','boost_headers.83.0.zip'), ('zlib','zlib.3.1.tar.gz')]:
    path = pathlib.Path('/emsdk/upstream/emscripten/cache/ports') / archive
    assert hashlib.sha256(path.read_bytes()).hexdigest() == sources[name]['sha256'], name
PYPORTS
mkdir -p /work/icu-min /output/sources /output/licenses
cd /work/icu-min
icu=/emsdk/upstream/emscripten/cache/ports/icu/icu
icupkg -x '*.cnv' "$icu/source/data/in/icudt68l.dat"
icupkg -x cnvalias.icu "$icu/source/data/in/icudt68l.dat"
icupkg --toc_prefix icudt68l -a /recipe/converters.txt new /output/converters.dat
cp /work/build/visio.mjs /work/build/visio.wasm /output/
cp /work/libvisio.tar.xz /work/librevenge.tar.xz /output/sources/
cp /work/libvisio-0.1.11/COPYING.MPL /output/licenses/libvisio-MPL-2.0.txt
cp /work/librevenge-0.0.5/COPYING.MPL /output/licenses/librevenge-MPL-2.0.txt
cp /work/libxml2-2.15.4/Copyright /output/licenses/libxml2.txt
cp "$icu/LICENSE" /output/licenses/icu.txt
cp /recipe/licenses/boost.txt /output/licenses/boost.txt
cp /emsdk/upstream/emscripten/cache/ports/zlib/zlib-1.3.1/LICENSE /output/licenses/zlib.txt
cp /emsdk/upstream/emscripten/LICENSE /output/licenses/emscripten.txt
