# Source-built DWG runtime

Run `bash tools/libredwg-build/build.sh third_party/libredwg/0.14-anyfile.1` with Docker and Node 24. Inputs are pinned and hashed in `upstream.json`; the output includes source archives, licenses, the full build recipe and `build-info.json`.

The decoder is official GNU LibreDWG 0.14, with the unmodified libredwg-web 0.7.10 TypeScript wrapper and Embind source. Read-only compilation excludes writers and DXF/JSON export. Memory starts at 64 MiB, grows to at most 512 MiB, and the explicit C stack is 5 MiB with overflow checks. Application builds verify and copy artifacts without compiling native code.

`pnpm prepare:dwg` also produces matching application source and license downloads. `node scripts/publish-dwg-assets.mjs` publishes reviewed artifacts to the existing `anyfile-bucket` using authenticated Wrangler; it refuses to overwrite a differing immutable object. `node scripts/check-dwg-assets-online.mjs` validates public bytes, MIME, CORS and caching.

For real-file regression, set `DWG_TEST_FILES` to a JSON array of absolute paths and optionally `DWG_TEST_REPORT` to an output JSON path, then run `pnpm --filter @anyfile/cad-dwg-viewer test`. Native fixtures are not sent to any remote service. Normal CI uses synthetic geometry, probe and lifecycle tests without requiring local user drawings.

Pinned upstream regression sample URLs and hashes are recorded in [the fixture manifest](../../docs/3d/dwg-fixture-sources.json). Download samples outside the source tree and pass their absolute paths through `DWG_TEST_FILES`.
