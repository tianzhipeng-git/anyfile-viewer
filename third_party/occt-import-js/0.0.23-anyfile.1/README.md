# Bounded OCCT import build

The application build only verifies and copies reviewed assets; it never invokes a compiler.
The npm 0.0.23 binary was rejected because its 2 GiB heap and unbounded JS mesh output violate our memory budgets. `patch-source.py` changes the pinned source, not generated glue.

To rebuild with Docker (the pinned image is linux/amd64; ARM hosts use emulation):

```sh
mkdir -p /tmp/occt-rebuilt
docker run --rm --platform linux/amd64 \
  -v "$PWD/tools/occt-import-build:/recipe:ro" -v /tmp/occt-rebuilt:/out \
  emscripten/emsdk@sha256:9d6522879357a363ada61862481cc12c5f772d5e9738b8addf95d38490cdc6ea \
  bash /recipe/build.sh /out
```

The checked-in artifact was built natively on macOS arm64 with Emscripten 3.1.69 (release `8fe01288bc35668c13316324336ea00195dfb814`) and CMake 3.27.9. A Docker cross-host byte-for-byte comparison has not been completed. Do not claim byte-identical reproducibility. The build script verifies both source archives before compiling.

Native SDK archive: https://github.com/emscripten-core/emsdk/archive/refs/tags/3.1.69.tar.gz, SHA-256 `7fbf610accce016f8b05196c254cc92162c07571979fbd0b6e5a4c50fded157c`. Install/activate 3.1.69, source emsdk_env.sh, then run `bash tools/occt-import-build/build.sh /tmp/occt-rebuilt`.

Review steps: import real STEP, IGES and BREP fixtures; inspect heap (32 MiB initial, 256 MiB maximum), reject malformed inputs; verify worker cancellation and local-only loading in a production browser. Compare output geometry/counts, run TypeScript/unit/build checks, and record sizes and SHA-256 in build-info.json. Copy reviewed output into a NEW artifact revision when replacing published bytes. Update URL, policy and prepare together. Keep all LGPL notices, the complete patch and source links alongside deployed assets so recipients can rebuild and replace the module.
