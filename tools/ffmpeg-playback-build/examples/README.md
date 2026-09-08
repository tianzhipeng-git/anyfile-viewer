# Synthetic playback spike fixtures

`generate.sh` creates four-second testsrc2 videos and 440 Hz sine waves;
there is no third-party media content. These generated examples may be
redistributed under the repository Apache-2.0 license. The exact generator
build is in `generator-version.txt`; byte identities are in `manifest.sha256`.
Generation uses native FFmpeg only as test tooling, never as the viewer runtime.

- AVI: MPEG-4 Part 2 with B frames and MP3; video-only; 1080p workload.
- MPEG-PS: MPEG-2 with B frames and AC-3/MP2.
- ASF: WMV2/WMA2 and audio-only WMA1/WMA2.
- AIFF/AIFC: S16BE stereo, S24BE mono and F32BE stereo at 48 kHz; valid silence.
- MP3 with a synthetic attached JPEG, used only to test main-video exclusion.
- Counterexamples: multiple audio tracks, >1080p, corrupt/truncated AVI,
  unknown FourCC and nonfinite Float32 PCM, and the same genuine A/V and audio-only files passed to the opposite mode.

The browser test creates a sparse 4 GiB + 18 byte file temporarily to exercise
WORKERFS offsets and reverse seek without committing a huge fixture.

APE, WMV3/VC-1, interlacing, HDR, multichannel, malformed
indexes and long-duration memory/CPU workloads have no acceptance evidence
from this set. Decoder availability is not a support claim.
