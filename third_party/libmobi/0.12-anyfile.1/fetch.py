"""Fetch exact source archives and verify them before extraction."""
import hashlib, pathlib, sys, tarfile, urllib.request
SOURCES = {
    'libmobi': ('https://github.com/bfabiszewski/libmobi/archive/906274205c11944b628da1c553b255acb1af7c55.tar.gz', 'ec260e472d4db1bcbf8c479ee470bd2a2b2b822f14313604c76e667a684e1dfa'),
    'libarchive': ('https://github.com/libarchive/libarchive/releases/download/v3.8.9/libarchive-3.8.9.tar.gz', 'f5a6539059cf5e597dbeda37bfa4874b1e8dea063c8d93bf85a2b44af90a5bd4'),
    'xz': ('https://github.com/tukaani-project/xz/releases/download/v5.8.3/xz-5.8.3.tar.gz', '3d3a1b973af218114f4f889bbaa2f4c037deaae0c8e815eec381c3d546b974a0'),
}
if __name__ == '__main__':
    root = pathlib.Path(sys.argv[1])
    for name, (url, expected) in SOURCES.items():
        data = urllib.request.urlopen(url, timeout=60).read()
        if hashlib.sha256(data).hexdigest() != expected: raise ValueError(name + ' hash mismatch')
        archive = root / (name + '.tar.gz'); archive.write_bytes(data)
        with tarfile.open(archive) as source: source.extractall(root / name, filter='data')
