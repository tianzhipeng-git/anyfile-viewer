# PDF Examples

| File | Source | License | Purpose |
|---|---|---|---|
| `demo.pdf` | WPS PDF export (original) | Project sample | Single A4 page with one text run; default open check |
| `multipage-outline.pdf` | Original PostScript rendered by GPL Ghostscript 10.02.1 `pdfwrite` (`/DOCINFO` + `/OUT` pdfmarks) | Project sample | 3 pages (A4 portrait ×2, landscape ×1), document info, 3 outline entries, multi-column text lines |
| `encrypted-password.pdf` | Same PostScript, Ghostscript `-sUserPassword=secret -sOwnerPassword=owner` | Project sample | Open-password PDF (`secret`); `./extract` maps it to `encrypted-file` |
