# Comic book examples

- `little-square.cbz`: original four-page comic (JPEG and PNG pages, one double-page spread) with a `ComicInfo.xml` (title, series, number, writer, summary, page types). The page art is simple shapes drawn by [make-little-square.py](make-little-square.py) with Pillow; no third-party artwork. Dedicated to the public domain under CC0 1.0.

Regenerate from the repository root:

```bash
python3 viewer/plugins/comic-book/examples/make-little-square.py viewer/plugins/comic-book/examples/little-square.cbz
```

Format edge cases (CBR/CB7/CBT, encryption, bombs, traversal) live in `docs/ebooks/fixtures/`.
