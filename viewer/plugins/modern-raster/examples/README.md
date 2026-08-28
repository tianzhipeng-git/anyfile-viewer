# Modern raster fixtures

All fixtures are generated from programmatic gradients and solid colors by `scripts/generate-examples.mjs`; they contain no third-party photographic material.

- `sample-lossy.jxl`: lossy JPEG XL container.
- `sample-lossless-alpha.jxl`: lossless JPEG XL with alpha.
- `animated.jxl`: two-frame looping JPEG XL.
- `sample.heic`: HEVC HEIF primary image.
- `truncated.*` and `corrupt.jxl`: negative fixtures.

Generation requires ImageMagick, `cjxl` and `heif-enc`.
