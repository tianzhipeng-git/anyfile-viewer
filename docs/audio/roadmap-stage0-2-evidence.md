# 音频路线图阶段 0–2 证据

- 记录日期：2026-08-30
- 当前实现：`browser-audio`、`non-native-audio`
- 当前真实环境：Codex in-app Chromium，macOS 15.6.1 build 24G90，Apple Silicon；本机可用 Chrome 151.0.7922.174、Safari 18.6，但本轮未把它们写成已验证环境

## 1. 固定语料

语料位于：

- `viewer/plugins/browser-audio/examples/`
- `viewer/plugins/non-native-audio/examples/`

两个目录都有 `generate.sh`、反例生成脚本和 `manifest.sha256`。正常文件均由 FFmpeg 8.0 从 997 Hz 合成音生成，不包含第三方录音。覆盖 MP3 CBR/Xing VBR、ID3/APIC、WAVE S16LE/S24LE/F32LE、WAVE ADPCM 对照、M4A AAC-LC/ALAC 对照、Ogg Vorbis/Opus/Theora 对照、WebM Opus/视频对照、FLAC 16/24-bit/picture、ADTS AAC-LC/profile 对照、AIFF、WMA，以及 `.mka` Opus/Vorbis/FLAC/AAC、WAVE A-law / μ-law 和 video/corrupt/truncated/ADPCM 对照。

当前 FFmpeg 构建没有 Monkey's Audio encoder，也没有可用的 HE-AAC / AAC Main 编码器；APE 与 HE-AAC 样例保持阻塞，不能用来源或许可不明的下载文件填充，也没有进入任何 manifest 或支持声明。VBRI 和 mono 组合同样没有被当前组合级矩阵宣称为已验证。

## 2. Probe 测量与资源门禁

运行：

```bash
pnpm measure:audio-probes
```

当前固定正常样例测得：ADTS 需要 14 bytes；MP3 首帧证据为 48–80 bytes；WAVE `data` 证据为 78–102 bytes；faststart M4A 的完整 `moov` 为 1,358 bytes；FLAC metadata 为约 8.3 KiB；Ogg 尾页证据最大约 3.1 KiB；WebM/Matroska 的 Tracks/Cues 位于前 116 bytes 内。

实现预算没有直接等于最小值，而是给受限标签和索引保留余量：

| 门禁 | 上限 |
|---|---:|
| browser-audio 通用容器 probe head / tail | 256 KiB / 64 KiB |
| non-native-audio probe head / tail | 256 KiB / 64 KiB |
| MP3 ID3/APIC | 读取 10-byte ID3 header，按校验后的 synchsafe size 跳到音频帧，帧读取不超过 4 KiB |
| native FLAC metadata | 读取 4-byte signature、每个 4-byte block header 与 34-byte STREAMINFO；其他 block 正文按校验后的长度跳过，最多 128 blocks |
| MP3 首帧扫描 | 16 offsets |
| WAVE/FLAC chunk 或 block | 128 |
| Matroska tracks | probe 32；open 16 |
| sample rate / channels | 192 kHz / 2 |
| duration | 24 h |
| Blob cache | 8 MiB |
| 单 PCM buffer | 2 s / 8 MiB |
| PCM lookahead | 1 s |

格式正确的大型 ID3/APIC 与 FLAC metadata 不再按正文大小拒绝，probe 的实际读取量不随封面正文增长；越界长度、截断、损坏、伪装、主视频、多主轨和不支持 codec/profile 映射为 `invalid-file`，环境缺少 WebCodecs/Web Audio 映射为 `unsupported-environment`。

## 3. Chromium 真实播放证据

通过本地生产构建 `/view` 打开固定样例：

- 阶段 1 的 15 个正常样例（含 ID3/APIC、FLAC picture 与 WebM Vorbis）均取得真实可播放数据和有限 duration；基础 12 组合进一步记录到 `readyState = 4`、`muted = false`、`volume = 1`，用户手势后 `currentTime` 连续推进；MP3 的暂停后位置稳定、Home/End seek 和重播通过。
- 阶段 2 的 `.mka` Opus、Vorbis、FLAC、AAC 与 WAVE A-law / μ-law 均完成首 buffer 解码路径与单元测试覆盖；`.mka` 组合此前已在 Chromium 完成连续输出、seek、结束和重播。WAVE A-law / μ-law 依赖 Mediabunny 软件 PCM（`AudioDecoder` 类存在即可），真实浏览器听音补证仍按支持矩阵 `implemented` 口径处理。
- 420 × 260 viewport 中播放、seek 和音量均可见。真实检查发现音量曾被响应式 CSS 隐藏，改为紧凑四列布局后复测通过。
- 连续文件切换、opening/active abort、重复 dispose、source/iterator/Input/AudioContext 清理由单元测试覆盖。
- 阶段 2 扩展调研确认：Ogg FLAC、ALAC、WAVE ADPCM、HE-AAC/ADTS Main 不能在当前 Mediabunny + 锁定 FFmpeg 证据下进入支持声明，已回写支持矩阵为 `blocked` / `planned`。

## 4. 加载与回归证据

- `pnpm test`：通过；新增 browser-audio 31 项、non-native-audio 11 项测试。
- `pnpm lint`：通过。
- `pnpm build`：通过；`/view` 初始 JavaScript 207.3 KiB gzip，低于 225 KiB 门禁。
- bundle 门禁确认 audio manifest、probe、完整播放器分离；Mediabunny 不进入 `/view` 首包、browser-audio 或任一 audio probe chunk。

## 5. 尚未写成 verified 的环境

`implemented` 表示组合和端到端播放路径已经交付，不等于目标浏览器矩阵全部完成。Edge、Firefox、Safari 的完整版本/OS/硬件实机播放和听音证据尚未取得，因此支持矩阵没有使用 `verified`。补证时必须记录完整版本并重复真实输出、pause、volume、前后/连续 seek、结束、重播和生命周期检查。
