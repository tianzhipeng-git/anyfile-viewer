# MPP14 browser reader

mppgo has no upstream browser build. This recipe builds its unmodified Go
reader as WASM with a narrow read-only adapter. The alternative tsmpp parser
fills missing schedule dates and drops tasks without dates, so it was not used.
MPXJ itself needs a Java runtime; server conversion would violate local reading.

The reader is MIT; its format knowledge is attributed to MPXJ in `NOTICE`.
The Go runtime/glue is BSD-3-Clause (`GO-LICENSE`). Fixture licensing is separate.

## Rebuild

Use Go **1.27.1**. No global toolchain installation is required. The macOS arm64
archive used for the audited build is
https://go.dev/dl/go1.27.1.darwin-arm64.tar.gz
with SHA-256 `ee215d57e0ec269c60cc9ceca68e6bda321ba9ee5afe24f4b0988703c2d87d12`.
The native build needs no container. Go's standard library is the only dependency.

```sh
MPP_GO=/path/to/go python3 tools/mppgo-build/build.py
pnpm prepare:mpp
node tools/mppgo-build/smoke.mjs viewer/plugins/mpp/examples/task-dates-2010.mpp
pnpm --filter @anyfile/mpp-viewer test
```

The recipe verifies the pinned upstream archive SHA-256, builds without local
paths, VCS metadata or build ID, and copies the matching Go glue. It records all
artifact sizes/hashes in `build-info.json`. Rebuilding with the same compiler
must produce the same artifact hashes. Prepare verifies the audited set before
copying it into `public/vendor/mppgo/<version>/`. App builds never compile Go.

## Runtime and limits

The plugin lazily creates a module Worker and loads the versioned same-origin
Go glue and WASM. WASM is about 1.40 MiB gzip, below the external distribution
threshold. It exposes no file I/O or network capability to the MPP adapter.
Input is transferred to the Worker; it is never uploaded. Parsing does not
execute macros or resolve external project links.

The main thread cancels FileReader on abort. The Worker is terminated after
parsing, on failure, cancellation or a 30-second timeout. The adapter limits
input to 128 MiB, output JSON to 32 MiB, tasks/resources to 100,000 each and
assignments to 200,000. Go's 256 MiB GC target is soft, **not** a hard memory
limit; entity/output bounds are checked after parsing, so peak memory can be
higher. Upstream keeps its bounds/cycle checks for malformed CFB/MPP data.

The UI uses one internal scroll viewport and renders at most 100 records per
page. It displays task IDs, hierarchy/WBS, saved current dates (early dates for
summary rows), duration in the project's units, completion, predecessors with
lag, assigned names, plain notes, primary baseline dates, and resource names,
types/group/capacity. Missing dates stay blank, inactive rows have no Gantt bar.
The Gantt scale covers the whole plan even when filtering or paging.

This is level 3 viewing: MPP14 only, no encrypted files, calendars, custom fields,
costs, numbered baselines, dependency arrows or schedule recalculation. The
reader may miss dates in some layouts (including the included gantt fixture);
the UI keeps those rows without fabricating dates.
