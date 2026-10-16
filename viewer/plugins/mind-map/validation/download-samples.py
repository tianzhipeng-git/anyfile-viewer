"""Download pinned public validation samples without checking binaries into this repo."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

catalog = Path(__file__).with_name('public-samples.json')
records = json.loads(catalog.read_text())
target = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/mind-map-public-validation')
for record in records:
    destination = target / record['path']
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == record['sha256']:
        continue
    url = record['source'].replace('https://github.com/', 'https://raw.githubusercontent.com/', 1).replace('/blob/', '/', 1)
    with urllib.request.urlopen(url, timeout=30) as response:
        content = response.read(128 * 1024 * 1024 + 1)
    if len(content) > 128 * 1024 * 1024 or hashlib.sha256(content).hexdigest() != record['sha256']:
        raise ValueError(f"Sample integrity check failed: {record['path']}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    print(record['path'])
target.mkdir(parents=True, exist_ok=True)
(target / 'samples.json').write_text(catalog.read_text())
print(f'{len(records)} pinned samples available at {target}')
