# `@anyfile/viewer-ui`

Shared zero-dependency DOM primitives and theme token contract for Anyfile Viewer plugins. Only imported by dynamically loaded viewer plugins (never by host, manifests, or probes).

## Theme Token Contract

`ViewerHost` sets the canonical `--viewer-*` CSS custom properties on `.viewer-container` (both light and dark themes). `viewerTheme` exposes `var(...)` expressions with dark-mode-safe `color-mix()` fallbacks:

| Token | Host Mapping | Purpose |
|---|---|---|
| `--viewer-background` | `var(--background)` | Primary canvas/page background |
| `--viewer-foreground` | `var(--foreground)` | Primary text color |
| `--viewer-surface` | `var(--muted)` | Secondary surface (table headers, toolbars, code blocks) |
| `--viewer-muted` | `var(--muted-foreground)` | Secondary/dimmed text |
| `--viewer-border` | `var(--border)` | Hairline dividers and control borders |
| `--viewer-accent` | `var(--primary)` | Focus rings, active states, highlights |
| `--viewer-accent-foreground` | `var(--primary-foreground)` | Text on accent fills |
| `--viewer-danger` | `var(--destructive)` | Errors and destructive badges/notices |
| `--viewer-warning` | `var(--support-partial)` | Warnings and partial-support notices |
| `--viewer-success` | `var(--support-strong)` | Valid/healthy status badges/notices |
| `--viewer-font-family` | `var(--font-system)` | UI sans-serif font stack |
| `--viewer-font-mono` | `var(--font-monospace)` | Monospace font stack |

## Primitives

- **DOM & Formatting**: `el(tag, propsOrClass?, ...children)` (XSS-safe text nodes only), `formatBytes(bytes, locale?, options?)`.
- **Inspector Shell**: `createInspectorShell({ className, title, subtitle?, stats?, badges?, layout?: "scroll" | "split", viewportClassName?, sidebarClassName?, extraStyles? })` — scoped `.anyfile-inspector` CSS, container-query responsive split layout, auto-hiding `:empty` toolbar, `onDispose()`, idempotent `dispose()`.
- **Key-Value List**: `createKeyValueList(items, { variant?: "list" | "cards" })` — semantic `<dl>` with optional `mono`, `hidden`, and `Node` values.
- **Data Table**: `createDataTable({ columns, rows?, emptyMessage?, note?, stickyHeader?, bordered?, onSort? })` — sticky headers on `--viewer-surface`, accessible `<button>` sort triggers with `aria-sort`, `setRows()`, `dispose()`.
- **Controls**: `createFilterInput`, `createSection`, `createNotice`, `createBadge`, `createTabBar`, `createPager`.
- **Paged Table Viewer**: `createPagedTableViewer` (used by `duckdb`, `sqlite`, `excel`).
