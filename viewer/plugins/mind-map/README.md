# Mind map viewer

Protocol v2, browser-only, read-only level **3** topic structure viewer.

| Software / format | Read path | Coverage |
| --- | --- | --- |
| XMind `.xmind` | ZIP `content.json` (preferred), legacy `content.xml` | Multiple sheets, attached/floating/summary/callout topics, plain notes, link text |
| MindManager `.mmap` | ZIP `Document.xml`, namespaced `Map/OneTopic/Topic` | Topic hierarchy, text, XHTML notes, link text |
| FreeMind / Freeplane `.mm` | XML `map/node` | Topic hierarchy, rich-text titles, notes/details, link text |

The focused map shows the current topic and up to 100 child branches per page. Click a branch to browse deeper; parent/root controls navigate back. All topics remain reachable without mounting a complete large tree. Native buttons/selects support keyboard navigation; one viewport owns scrolling. The display uses the host theme and English/Simplified Chinese strings, with English fallback.

This is not a pixel-faithful reproduction. Original layout, styles, images, attachments, relationship lines, boundaries, markers and task metadata are not reproduced. Floating, summary and callout XMind topics are represented as branches without reproducing their positioning or relationships. Rich notes become plain text; hyperlinks are displayed as text and never fetched. Encrypted files are rejected. No editing/export.

## Limits and lifecycle

- Main input: 128 MiB. Topic XML/JSON: 16 MiB (independent expanded-content budget).
- 20,000 topics, depth 128 (root is depth 0), 128 sheets; 4 Mi characters of combined topic text.
- Existing archive ZIP reader validates paths, duplicate entries, encryption, compression, CRC and expansion. Only the topic entry is decompressed; attachments are not read.
- XML DTD/entities are rejected. Parsed file markup never enters the live DOM.
- Stream reads observe abort; ZIP reads use the existing cancellation checks. All reads finish before mounting. Abort/dispose removes the owned DOM and handlers; disposal is idempotent.
- No new runtime dependency or external asset. Manifest/probe stay independent of the dynamically loaded parser/view.

## Verification

`corepack pnpm --filter @anyfile/mind-map-viewer test`

Tests exercise real ZIP decoding (stored/deflated), both XMind encodings, MindManager namespaces, Freeplane rich content, navigation/sheets/pagination, input/depth/count/text budgets, CRC corruption, unsafe paths, DTD rejection, cancellation and repeated disposal. App tests cover registration, icons, content coverage and localization.

`examples/` contains original synthetic fixtures, licensed under the repository Apache-2.0 license. They test documented file structures; they are **not** exports from the desktop products and do not establish full compatibility with every product version.

Manual browser acceptance: open each example in `/zh-CN/view` and `/en/view`; traverse branches, switch XMind sheets, resize to narrow/short windows and switch files during opening. Confirm scrolling and keyboard focus. For release compatibility, additionally test independently exported documents from each target software; record product versions and any unsupported features. DOM tests do not prove real browser layout.

### Verification record — 2026-10-16

- New plugin suite: **26/26 passed** (real parser and ZIP reader, DOM environment).
- Application suite: **131/131 passed**, including `.mm` versus Objective-C++ routing, icon coverage, content pages and i18n.
- Shared archive suite: **88/88 passed**.
- `corepack pnpm lint`, `corepack pnpm exec tsc --noEmit`, `git diff --check`: passed.
- `corepack pnpm build`: passed, including static generation and all four bundle/asset gates.
- Built mind-map manifest: 345 bytes gzip; probe: 395 bytes gzip; deferred viewer including shared ZIP chunk: 42,169 bytes gzip. No added external runtime assets.
- At initial implementation, real-browser layout checks and public-file compatibility checks were **not performed**. Checked-in samples are synthetic, as described above; these results do not assert full application fidelity.

The `.mm` probe reads at most 64 KiB and recognizes the XML root after its declaration/comments. It rejects Objective-C++ source so the existing code viewer remains available. The mind-map registration precedes the generic code registration for equal support levels. Files with unusually long prologs outside that bounded header can still be opened as text but are not automatically recognized as mind maps.


### Public-file validation follow-up

Downloaded and tested **36 public files**: 4 XMind, 21 MindManager, 8 valid FreeMind/Freeplane maps, and 3 unsupported XML fragments retained as negative cases. All 33 valid maps open with matching independently counted topic totals; all 3 fragments are correctly rejected. Public samples exposed missing XMind summary/callout topics, now preserved as branches. See [public validation report](validation/REPORT.md) for sources, pinned revisions, checksums, counts and reproduction instructions. Real-browser visual/layout acceptance remains unperformed.
