# Legacy Office fixtures

## Apache POI test files (Apache-2.0)

Unmodified test fixtures from [Apache POI](https://github.com/apache/poi) (`test-data/document/` and `test-data/slideshow/`), licensed under Apache-2.0 (`LICENSE`):

| Local name | Upstream path | Purpose |
| --- | --- | --- |
| `sample-doc.doc` | `test-data/document/SampleDoc.doc` | Word 97–2003 text, styled runs, page break |
| `lists.doc` | `test-data/document/Lists.doc` | Word headings and unordered/ordered lists |
| `png-picture.doc` | `test-data/document/PngPicture.doc` | Word document with embedded OfficeArt PNG image |
| `word6.doc` | `test-data/document/Word6.doc` | Legacy Word 6.0 binary document |
| `unsupported-encrypted.doc` | `test-data/document/PasswordProtected.doc` | Password-protected `.doc` expected rejection |
| `sample-show.ppt` | `test-data/slideshow/SampleShow.ppt` | PowerPoint slides, styled text runs, speaker notes |
| `with-links.ppt` | `test-data/slideshow/WithLinks.ppt` | PowerPoint `SlideListWithText` outline refs and hyperlinks |
| `mixed-cjk.ppt` | `test-data/slideshow/bug55902-mixedFontChineseCharacters.ppt` | Mixed CJK and UTF-16 surrogate pair slide text |
| `unsupported-encrypted.ppt` | `test-data/slideshow/Password_Protected-hello.ppt` | Password-protected `.ppt` expected rejection |

## Locally generated original fixtures

Generated locally with macOS `textutil` from clean test HTML (public-domain / original test content):

- `rich-textutil.doc`: Word 97–2003 `.doc` with headings, bold/italic/underline, Chinese/English text, bullets, and a table.
- `rich-textutil.rtf`: Rich Text Format `.rtf` with fonts, colors, Chinese/English Unicode escapes, lists, and a table.

## Manual browser acceptance

Open `.doc`, `.ppt`, and `.rtf` samples on `/en/view` and `/zh-CN/view`. Verify document typography, tables, embedded PNG display, PPT slide navigation (all-slides and single-slide views), speaker notes toggle, narrow viewport wrapping without page overflow, and clear error messages on encrypted samples.
