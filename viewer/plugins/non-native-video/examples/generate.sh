#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

video=( -f lavfi -i "testsrc2=size=160x90:rate=15:duration=1.2" )
audio=( -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=1.2" )
common=( -map 0:v:0 -map 1:a:0 -shortest -pix_fmt yuv420p -metadata title="Anyfile synthetic fixture" )

ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libx264 -profile:v baseline -level 3.0 -c:a aac -b:a 96k mkv-avc-aac.mkv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libx265 -preset ultrafast -x265-params log-level=error -c:a flac mkv-hevc-flac.mkv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libvpx -deadline realtime -cpu-used 8 -c:a libvorbis mkv-vp8-vorbis.mkv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -c:a libopus mkv-vp9-opus.mkv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libaom-av1 -cpu-used 8 -row-mt 1 -c:a libmp3lame -b:a 96k mkv-av1-mp3.mkv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" -map 0:v:0 -pix_fmt yuv420p -c:v libx264 -profile:v baseline -an mkv-avc-video-only.mkv
ffmpeg -hide_banner -loglevel error -y "${audio[@]}" -map 0:a:0 -c:a libopus mkv-opus-audio-only.mkv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" -map 0:v:0 -pix_fmt yuv420p -c:v mpeg4 -an mkv-unsupported-mpeg4.mkv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" -map 0:v:0 -pix_fmt yuv420p -c:v libx264 -an -f matroska -live 1 mkv-no-cues.mkv

cp ../../browser-video/examples/mp4-avc-aac-faststart.mp4 disguised-mp4.mkv
head -c 1024 mkv-avc-aac.mkv > truncated.mkv
printf 'not a matroska file\n' > corrupt.mkv
