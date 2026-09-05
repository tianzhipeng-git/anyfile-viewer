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
- `next` returns one interleaved I420 video frame, interleaved Float32 PCM
  buffer, or EOF. The C adapter drains all frames from each packet and sends
  a null packet to both decoders at EOF to drain delayed B frames/audio.
- One C output slot is reused; Worker copies out of the WASM heap and
  transfers that copy. Client permits only one outstanding command. The
  caller must consume/release the event before pulling another.
- MPEG-PS timestamp indexes do not guarantee a keyframe. `seek.c` verifies that a backward recovery window yields an actual decoded video frame no later than the target, then rewinds to that window before normal output. Failed windows expand only to 16 seconds, with the same total read/decode/deadline budget. Trial audio/video is never delivered or substituted for the subsequent playback stream.
- `seek` resets both decoders, packet/frame, EOF, PCM conversion and timestamp
  fallback. At byte-seek discontinuities, MPEG-PS may yield a partial audio frame or video without a timestamp anchor. Recovery is limited to 512 packets per selected track and only tolerates `AVERROR_INVALIDDATA` until that track emits its first valid timed frame; normal playback decode errors remain fatal. It returns valid preroll; the product playback scheduler discards
  frames before the target and trims overlapping PCM. Generation labels
  identify stale output; they do not perform scheduling or PCM trimming.
- `close` is a normal-path cleanup command. `dispose`/abort immediately
  terminates the Worker and rejects pending requests without waiting for C.
  Synchronous WASM execution is interrupted by Worker termination.

## Runtime limits

| Resource | Limit |
|---|---:|
| WASM heap | 256 MiB maximum, 32 MiB initial |
| Individual FFmpeg allocation | 64 MiB |
| Video pixels | 1920 × 1080 total pixels |
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
to `anyfile-bucket/vendor/ffmpeg-playback/9.0.1-anyfile.1/`; verify public
SHA-256, MIME, CORS/CORP and immutable caching at `https://assets.anyfile.top`.
