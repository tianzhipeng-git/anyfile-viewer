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

ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libx264 -profile:v baseline -level 3.0 -c:a aac -b:a 96k -f mpegts ts-avc-aac.ts.fixture
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libx265 -preset ultrafast -x265-params log-level=error -c:a libmp3lame -b:a 96k -f mpegts ts-hevc-mp3.m2t
ffmpeg -hide_banner -loglevel error -y "${video[@]}" -map 0:v:0 -pix_fmt yuv420p -c:v libx264 -profile:v baseline -an -f mpegts -mpegts_m2ts_mode 1 ts-avc-video-only.m2ts
ffmpeg -hide_banner -loglevel error -y "${audio[@]}" -map 0:a:0 -c:a aac -b:a 96k -f mpegts ts-aac-audio-only.ts.fixture
ffmpeg -hide_banner -loglevel error -y "${video[@]}" -map 0:v:0 -pix_fmt yuv420p -c:v mpeg2video -an -f mpegts ts-unsupported-mpeg2video.ts.fixture
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libx264 -profile:v baseline -c:a ac3 -f mpegts ts-unsupported-ac3.ts.fixture

ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libx264 -profile:v baseline -c:a pcm_s16le -brand qt mov-avc-pcm.mov
ffmpeg -hide_banner -loglevel error -y "${video[@]}" -map 0:v:0 -pix_fmt yuv420p -c:v libx265 -preset ultrafast -x265-params log-level=error -an -brand qt -f mov mov-hevc-video-only.qt
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libx264 -profile:v baseline -c:a aac -brand qt mov-unsupported-aac.mov
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libtheora -q:v 7 -c:a libvorbis ogv-theora-vorbis.ogv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" "${audio[@]}" "${common[@]}" -c:v libtheora -q:v 7 -c:a libopus ogv-theora-opus.ogv
ffmpeg -hide_banner -loglevel error -y "${video[@]}" -map 0:v:0 -pix_fmt yuv420p -c:v libtheora -q:v 7 -an ogv-theora-video-only.ogg
ffmpeg -hide_banner -loglevel error -y "${audio[@]}" -map 0:a:0 -c:a libvorbis ogv-vorbis-audio-only.ogg

cp ../../browser-video/examples/mp4-avc-aac-faststart.mp4 disguised-mp4.mkv
cp mkv-avc-aac.mkv disguised-matroska.ts.fixture
cp mkv-avc-aac.mkv disguised-matroska.mov
cp mkv-avc-aac.mkv disguised-matroska.ogv
head -c 1024 mkv-avc-aac.mkv > truncated.mkv
head -c 376 ts-avc-aac.ts.fixture > truncated.ts.fixture
printf 'not a matroska file\n' > corrupt.mkv
printf 'not an mpeg transport stream\n' > corrupt.ts.fixture
printf '\x00\x00\x00\x14ftypqt  broken!!' > corrupt.mov
printf 'not an ogg stream\n' > corrupt.ogv
