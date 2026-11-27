---
name: anyfile
description: Read-only inspection, structured extraction, SQL querying, and bounded PNG rendering for unfamiliar or proprietary local binary files via the `anyfile` CLI.
---

# Using `anyfile` to Read Local Files

When encountering an unfamiliar, binary, or proprietary local file (such as `.plist`, `.sqlite`, `.pst`, `.h5`, `.ofd`, `.dwg`, `.sav`, `.psd`, `.exr`, or extensionless blobs), always inspect first before reading or rendering.

## Recommended Workflow

1. **Inspect first** to identify the format, capabilities (`read`, `query`, `render`), metadata, and target IDs:
   ```bash
   anyfile inspect <path>
   ```
2. **Read structured content** using an exact `id` copied from `targets` (never invent or construct target IDs):
   ```bash
   anyfile read <path> --target <target-id> [--cursor <nextCursor>] [--filter <keyword>] [--max-bytes 49152]
   ```
   - When more pages exist and `--out` is omitted, `nextCursor: <cursor>` is printed to `stderr` so `stdout` stays pure content.
   - Use `--out <file>` when you need to save a chunk to disk without flooding stdout (summary JSON including `nextCursor` is printed to `stdout`).
3. **Run read-only SQL** when `capabilities` includes `"query"` (e.g. SQLite / DuckDB):
   ```bash
   anyfile query <path> --sql "SELECT * FROM <table> LIMIT 50"
   ```
   - Only read-only queries (`SELECT`, `WITH`, `EXPLAIN`, read-only `PRAGMA`) are permitted.
4. **Render a visual preview** as a bounded PNG (max dimension defaults to `1600px`, hard cap `4096px`):
   ```bash
   anyfile render <path> [--target <target-id>] [--max-dim 1600] --out preview.png
   ```
   - Pure-pixel formats (e.g. `.psd`, `.exr`, `.hdr`) decode directly in Node without launching a browser.
   - Visual/layout/CAD/3D formats (e.g. `.ofd`, `.dxf`, `.dwg`, `.pdf`) render offline via a local Chromium browser.
5. **Pre-warm `/vendor/` runtime assets** for offline environments when needed:
   ```bash
   anyfile cache add <pluginId...|all>
   anyfile cache list
   ```

## Error Handling

Errors are returned as structured JSON with a stable `code`:
- `invalid-argument`: Fix the command or parameters (missing path, missing `--sql`, invalid `--max-dim`, SQL syntax error).
- `access-denied`: Path does not exist or is outside allowed directories.
- `invalid-file` / `encrypted-file`: File is corrupted, unsupported, or password-protected.
- `target-not-found`: Pass a target `id` directly from `anyfile inspect`.
- `unsupported-capability`: Check `capabilities` from `anyfile inspect` before calling `read` or `query`.
- `runtime-unavailable`: Required local browser (Chrome/Edge/Brave/Chromium or `ANYFILE_BROWSER_PATH`; extra flags such as `--no-sandbox` via `ANYFILE_BROWSER_ARGS`), WebGL, or `/vendor/` runtime asset is unavailable.
- `timeout` / `resource-limit`: Narrow the target, lower `--max-bytes` / `--max-dim`, or add a `LIMIT` clause.
