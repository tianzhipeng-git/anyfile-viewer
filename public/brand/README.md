# Anyfile brand icon

The mark combines a document silhouette and a viewing window. It follows
DESIGN.md's quiet, flat visual language: Action Blue and white, generous space,
no decorative shadows, no lettering within the icon. The Anyfile wordmark stays
as accessible system-font text in the website header and footer.

## Files

- `anyfile-master.png`: original generated artwork; keep as the export source.
- `anyfile-1024.png`: high-resolution square product icon.
- `anyfile-512.png`: recommended upload for AlternativeTo and other directories.
- `anyfile-192.png`: compact app/profile icon.
- `anyfile-64.png`: website brand mark, rendered at 28 CSS pixels.
- `../../src/app/favicon.ico`: 16, 32 and 48 pixel browser icons (repository path).
- `../../src/app/icon.png`: 48 pixel icon, automatically linked by Next.js.
- `../../src/app/apple-icon.png`: opaque 180 pixel Apple touch icon.

Square exports deliberately keep their full background; the host platform can
apply its own mask. The website uses the existing small utility corner radius.
Do not stretch the icon or add shadows, gradients or a second accent color.

Regenerate all sizes from the repository root:

```sh
node scripts/export-brand-icons.mjs
```

Created with the built-in imagegen tool on 2026-09-11. Final generation brief:
“Opaque Action Blue square; centered white document silhouette with a diagonal
upper-right corner; bold blue eye-shaped viewing window and white circular
pupil; generous margins, smooth geometric edges, no text, texture, shadow,
gradient or border.” The second generation corrected transparency in the first
draft. Exports only resize/re-encode the selected master; no runtime generation.
