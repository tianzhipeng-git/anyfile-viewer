#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ffmpeg -version > generator-version.txt
video=(-f lavfi -i testsrc2=size=320x240:rate=25:duration=4)
audio=(-f lavfi -i sine=frequency=440:sample_rate=48000:duration=4)
common=(-y -hide_banner -loglevel error -threads 1 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact)
ffmpeg "${video[@]}" "${audio[@]}" "${common[@]}" -c:v mpeg4 -bf 2 -g 25 -c:a libmp3lame -ac 2 avi-mpeg4-mp3.avi
ffmpeg "${video[@]}" "${audio[@]}" "${common[@]}" -c:v mpeg2video -bf 2 -g 25 -c:a ac3 -ac 2 -f vob ps-mpeg2-ac3.vob
ffmpeg "${video[@]}" "${audio[@]}" "${common[@]}" -c:v mpeg2video -bf 2 -g 25 -c:a mp2 -ac 2 -f mpeg ps-mpeg2-mp2.mpg
ffmpeg "${video[@]}" "${audio[@]}" "${common[@]}" -c:v wmv2 -c:a wmav2 -ac 2 asf-wmv2-wma2.wmv
ffmpeg "${video[@]}" "${common[@]}" -c:v mpeg4 -bf 2 -g 25 avi-video-only.avi
ffmpeg "${audio[@]}" "${common[@]}" -c:a pcm_s16be -ac 2 aiff-s16.aiff
ffmpeg "${audio[@]}" "${common[@]}" -c:a pcm_s24be -ac 1 aiff-s24.aiff
ffmpeg "${audio[@]}" "${common[@]}" -c:a pcm_f32be -ac 2 aifc-f32.aifc
ffmpeg "${audio[@]}" "${common[@]}" -c:a wmav1 -ac 2 asf-wma1.wma
ffmpeg "${audio[@]}" "${common[@]}" -c:a wmav2 -ac 2 asf-wma2.wma
ffmpeg "${audio[@]}" "${common[@]}" -map 0:a -map 0:a -c:a wmav2 asf-multiple-audio.wma
ffmpeg -f lavfi -i testsrc2=size=2048x1152:rate=1:duration=1 "${common[@]}" -c:v mpeg4 oversized.avi
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=25:duration=4 "${audio[@]}" "${common[@]}" -c:v mpeg4 -bf 2 -g 25 -c:a libmp3lame -ac 2 avi-1080p.avi
ffmpeg -f lavfi -i anullsrc=sample_rate=48000:channel_layout=stereo -t 4 "${common[@]}" -c:a pcm_s16be aiff-silence.aiff
cover=$(mktemp -d)
trap 'rm -rf "$cover"' EXIT
ffmpeg -f lavfi -i color=c=blue:size=32x32:duration=1 "${common[@]}" -frames:v 1 -update 1 "$cover/cover.jpg"
ffmpeg "${audio[@]}" -i "$cover/cover.jpg" "${common[@]}" -map 0:a -map 1:v -c:a libmp3lame -c:v copy -disposition:v attached_pic mp3-cover.mp3
node --input-type=module <<'JS' 
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await writeFile('corrupt.avi', new Uint8Array(128));
await writeFile('truncated.avi', (await readFile('avi-mpeg4-mp3.avi')).subarray(0, 64));
const unknown = Buffer.from(await readFile('avi-mpeg4-mp3.avi'));
const strh = unknown.indexOf(Buffer.from('strh'));
const strf = unknown.indexOf(Buffer.from('strf'));
unknown.write('ZZZZ', strh + 12); unknown.write('ZZZZ', strf + 24);
await writeFile('unknown-codec.avi', unknown);
const nan = Buffer.from(await readFile('aifc-f32.aifc'));
const ssnd = nan.indexOf(Buffer.from('SSND'));
nan.writeUInt32BE(0x7fc00000, ssnd + 16);
await writeFile('nonfinite-pcm.aifc', nan);
const files = (await readdir('.')).filter(n => /\.(avi|vob|mpg|wmv|wma|aiff|aifc|mp3)$/.test(n)).sort();
await writeFile('manifest.sha256', (await Promise.all(files.map(async n => `${createHash('sha256').update(await readFile(n)).digest('hex')}  ${n}`))).join('\n') + '\n');
JS
