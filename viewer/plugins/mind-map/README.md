# Mind map viewer

Browser-only, read-only mind map canvas for XMind, MindManager and FreeMind / Freeplane. Protocol v2; support level **3** because native application layout fidelity is incomplete.

| Format | Rendering coverage |
| --- | --- |
| XMind JSON | Sheets; complete topic hierarchy; theme and topic colors/font size/shapes; left/right map and logic layouts, up/down trees; positioned floating topics; summary brackets and boundaries; callouts; relationships; embedded raster images and sanitized SVG stickers; markers, labels, notes and task attributes |
| XMind XML | Sheets, topic hierarchy, structure/direction, floating positions, referenced topic styles, images, summaries, boundaries, relationships, markers, labels and plain notes |
| MindManager | Namespaced Document.xml; topic hierarchy, saved folding, level defaults and explicit topic colors/fonts; directional layout; floating topics, relationship endpoints, embedded image references, text/image attachments and task attributes |
| FreeMind / Freeplane | XML topic hierarchy, saved left/right direction and folding, explicit colors/fonts, icons, arrow links, attributes, rich-text titles converted to text, notes/details; local images from an authorized workspace |

The SVG canvas shows connected topics together. Controls provide fit, zoom, drag-to-pan, expand all, sheet switching and title search. Search reveals the matching topic's ancestors and centers the result. Select a topic for notes, links, markers, labels, task/attribute values and supported attachment previews. The details pane can be closed. Keyboard: +/- zoom, 0 fit, arrows pan, Enter/Space activate topics and fold controls.

Automatic layout uses the stored hierarchy and supported structure/direction settings. Native application spacing, custom themes/shapes, rich-text typography, fishbone/timeline/matrix layouts, relationship control points and application-specific business data are not fully reproduced. Floating coordinates are retained and can overlap recalculated branches. Attachments have inline previews for local text (up to 1 MiB) and supported images; other attachment types show their names. This renderer does not execute active content, edit files or export documents.

## Resources and lifecycle

- Input: 128 MiB. Expanded topic XML/JSON: 16 MiB; 20,000 topics; depth 128; 128 sheets; combined main topic text 4 Mi characters.
- Local resources: 16 MiB each, 64 MiB total. Only referenced image and supported attachment entries are read. Existing ZIP checks cover paths, duplicates, encryption, CRC and expansion.
- XML DTD/entities are rejected. Text uses text nodes. Embedded SVG reuses the SVG plugin's sanitizer and is displayed as an image, not injected markup.
- No remote images, fonts or file subresources are fetched. HTTP(S) hyperlinks open only on user activation. Workspace access is optional and restricted to safe relative paths.
- Abort/dispose cleans DOM, listeners, resize observation and image object URLs. Manifest/probe remain independent of the deferred renderer and sanitizer.

## Verification

```sh
pnpm --filter @anyfile/mind-map-viewer test
python3 viewer/plugins/mind-map/validation/download-samples.py /tmp/anyfile-mind-map-validation
MIND_MAP_PUBLIC_SAMPLES=/tmp/anyfile-mind-map-validation pnpm --filter @anyfile/mind-map-viewer test
```

Tests cover complete graph mounting, original left/right directions, independent floating coordinates, nonoverlapping logic/tree layouts, theme overrides, summaries/relationships, local images and SVG sanitization, attachments, search through folded branches, URL cleanup, format parsing, resource budgets, invalid input and lifecycle. The public corpus contains 33 valid maps and 3 negative XML fragments; parser/mount checks do not establish visual fidelity.

Checked-in `examples/` are synthetic fixtures under the repository license. Real-browser acceptance should include modern/legacy XMind, MindManager, and a large Freeplane map, plus narrow viewports, sheet changes, search, zoom and cancellation. The `.mm` probe reads at most 64 KiB and distinguishes XML maps from Objective-C++ source.
