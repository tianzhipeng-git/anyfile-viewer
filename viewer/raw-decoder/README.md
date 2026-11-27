# `@anyfile/raw-decoder`

Internal LibRaw adapter shared by viewers that need local RAW metadata, thumbnails or an 8-bit sRGB development.

It owns the versioned `/vendor/libraw/1.6.0/` runtime import, decoder timeout, abort/dispose lifecycle and common 256 MiB input / 64-megapixel output limits. Format routing, UI, localization and format-specific layout checks remain in each consuming viewer.

Node hosts (plugin `./extract`) use `loadLibRawFromVendor(vendor)`, which instantiates the same vendored `libraw.js` / `libraw.wasm` directly without the browser Worker wrapper, together with the shared `LIBRAW_DEVELOP_SETTINGS`.
