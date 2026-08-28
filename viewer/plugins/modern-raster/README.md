# Modern raster viewer

Stage 3 viewer for JPEG XL and HEVC-based HEIF/HEIC.

- JPEG XL uses a native `ImageDecoder` when available and otherwise loads `jxl-oxide-wasm@0.12.6` in a dedicated Worker.
- HEIC is offered only when the current browser reports native `image/heic` or `image/heif` decoding support. No HEVC decoder is bundled.
- JPEG XL is limited to 256 MiB input, 64 Mi decoded pixels and 4096 keyframes.
- HEIC currently displays only the primary image; auxiliary images and sequence navigation are not exposed.
