# FFmpeg playback runtime build and spike

This directory maintains the pinned FFmpeg build and phase 3.0 decode experiment.
The product uses the shared `viewer/ffmpeg-playback` session through separate
AVI and AIFF/AIFC plugins. Ordinary application builds verify prepared assets;
they never compile FFmpeg. Compiled codecs are not product support claims.

```sh
bash tools/ffmpeg-playback-build/build.sh /tmp/anyfile-ffmpeg-build
node --test tools/ffmpeg-playback-build/client.test.mjs
node tools/ffmpeg-playback-build/verify-build.mjs /tmp/anyfile-ffmpeg-build
node tools/ffmpeg-playback-build/smoke-test.mjs /tmp/anyfile-ffmpeg-build
```

Requirements: Docker capable of running the pinned linux/amd64 Emscripten
image, Node 24, Python 3 (deterministic source archive assembly), installed project dependencies, and Playwright Chromium.
For adapter-only iteration after a full build, `relink.sh /tmp/anyfile-ffmpeg-build` reuses that experimental build’s static libraries. A configuration/upstream change always requires a full build. Never relink over a published artifact version.

The checked-in fixtures can be used without native FFmpeg. To regenerate,
run `examples/generate.sh`; record any generator/version/hash changes.

The output’s `relink/` directory retains the locked upstream source archive, generated public configuration header and static libraries for local iteration; it is not a browser runtime asset.

The build downloads the SHA-256-locked release into a temporary container
directory, compiles a broad decode-only configuration, and writes glue,
WASM, Worker, licenses, full configure output and hashed build information
to the explicit output directory. It never downloads user media. Upstream
source is unmodified; no fork or upstream patches are used.

## Session and ownership

- One local `File` per Worker, mounted read-only at `/input/media` through
  WORKERFS. User filenames never become filesystem paths.
- C custom AVIO reads that mounted file in bounded slices; all FFmpeg URL
  protocols are disabled and secondary `io_open` requests are rejected.
- `open(file, video)` requires exactly one primary video for video mode,
  at most one primary audio, and no primary video for audio mode. Attached
  pictures are excluded. Missing/ambiguous media is rejected, not silently
  selected. This is runtime validation, not a lightweight product probe.
- `open(file, panorama: true)` explicitly selects exactly two 3840² HEVC 8-bit 4:2:0 video tracks plus one AAC track. The C slots are front video / audio / back video. Both lenses are decoded at source resolution; bounded display output is scaled to 1920². Video events carry `lens: 0 | 1`. Ordinary mode still rejects multiple primary video tracks.
- `next` returns one interleaved I420 video frame, interleaved Float32 PCM
  buffer, or EOF. The C adapter drains all frames from each packet and sends
  a null packet to all selected decoders at EOF to drain delayed B frames/audio.
- One C output slot is reused; Worker copies out of the WASM heap and
  transfers that copy. Client permits only one outstanding command. The
  caller must consume/release the event before pulling another.
- MPEG-PS timestamp indexes do not guarantee a keyframe. `seek.c` verifies that a backward recovery window yields an actual decoded video frame no later than the target, then rewinds to that window before normal output. Failed windows expand only to 16 seconds, with the same total read/decode/deadline budget. Trial audio/video is never delivered or substituted for the subsequent playback stream.
- `seek` resets all selected decoders, packet/frame, EOF, PCM conversion and timestamp
  fallback. At byte-seek discontinuities, MPEG-PS may yield a partial audio frame or video without a timestamp anchor. Recovery is limited to 512 packets per selected track and only tolerates `AVERROR_INVALIDDATA` until that track emits its first valid timed frame; normal playback decode errors remain fatal. It returns valid preroll; the product playback scheduler discards
  frames before the target and trims overlapping PCM. Generation labels
  identify stale output; they do not perform scheduling or PCM trimming.
- `close` is a normal-path cleanup command. `dispose`/abort immediately
  terminates the Worker and rejects pending requests without waiting for C.
  Synchronous WASM execution is interrupted by Worker termination.

## Runtime limits

| Resource | Limit |
|---|---:|
| WASM heap | 512 MiB maximum, 32 MiB initial |
| Individual FFmpeg allocation | 64 MiB |
| Video pixels | 1920 × 1080 ordinary; 3840² per lens in panorama mode, output scaled to 1920² |
| Primary audio | 1–2 channels, 8–96 kHz |
| Single PCM frame | 65,536 samples per channel |
| Packet/output buffer | 16 MiB |
| Streams | 8 |
| Demux probe | 512 KiB, 512 probe packets, 2 s analysis duration |
| FFmpeg index | 4 MiB |
| Reads per open/seek/next | 32 MiB |
| Decode work steps per next/seek | 8,192 |
| MPEG-PS seek recovery search | 1/2/4/8/16 s backward windows, same command I/O/deadline budget |
| C cooperative deadline / main-thread watchdog | 10 s / 15 s |

These are explicit spike bounds, not a claim that every malicious container
is safely parsed within them. A Worker is a responsiveness/cancellation
boundary, not an input security sandbox. The browser smoke tests malformed
headers, excessive dimensions and ambiguous tracks; deeper malformed-index,
packet allocation and adversarial CPU tests remain release work.

Float32 output preserves source rate and mono/stereo layout, with no sample
rate conversion or downmix. Midstream layout/rate/sample-format changes are
rejected. The spike does not claim bit-perfect, gapless, encoder-padding,
HDR, interlacing, color-management, aspect-ratio or professional accuracy.

## Acceptance boundaries

`smoke-test.mjs` runs real Worker/WASM in Chromium under a CSP permitting
WASM but not `unsafe-eval`. It exercises continuous decode/EOF, first output,
Canvas acceptance, PCM validity/nonzero signal, repeated forward/backward
seek, error categories, opening/active cancellation, and a sparse file read
beyond 4 GiB plus reverse seek. It reports wall time and WASM heap/read bytes;
these are not process peak memory or sampled CPU usage.

To assemble the reviewed product distribution after validation:

```sh
node tools/ffmpeg-playback-build/assemble-artifact.mjs /tmp/anyfile-ffmpeg-build
pnpm prepare:ffmpeg
```

Assembly verifies compiled artifact and relink input hashes, includes source,
licenses and deterministic relink materials, then writes an artifact manifest.
The product browser test is `node scripts/verify-ffmpeg-browser.mjs` against a
production server at `FFMPEG_TEST_URL` (default http://127.0.0.1:3147).
See [delivery evidence](../../docs/videos/ffmpeg-playback-delivery.md) for scope,
resource bounds and browser coverage. Publish the complete prepared version directory
to `anyfile-bucket/vendor/ffmpeg-playback/9.0.1-anyfile.4/`; verify public
SHA-256, MIME, CORS/CORP and immutable caching at `https://assets.anyfile.top`.

## SIMD (9.0.1-anyfile.3)

The C compile and final link flags both include `-msimd128`. This enables
Clang autovectorization without introducing pthreads or changing playback
scheduling. SIMD support is required to instantiate this artifact.

A terminal-only check runs the production WASM with a read-only Node adapter
for WORKERFS's FileReaderSync calls, without launching a browser:

```sh
node tools/ffmpeg-playback-build/measure-node.mjs /path/to/runtime /path/to/sample.insv panorama 30
```

On the local M3 Pro, three alternating runs of the same X4 sample showed
30 lens pairs taking 10.760 s without SIMD versus 9.738 s with SIMD (median),
a 1.105× throughput improvement. Video and PCM hashes were identical.
This is a decode benchmark, not a browser playback or real-time guarantee.
See [SIMD evidence](../../docs/videos/evidence/ffmpeg-simd-comparison.json).

## Threads and buffering (9.0.1-anyfile.4)

The build keeps SIMD and enables pthreads, with a preloaded pool of four
Workers and two frame decoder threads per panorama lens. The X4 fixture has
tiles but no WPP, so HEVC slice threading would not parallelize this file.
Ordinary AVI/AIFF decode remains single-threaded. WASM retains a 512 MiB cap.
The glue also bootstraps pthreads and always executes from the same origin;
only WASM uses the mirror/fallback selection. Cross-origin isolation and
SharedArrayBuffer are required. Normal close terminates the pool; hard
cancellation terminates the parent Worker and its descendants.

Panorama playback/resume waits for 0.5 s across both lenses and audio, with
0.7 s prefetch and a 256 MiB display queue. A silent preview/paused seek
still primes only 0.1 s; a shorter EOF tail can play immediately.
The same production glue includes Emscripten's Node environment to exercise
real pthread workers using `measure-node.mjs` without browser automation.

Three alternating terminal runs on the X4 sample measured 9.799 s versus
3.604 s median for 30 lens pairs (2.72× throughput, about 8.32 pairs/s).
The first 30 outputs per track match exactly; frame threads change event
interleaving. Observed WASM heap was 355,991,552 bytes. This is not a
browser playback or real-time guarantee. See the [thread evidence](../../docs/videos/evidence/ffmpeg-thread-comparison.json).
