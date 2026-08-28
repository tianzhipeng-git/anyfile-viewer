# Corresponding source and replacement

The exact upstream source URLs, commits and SHA-256 values are recorded in
`build-info.json`. Run `tools/heif-wasm-build/build.sh` from the repository root to
download those sources, verify them and rebuild the JavaScript/WASM pair with the
digest-pinned Emscripten toolchain.

The application does not cryptographically sign the decoder. A recipient may
rebuild or modify `libheif`, `libde265` or `adapter.cc`, replace the files in this
versioned directory, update `build-info.json`, and run the asset preparation step.
The deployed files are copied byte-for-byte to `/vendor/libheif/1.23.2-anyfile.1/`.

No upstream source is modified. The project-owned adapter is available at
`tools/heif-wasm-build/adapter.cc`.
