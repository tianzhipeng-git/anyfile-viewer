# Archive metadata viewer examples

Run `node ../scripts/generate-examples.mjs` from this directory, or run
`node viewer/plugins/archive/scripts/generate-examples.mjs` from the repository root, to regenerate the binary samples.

- `archive.zip`: ZIP entries with Unicode, an archive comment, stored/deflated data, and an intentionally dangerous `../` path.
- `archive.rar`: RAR5 stored entries with a Unicode name and an intentionally dangerous `../` path.
- `empty-zip64.zip`: minimal empty ZIP64 archive.
- `archive.tar`: POSIX PAX TAR with a long path, Unicode names, and a symbolic link.
- `archive.tar.gz`, `archive.tar.xz`, `archive.tar.zst`: compound TAR compression examples; the viewer intentionally shows only the outer wrapper.
- `sample.gz`, `sample.xz`, `sample.zst`, `sample.bz2`, `sample.lz4`, `sample.zlib`: standalone compression wrappers.
- `sample.deflate`, `sample.br`: raw streams without independently readable container metadata.
