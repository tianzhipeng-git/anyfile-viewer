# Non-native video viewer

Chromium-first Matroska playback through Mediabunny 1.55.3, WebCodecs, Canvas and Web Audio. Files stay in the browser and are read through bounded Blob slices/cache.

Supported video codecs: AVC/H.264, HEVC/H.265, VP8, VP9 and AV1. Supported primary audio codecs: AAC, Opus, Vorbis, MP3 and FLAC; video-only files are also supported.

The manifest and bounded Matroska probe do not import Mediabunny. The complete player is loaded only after routing selects the plugin.
