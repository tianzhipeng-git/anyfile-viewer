# libmobi 0.12-anyfile.1

Built by `tools/ebook-decoders-build/build.sh` with Emscripten 3.1.69 (LLVM 19), CMake 3.27.9, macOS arm64. Exact input URLs and hashes: `fetch.py`. All build options: `build.sh`. No upstream source patch.

Only the separate JavaScript/WASM decoder module is loaded, in a per-file Worker. The application uses the exported C adapter API. You may modify and replace these module files, including for debugging such modifications; no signature checks run in the browser. No DRM decryption is enabled.

libmobi and `mobi.c` are LGPL-3.0-or-later; GPLv3 terms are included. Complete unmodified corresponding upstream source (including bundled miniz) is provided at [/vendor/licenses/libmobi/0.12-anyfile.1/libmobi-source.tar.gz](/vendor/licenses/libmobi/0.12-anyfile.1/libmobi-source.tar.gz), from pinned revision 906274205c11944b628da1c553b255acb1af7c55. Adapter and build scripts accompany this module. To rebuild, activate Emscripten 3.1.69 and invoke build.sh OUTPUT; replace mobi.js and mobi.wasm together. Application code remains Apache-2.0; the decoder module and adapter carry their own license. Do not remove these notices or restrict modification/reverse engineering for debugging this component. The source archive is a license download, never part of reader cold start.
