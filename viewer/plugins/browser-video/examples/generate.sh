#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"

command -v "$ffmpeg_bin" >/dev/null
cd "$script_dir"

video_source=(
  -f lavfi -i "testsrc2=size=320x180:rate=30:duration=2"
)
audio_source=(
  -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=2"
)
common=(
  -hide_banner -loglevel error -y
)
strip_metadata=(-map_metadata -1)

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -g 30 \
  -c:a aac -b:a 96k -ac 2 -movflags +faststart -shortest mp4-avc-aac-faststart.mp4

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -g 30 \
  -c:a aac -b:a 96k -ac 2 -shortest mp4-avc-aac-tail-moov.mp4

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -g 30 \
  -an -movflags +faststart mp4-avc-video-only.mp4

"$ffmpeg_bin" "${common[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -vn -c:a aac -b:a 96k -ac 2 -movflags +faststart mp4-aac-audio-only.mp4

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libvpx -b:v 260k -pix_fmt yuv420p -g 30 -c:a libvorbis -b:a 96k \
  -shortest webm-vp8-vorbis.webm

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libvpx-vp9 -b:v 260k -pix_fmt yuv420p -g 30 -c:a libopus -b:a 96k \
  -shortest webm-vp9-opus.webm

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libvpx-vp9 -b:v 260k -pix_fmt yuv420p -g 30 -an webm-vp9-video-only.webm

"$ffmpeg_bin" "${common[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -vn -c:a libopus -b:a 96k webm-opus-audio-only.webm

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libx265 -preset ultrafast -x265-params log-level=error -tag:v hvc1 \
  -pix_fmt yuv420p -c:a aac -b:a 96k -ac 2 -movflags +faststart -shortest \
  mp4-hevc-aac.mp4

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libsvtav1 -preset 12 -crf 42 -pix_fmt yuv420p \
  -c:a aac -b:a 96k -ac 2 -movflags +faststart -shortest mp4-av1-aac.mp4

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -g 30 \
  -c:a aac -b:a 96k -ac 2 -shortest mov-avc-aac.mov

"$ffmpeg_bin" "${common[@]}" "${video_source[@]}" "${audio_source[@]}" \
  "${strip_metadata[@]}" \
  -c:v libtheora -q:v 7 -c:a libvorbis -q:a 4 -shortest ogv-theora-vorbis.ogv

"$ffmpeg_bin" "${common[@]}" \
  -f lavfi -i "testsrc2=size=176x144:rate=25:duration=2" \
  "${audio_source[@]}" "${strip_metadata[@]}" -c:v libx264 -profile:v baseline -level 1.3 \
  -pix_fmt yuv420p -g 25 -c:a aac -b:a 64k -ac 1 -shortest 3gp-avc-aac.3gp

# Deterministic negative controls. Truncated files retain a valid prefix;
# corrupt files contain only a damaged family signature; disguised files are
# valid media from another family with the candidate extension.
head -c 160 mp4-avc-aac-faststart.mp4 > truncated.mp4
head -c 160 webm-vp8-vorbis.webm > truncated.webm
head -c 160 mov-avc-aac.mov > truncated.mov
head -c 160 ogv-theora-vorbis.ogv > truncated.ogv
head -c 160 3gp-avc-aac.3gp > truncated.3gp

printf '\x00\x00\x00\x18ftypisom\x00\x00\x00\x00broken!!' > corrupt.mp4
printf '\x1a\x45\xdf\xa3\x9fbroken-webm' > corrupt.webm
printf '\x00\x00\x00\x14ftypqt  broken!!' > corrupt.mov
printf 'OggSbroken-ogg' > corrupt.ogv
printf '\x00\x00\x00\x18ftyp3gp4broken!!' > corrupt.3gp

cp webm-vp8-vorbis.webm disguised-webm.mp4
cp mp4-avc-aac-faststart.mp4 disguised-mp4.webm
cp webm-vp8-vorbis.webm disguised-webm.mov
cp mp4-avc-aac-faststart.mp4 disguised-mp4.ogv
cp webm-vp8-vorbis.webm disguised-webm.3gp

echo "Generated video stage 0 fixtures in $script_dir"
