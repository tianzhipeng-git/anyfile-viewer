# OpenSKP 1.3.0: bounded definition-tree lifetime

Applied reproducibly by pnpm `patchedDependencies`; upstream npm package integrity and patch hash are pinned in `pnpm-lock.yaml`. Both published ESM and CJS entry points receive the same change. No independent binary build or vendored runtime is needed. The bundled output retains content-hashed URLs.

## Cause and change

`iterTopLevelLazy` eagerly builds the complete recursive TLV tree of each top-level record. In real models the F901 → 7017 → 7117 component-definition table can contain almost all of model.dat. One 263 MiB table exhausts the default 4 GiB V8 heap before geometry extraction.

Expand only these three structural table wrappers into their child record ranges, then feed each definition to the existing parsing/extraction pipeline in order. Each temporary TLV tree can be reclaimed after extraction, while definition IDs, geometry, instance transforms, layers and materials remain intact. Root geometry and all other top-level records retain their original grouping. This does not discard geometry, suppress errors or increase the JavaScript heap.

Upstream: https://github.com/iamahsanmehmood/openskp (MIT).
Remove this patch when an upstream release processes definition tables with equivalent bounded tree lifetime; verify the VFF regression and the opt-in large local model before upgrading. Tests also retain legacy v17 samples.

The private regression model is not redistributed. Measurements and the invocation are recorded in `docs/3d/support-matrix.md`.
