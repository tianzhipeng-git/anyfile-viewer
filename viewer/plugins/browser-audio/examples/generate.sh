#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"
common=(-hide_banner -loglevel error -y -f lavfi -i "sine=frequency=997:sample_rate=48000:duration=3" -map_metadata -1)

"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a libmp3lame -b:a 128k -id3v2_version 3 -write_id3v1 1 -metadata title="Fixed synthetic tone" mp3-cbr.mp3
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a libmp3lame -q:a 2 -write_xing 1 mp3-vbr-xing.mp3
"$ffmpeg_bin" -hide_banner -loglevel error -y -f lavfi -i "color=c=royalblue:size=32x32:duration=1" -frames:v 1 -update 1 cover.png
"$ffmpeg_bin" -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=997:sample_rate=48000:duration=3" -i cover.png -map 0:a -map 1:v -map_metadata -1 -ac 2 -c:a libmp3lame -b:a 128k -c:v png -id3v2_version 3 -metadata:s:v title="Cover" -metadata:s:v comment="Cover (front)" -disposition:v attached_pic mp3-id3-apic.mp3
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a pcm_s16le wave-s16le.wav
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a pcm_s24le wave-s24le.wav
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a pcm_f32le wave-f32le.wav
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a adpcm_ima_wav wave-adpcm-unsupported.wav
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a aac -profile:a aac_low -b:a 128k -movflags +faststart m4a-aac-lc.m4a
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a alac -movflags +faststart m4a-alac-unsupported.m4a
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a libvorbis -q:a 4 ogg-vorbis.ogg
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a libopus -b:a 96k ogg-opus.opus
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a libopus -b:a 96k webm-opus.webm
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a libvorbis -q:a 4 webm-vorbis.webm
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a flac -sample_fmt s16 flac-16.flac
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 flac-24.flac
"$ffmpeg_bin" -hide_banner -loglevel error -y -i flac-16.flac -i cover.png -map 0:a -map 1:v -map_metadata -1 -c:a copy -c:v copy -disposition:v attached_pic -metadata:s:v title="Cover" -metadata:s:v comment="Cover (front)" flac-picture.flac
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a aac -profile:a aac_low -b:a 128k -f adts adts-aac-lc.aac

"$ffmpeg_bin" -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=160x90:rate=15:duration=3" -f lavfi -i "sine=frequency=997:sample_rate=48000:duration=3" -map 0:v -map 1:a -map_metadata -1 -c:v libvpx-vp9 -b:v 120k -c:a libopus webm-video.webm
"$ffmpeg_bin" -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=160x90:rate=15:duration=3" -f lavfi -i "sine=frequency=997:sample_rate=48000:duration=3" -map 0:v -map 1:a -map_metadata -1 -c:v libtheora -q:v 4 -c:a libvorbis ogg-theora-video.ogg
"$ffmpeg_bin" -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=160x90:rate=15:duration=3" -f lavfi -i "sine=frequency=997:sample_rate=48000:duration=3" -map 0:v -map 1:a -map_metadata -1 -c:v libx264 -preset ultrafast -c:a aac -movflags +faststart mp4-video.mp4
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a pcm_s16be spike-aiff.aiff
"$ffmpeg_bin" "${common[@]}" -ac 2 -c:a wmav2 -b:a 128k spike-wma.wma

node generate-counterexamples.mjs
node write-manifest.mjs
