# Camera RAW viewer

Stage 3 viewer for DNG, CR2, CR3, NEF, ARW and RAF.

- `libraw-wasm@1.6.0` runs locally and provides metadata, embedded preview extraction and basic 8-bit sRGB development.
- The output uses camera white balance, camera matrix and file orientation. It is a basic preview, not color-managed editor output.
- Input is limited to 256 MiB and decoded output to 64 Mi pixels.
- Full development requires `/view` to be cross-origin isolated because the pinned LibRaw build uses pthread WebAssembly.
- The wrapper is ISC-licensed. Its compiled dependencies retain their own notices, including LibRaw's CDDL-1.0/LGPL-2.1 dual license.
- Probe level 3 is reserved for camera models backed by committed, redistributable real-camera fixtures; the verified list is intentionally empty until such fixtures are added.
