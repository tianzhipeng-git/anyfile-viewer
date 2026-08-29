# 视频阶段 0/1 固定样例

这些文件用于 `browser-video` 插件的 probe、浏览器播放和生命周期验收；支持范围仍以组合级证据为准，不能由扩展名或样例存在性推导。

## 来源与再分发

所有正常样例都由本插件目录中的 [`generate.sh`](generate.sh) 使用 FFmpeg 的 `testsrc2` 合成画面和 `sine` 合成音频生成，不包含第三方媒体、人物、商标、字幕或外部 metadata。损坏、截断和伪装样例也由同一脚本从这些合成文件确定性派生，因此可以随本项目测试资产再分发。

当前提交使用 FFmpeg 8.0 生成。重新生成需要 FFmpeg 提供 `libx264`、`libx265`、`libvpx`、`libsvtav1`、`libtheora`、`libvorbis` 和 `libopus` encoder：

```bash
viewer/plugins/browser-video/examples/generate.sh
node scripts/measure-video-probes.mjs
```

编码器升级可能改变二进制字节和文件大小；更新已提交样例时必须重新运行真实浏览器 smoke，并同步阶段 0 证据。

## 正常与对照样例

| 文件 | 容器/组织 | 视频 | 音频 | 尺寸/时长 | 阶段 0 期望 |
|---|---|---|---|---|---|
| `mp4-avc-aac-faststart.mp4` | MP4，头部 `moov` | `avc1`，H.264 Constrained Baseline L3.0，8-bit 4:2:0 | AAC-LC，48 kHz，双声道 | 320×180 / 2.000 s | 首批主基线 |
| `mp4-avc-aac-tail-moov.mp4` | MP4，尾部 `moov` | 同上 | 同上 | 320×180 / 2.000 s | 尾部分片 probe 与 seek 对照 |
| `mp4-avc-video-only.mp4` | MP4，头部 `moov` | 同上 | 无 | 320×180 / 2.000 s | 有效 video-only |
| `mp4-aac-audio-only.mp4` | MP4，头部 `moov` | 无 | AAC-LC，48 kHz，双声道 | 2.000 s | 视频 probe 必须返回 0 |
| `webm-vp8-vorbis.webm` | WebM | VP8 profile 0，8-bit 4:2:0 | Vorbis，48 kHz，单声道 | 320×180 / 2.003 s | 首批主基线 |
| `webm-vp9-opus.webm` | WebM | VP9 profile 0，8-bit 4:2:0 | Opus，48 kHz，单声道 | 320×180 / 2.008 s | 首批主基线 |
| `webm-vp9-video-only.webm` | WebM | VP9 profile 0，8-bit 4:2:0 | 无 | 320×180 / 2.000 s | 有效 video-only |
| `webm-opus-audio-only.webm` | WebM | 无 | Opus，48 kHz，单声道 | 2.008 s | 视频 probe 必须返回 0 |
| `mp4-hevc-aac.mp4` | MP4，`hvc1`，头部 `moov` | HEVC Main，8-bit 4:2:0 | AAC-LC，48 kHz，双声道 | 320×180 / 2.000 s | 环境能力候选 |
| `mp4-av1-aac.mp4` | MP4，`av01`，头部 `moov` | AV1 Main，8-bit 4:2:0 | AAC-LC，48 kHz，双声道 | 320×180 / 2.000 s | 环境能力候选 |
| `mov-avc-aac.mov` | QuickTime，尾部 `moov` | `avc1`，H.264 Constrained Baseline L3.0 | AAC-LC，48 kHz，双声道 | 320×180 / 2.000 s | 环境能力候选 |
| `ogv-theora-vorbis.ogv` | Ogg | Theora，8-bit 4:2:0 | Vorbis，48 kHz，单声道 | 320×180 / 2.000 s | 环境能力候选 |
| `3gp-avc-aac.3gp` | 3GPP，尾部 `moov` | `avc1`，H.264 Constrained Baseline L1.3 | AAC-LC，48 kHz，单声道 | 176×144 / 2.000 s | 环境能力候选 |

精确生成参数以脚本为准；表中参数由 FFprobe 8.0 对已提交文件复核。

## 负向样例

每个已纳入阶段 0 的容器族都有以下三类对照：

- `corrupt.<ext>`：只保留损坏的家族签名，必须识别为无效文件；
- `truncated.<ext>`：正常文件的前 160 字节，必须识别为截断文件；
- `disguised-<actual>.<ext>`：内容属于另一容器族但使用候选扩展名，未来视频 probe 必须返回 0。

覆盖扩展为 `.mp4`、`.webm`、`.mov`、`.ogv` 和 `.3gp`。浏览器自身可能嗅探并播放伪装文件，这正是 probe 不能依赖扩展名或原生媒体元素嗅探结果的原因。
