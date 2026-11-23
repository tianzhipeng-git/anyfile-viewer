# ReadStat WebAssembly recipe

`bash tools/readstat-build/build.sh /absolute/output/directory`

The pinned Emscripten 4.0.10 image compiles the read-side sources of unmodified
ReadStat 1.1.9 with the Emscripten zlib 1.3.1 port (for `.zsav`) and the small C
adapter `adapter.c`. The recipe verifies the ReadStat archive and zlib port
SHA-256. Rebuilds are byte-identical; compare `readstat.mjs`/`readstat.wasm`
hashes in `build-info.json` before approving a new version, then place the
output at `third_party/readstat/<version>/`. `pnpm prepare:readstat` verifies
and copies it to `public/vendor/readstat/<version>/`.

Why source build: no maintained npm package ships ReadStat as WASM, and pure
JavaScript readers each cover only one of SPSS, Stata or SAS.

Smoke test against a directory of samples (Node 24+):

```sh
node tools/readstat-build/smoke.mjs third_party/readstat/1.1.9-anyfile.1 viewer/plugins/stat-data/examples
```

## Adapter contract

- Input bytes come from `Module.readAt(position, targetView)`, so the Worker
  reads the `File` on demand instead of copying it into WASM memory.
- `_rs_schema(format, size)` returns `{meta, variables, labels, notes, incomplete?}`;
  `_rs_rows(format, size, offset, limit, firstColumn, lastColumn)` returns rows
  for one column window. Results are JSON at `_rs_output()` / `_rs_output_length()`.
- Status: 0 ok, 1 invalid, 2 resource limit, 3 encoding failure. Errors after
  metadata and variables are read (for example a damaged value-label trailer)
  return the partial schema with `incomplete: true`; rows are validated separately.
- Bounds: 48 MiB JSON per call, 4 KiB per text cell, 1 KiB per label, 200,000
  value labels, 256 notes, 256 MiB WASM memory. ReadStat itself caps single
  allocations at 16 MiB. Format ids: sav 0, por 1, dta 2, sas7bdat 3, xpt 4.
