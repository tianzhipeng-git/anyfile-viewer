# comic-archive 3.8.9-anyfile.1

Built by `tools/ebook-decoders-build/build.sh` with Emscripten 3.1.69 (LLVM 19), CMake 3.27.9, macOS arm64. Exact input URLs and hashes: `fetch.py`. All build options: `build.sh`. No upstream source patch.

Only the separate JavaScript/WASM decoder module is loaded, in a per-file Worker. The application uses the exported C adapter API. You may modify and replace these module files, including for debugging such modifications; no signature checks run in the browser. No DRM decryption is enabled.

libarchive 3.8.9 is BSD licensed with additional permissive per-file notices in THIRD_PARTY_NOTICES.txt. liblzma 5.8.3 is 0BSD. Static linking only retains RAR4, RAR5, 7z readers and necessary compression code. No archive writer, filesystem extraction, crypto backend or network API is exposed. TAR and ZIP are not enabled in this runtime.

The portable recipe also includes mobi.c (LGPL-3.0-or-later) to rebuild the separate MOBI module. That companion source is not linked into comic-archive.wasm. Its license texts accompany the recipe.
