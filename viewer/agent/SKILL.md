---
name: anyfile
description: Read-only inspection, structured extraction, and SQL querying for unfamiliar or proprietary local binary files via the `anyfile` CLI.
---

# Using `anyfile` to Read Local Files

When encountering an unfamiliar, binary, or proprietary local file (such as `.plist`, `.sqlite`, `.pst`, `.h5`, `.ofd`, `.dwg`, `.sav`, `.psd`, or extensionless blobs), always inspect first before reading.

## Recommended Workflow

1. **Inspect first** to identify the format, capabilities (`read`, `query`), metadata, and target IDs:
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

## Error Handling

Errors are returned as structured JSON with a stable `code`:
- `invalid-argument`: Fix the command or parameters (missing path, missing `--sql`, SQL syntax error).
- `access-denied`: Path does not exist or is outside allowed directories.
- `invalid-file` / `encrypted-file`: File is corrupted, unsupported, or password-protected.
- `target-not-found`: Pass a target `id` directly from `anyfile inspect`.
- `unsupported-capability`: Check `capabilities` from `anyfile inspect` before calling `query`.
- `timeout` / `resource-limit`: Narrow the target, lower `--max-bytes`, or add a `LIMIT` clause.
