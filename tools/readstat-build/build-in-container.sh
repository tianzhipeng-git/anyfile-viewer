#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
import hashlib, json, pathlib, tarfile, urllib.request
root = pathlib.Path('/work'); root.mkdir(exist_ok=True)
source = json.load(open('/recipe/upstream.json'))['sources']['readstat']
archive = root / 'readstat.tar.gz'
if not archive.exists(): urllib.request.urlretrieve(source['url'], archive)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == source['sha256'], 'readstat'
with tarfile.open(archive) as contents: contents.extractall(root, filter='data')
PY
emcmake cmake -S /recipe -B /work/build -DSOURCE_ROOT=/work -DCMAKE_BUILD_TYPE=Release
cmake --build /work/build -j6
python3 - <<'PYPORTS'
import hashlib, json, pathlib
expected = json.load(open('/recipe/upstream.json'))['sources']['zlib']['sha256']
path = pathlib.Path('/emsdk/upstream/emscripten/cache/ports/zlib.3.1.tar.gz')
assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, 'zlib'
PYPORTS
mkdir -p /output/licenses
cp /work/build/readstat.mjs /work/build/readstat.wasm /output/
cp /recipe/licenses/readstat.txt /output/licenses/readstat-MIT.txt
cp /emsdk/upstream/emscripten/cache/ports/zlib/zlib-1.3.1/LICENSE /output/licenses/zlib.txt
cp /emsdk/upstream/emscripten/LICENSE /output/licenses/emscripten.txt
chown -R "$HOST_IDS" /output
