# Ebook decoder build

Activate Emscripten **3.1.69**, install CMake and Python 3.12+, then run:

```sh
bash tools/ebook-decoders-build/build.sh /tmp/ebook-decoder-output
```

`fetch.py` downloads exact archives and checks SHA-256 before extraction. The recipe builds only the native libraries as intermediate static archives. Final link exports only `mobi.c` or `archive.c` entry points, so unused writers and unrelated decoders are removed. No upstream patch is used. Two fresh-directory builds yielded identical output; see `docs/ebooks/evidence/decoder-reproducibility.json`.

Output directories are `output-mobi` and `output-archive`. These are review inputs; do not overwrite a published artifact version. On any source/adapter/build flag change, assign a new `*-anyfile.N` version, review notices and exact source, update runtime URLs and `viewer/plugin-policies.json`, regenerate build-info hashes, and verify real browser fixtures before release. `pnpm prepare:ebooks` only verifies and copies checked-in artifacts; it never compiles or downloads native sources.

The independently replaceable libmobi module and adapter are LGPL-3.0-or-later. Full corresponding upstream source is distributed in the artifact directory and published under `/vendor/licenses/libmobi/0.12-anyfile.1/`; the application does not perform DRM decryption. The archive adapter is Apache-2.0, libarchive is permissive BSD, and liblzma is 0BSD. See each artifact's SOURCE.md and notices.
