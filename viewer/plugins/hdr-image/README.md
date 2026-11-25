# `@anyfile/hdr-image-viewer`

Local high dynamic range (HDR) image viewer plugin for OpenEXR (`.exr`) and Radiance HDR (`.hdr` / `.rgbe`).

## Capabilities

- **OpenEXR (`.exr`)**:
  - Single-part scanline, single-part tiled (level 0), and multi-part files
  - Compressions: `None`, `RLE`, `ZIPS`, `ZIP`, `PIZ` (2D Haar wavelet + canonical Huffman), `PXR24`, `B44` / `B44A`
  - Pixel types: `HALF` (16-bit IEEE-754), `FLOAT` (32-bit), `UINT` (32-bit), plus `Y`/`RY`/`BY` luminance-chroma upsampling
  - Automatic AOV layer grouping (`Beauty RGBA/RGB`, dotted `layer.R/G/B/A`, vector `layer.X/Y/Z`, and standalone scalar channels) with on-demand part/layer switching in the Worker
- **Radiance HDR (`.hdr`, `.rgbe`)**:
  - `32-bit_rle_rgbe` and `32-bit_rle_xyze` (converted to linear Rec.709 RGB)
  - Uncompressed, legacy RLE, and adaptive new-style RLE across all 8 scanline orientations
- **Interactive HDR Grading & Inspection**:
  - Real-time Exposure (`-10` to `+10` EV), Auto EV (log-average luminance), Gamma (`0.5` to `3.0`), and Tone Mapping (`ACES Filmic`, `Reinhard`, `Uncharted 2 Filmic`, `Linear`)
  - Channel inspection (`RGB`, `R`, `G`, `B`, `A`, `Luminance`, and `False Color EV` heatmap)
  - 2D pan/zoom/rotate viewport (`@anyfile/viewer-rendering`) with live hover linear Float32 RGBA + luminance readout
  - Interactive 360° WebGL equirectangular HDRI environment sphere preview with drag yaw/pitch, FOV zoom, and live tone-mapping updates

## Dependencies & Budgets

- Runtime dependency: `fflate@0.8.3` (MIT) for OpenEXR `ZIP` / `ZIPS` / `PXR24` zlib inflation. No external WASM or CDN runtime assets (`policy.json` declares `runtimeSets: []`).
- Limits: 256 MiB input, 16,384 px max edge, 32 Mi pixels (`33,554,432`, sufficient for 8K `8192×4096` HDRIs), 64 EXR parts, 512 channels per part.
- Unsupported: `DWAA` / `DWAB` compression and OpenEXR deep-data (`deepscanline` / `deeptile`) parts.

## Verification

```bash
pnpm test viewer/plugins/hdr-image
HDR_TEST_FILE=/abs/path/to/sample.exr pnpm test viewer/plugins/hdr-image
```
