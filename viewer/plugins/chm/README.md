# @anyfile/chm-reader

Read-only local Microsoft Compiled HTML Help (`.chm`) viewer plugin implementing protocol v2.

## Capabilities

- Bounded ITSF v2/v3, ITSP, and PMGL directory parsing via `File.slice()` (`src/itsf.ts`, `src/probe.ts`).
- Clean-room TypeScript Microsoft LZX (`LZXC`) stream decompression supporting Verbatim, Aligned Offset, and Uncompressed blocks, Intel E8 call reversal, and on-demand `ResetTable` interval caching (`src/lzx.ts`).
- Metadata and navigation extraction from `#SYSTEM`, `#STRINGS`, `#TOPICS`, `#URLTBL`, `#URLSTR`, `.hhc` contents trees, and `.hhk` keyword indexes (`src/chm-metadata.ts`).
- Windows LCID and HTML `<meta charset>` encoding detection (`UTF-8`, `GBK`, `Big5`, `Shift_JIS`, `Windows-125x`, etc.) (`src/encoding.ts`).
- Sanitized, script-free publication rendering reusing `@anyfile/rendering-publication` (`sandbox="allow-same-origin"` without `allow-scripts`, CSP isolation, collapsible Contents tree / Index sidebar, Back/Forward history, typography controls, and light/dark themes).

## Security and Resource Limits

- Input file limit: 128 MiB (`CHM_LIMITS.maxFileBytes`).
- Maximum directory chunks: 4,096; maximum entries: 20,000; maximum uncompressed section: 128 MiB; maximum topics: 2,000; maximum topic size: 2 MiB; maximum cached reset intervals: 8.
- Scripts, `<object>`/ActiveX controls, `<embed>`, `<applet>`, `<iframe>`, `<form>`, event handlers, `javascript:` URLs, cross-CHM `ms-its:` links, and remote subresources are stripped or replaced with localized notices.

## Agent Extract (`./extract`)

[src/extract.ts](src/extract.ts) reuses the ITSF/LZX readers, `chm-metadata.ts`, and the topic order of `createChmPublication` in Node; topic HTML is decoded with the CHM encoding and converted to Markdown by `@anyfile/rendering-publication/text`.

- `inspect`: title, compiled name, encoding, LCID, default topic, topic and index-entry counts, and the flattened contents tree (first 1,000 entries); targets are `chapter:<n>` topics in reading order (contents → index → `#TOPICS` → remaining HTML).
- `read`: Markdown; `chapter:<n>` is one topic's text (headings, paragraphs, lists, quotes, table rows, preformatted blocks); without `target` it returns the header plus all topics, decoding only those the current page window needs; `filter` is supported.
- Images, stylesheets, scripts, and ActiveX objects are dropped.

## Verification

```sh
pnpm test viewer/plugins/chm
```
