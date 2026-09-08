#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"
common=(-hide_banner -loglevel error -y -f lavfi -i "sine=frequency=997:sample_rate=48000:duration=3" -map_metadata -1 -ac 2)
"$ffmpeg_bin" "${common[@]}" -c:a libopus -b:a 96k mka-opus.mka
"$ffmpeg_bin" "${common[@]}" -c:a libvorbis -q:a 4 mka-vorbis.mka
"$ffmpeg_bin" "${common[@]}" -c:a flac -sample_fmt s16 mka-flac.mka
"$ffmpeg_bin" "${common[@]}" -c:a aac -profile:a aac_low -b:a 128k mka-aac.mka
"$ffmpeg_bin" -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=160x90:rate=15:duration=3" -f lavfi -i "sine=frequency=997:sample_rate=48000:duration=3" -map 0:v -map 1:a -map_metadata -1 -c:v libvpx-vp9 -b:v 120k -c:a libopus mka-video-counterexample.mka
law=(-hide_banner -loglevel error -y -f lavfi -i "sine=frequency=997:sample_rate=8000:duration=3" -map_metadata -1 -ac 1)
"$ffmpeg_bin" "${law[@]}" -c:a pcm_alaw wave-alaw.wav
"$ffmpeg_bin" "${law[@]}" -c:a pcm_mulaw wave-ulaw.wav
"$ffmpeg_bin" "${law[@]}" -c:a adpcm_ima_wav wave-adpcm-unsupported.wav
node generate-counterexamples.mjs
node write-manifest.mjs
