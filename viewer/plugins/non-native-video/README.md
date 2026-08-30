# Non-native video viewer

Chromium-first Matroska, MPEG-TS, ordinary QuickTime and Ogg Theora playback. Matroska/MPEG-TS/QuickTime use Mediabunny 1.55.3, WebCodecs, Canvas and Web Audio; Ogg uses the separately loaded OGV.js 1.9.0 software demux/decoder path. Files stay in the browser and are read through bounded Blob slices/cache.

Supported video codecs: AVC/H.264, HEVC/H.265, VP8, VP9 and AV1. Supported primary audio codecs: AAC, Opus, Vorbis, MP3 and FLAC; video-only files are also supported.

The manifest and bounded container probes do not import Mediabunny or OGV.js. Their complete implementations are separate dynamic paths loaded only after routing selects the file.

MPEG-TS support covers one AVC/HEVC video stream with AAC/MP3 or no audio in `.ts`, `.mts`, `.m2ts` and `.m2t` files. The lightweight probe validates PAT, PMT, CRC and elementary PES evidence before routing.

QuickTime support covers AVC/HEVC with 16-bit PCM or no audio in `.mov` and `.qt`; browser-native AVC/AAC remains on `browser-video`. Ogg support covers one Theora video stream with Vorbis, Opus or no audio in `.ogv` and `.ogg`. Only the required Ogg Worker/WASM assets and their licenses are distributed.
