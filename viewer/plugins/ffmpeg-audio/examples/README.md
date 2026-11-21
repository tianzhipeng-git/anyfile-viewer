# 样例

| 文件 | 内容 | 用途 |
|---|---|---|
| `tone-aiff-s16.aiff` | 1 s 440 Hz 正弦波，48 kHz 双声道，`pcm_s16be` | AIFF 正常样例 |
| `tone-wma1.wma` | 2 s 440 Hz 正弦波，48 kHz 双声道，WMA v1 | ASF audio-only 正常样例 |
| `tone-wma2.wma` | 2 s 440 Hz 正弦波，48 kHz 双声道，WMA v2 | ASF audio-only 正常样例 |
| `asf-video-disguised.wma` | 1 s 320×240 WMV2 视频 + WMA2 音频，扩展名为 `.wma` | 反例：ASF 内含主视频节目，必须拒绝 |

全部文件由 FFmpeg 9.0.2 从 lavfi 合成源生成，不含第三方素材与许可证约束。重新生成：

```sh
cd viewer/plugins/ffmpeg-audio/examples
common=(-y -hide_banner -loglevel error -threads 1 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact)
audio=(-f lavfi -i sine=frequency=440:sample_rate=48000:duration=2)
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000:duration=1 "${common[@]}" -c:a pcm_s16be -ac 2 tone-aiff-s16.aiff
ffmpeg "${audio[@]}" "${common[@]}" -c:a wmav1 -ac 2 tone-wma1.wma
ffmpeg "${audio[@]}" "${common[@]}" -c:a wmav2 -ac 2 tone-wma2.wma
ffmpeg -f lavfi -i testsrc2=size=320x240:rate=25:duration=1 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=1 "${common[@]}" -c:v wmv2 -c:a wmav2 -ac 2 asf-video-disguised.wma
```
