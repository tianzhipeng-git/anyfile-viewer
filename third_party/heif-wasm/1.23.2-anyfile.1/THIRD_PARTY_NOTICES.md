# HEIF decoder third-party notices

This distribution contains an unmodified `libheif` 1.23.2 library linked with an
unmodified `libde265` 1.1.1 library and the Anyfile Viewer adapter. Both upstream
libraries are licensed under LGPL-3.0-or-later; their license texts accompany the
runtime files.

The build enables HEVC decoding only. Encoders, dynamic plugins and all other
codecs are disabled. Build inputs, hashes and replacement instructions are in
`build-info.json`, `SOURCE.md` and `tools/heif-wasm-build/`.

The project reviewed the separate HEVC patent/licensing risk on 2026-08-29 and
accepted it for the browser-local decoder distribution described here. This is a
project risk decision, not an additional copyright license and not a decision for
other codecs or distribution models.
