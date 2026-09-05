# FFmpeg 运行时测量

测量日期：2026-09-05。本文只记录底层解码、I/O 与构建测量；架构见[FFmpeg 音视频播放架构](ffmpeg-playback-runtime-plan.md)，产品播放证据见[播放验证](ffmpeg-playback-delivery.md)。

原始结果：[Chromium 测量](../../tools/ffmpeg-playback-build/evidence/chromium.json)、[构建信息](../../tools/ffmpeg-playback-build/evidence/build-info.json)、[configure 输出](../../tools/ffmpeg-playback-build/evidence/configure.txt)。

## 1. 解码与 I/O

环境：Chromium 145.0.7632.6（Playwright headless），macOS Darwin 24.6.0 arm64，Apple M3 Pro。Worker/glue/WASM 经本地 HTTP 加载，启用 COOP/COEP/CORP；CSP 允许 `wasm-unsafe-eval`，不允许 `unsafe-eval`。

固定样例是项目自产的 testsrc2 视频、440 Hz 正弦波、静音和合成封面，不含第三方媒体内容。[生成脚本及 SHA-256](../../tools/ffmpeg-playback-build/examples/README.md)可复核。

### 连续解码与 seek

以下 13 个样例全部通过完整解码、EOF、前后 seek 后恢复与持续解码；视频输出被真实 VideoFrame/Canvas 接受，音频检查 PCM 布局、有限数值与预期非静音/静音。

| 样例 | 连续视频帧 | PCM buffers | 完整 4 秒样例处理耗时 |
|---|---:|---:|---:|
| AVI MPEG-4 Part 2 + MP3 | 100 | 168 | 54.6 ms |
| VOB MPEG-2 + AC-3 | 100 | 125 | 48.8 ms |
| MPEG-PS MPEG-2 + MP2 | 100 | 167 | 44.6 ms |
| ASF WMV2 + WMA2 | 100 | 93 | 39.7 ms |
| AVI MPEG-4 video-only | 100 | 0 | 30.4 ms |
| AIFF S16BE stereo | 0 | 188 | 13.1 ms |
| AIFF S24BE mono | 0 | 141 | 9.2 ms |
| AIFC F32BE stereo | 0 | 375 | 21.6 ms |
| ASF audio-only WMA1 | 0 | 93 | 11.8 ms |
| ASF audio-only WMA2 | 0 | 93 | 11.9 ms |
| AVI 1080p MPEG-4 + MP3 | 100 | 168 | 532.6 ms |
| AIFF 合法静音 | 0 | 188 | 12.6 ms |
| MP3 + attached JPEG（分流反例） | 0 | 168 | 9.3 ms |

耗时包含 Worker 往返、输出复制/转移、视频 Canvas 接收或 PCM 数值检查，不是纯 C 解码计时。1080p 短样例约 188 帧/秒；不能据此承诺所有实际内容或所有设备实时播放。本地 HTTP 初始化约 34–46 ms，不能作为生产公网冷启动数据。MPEG-PS seek 的最大观测恢复时间约 17.6 ms，1080p AVI 约 39.7 ms。

### 反例、I/O 与取消

8 个拒绝用例全部返回预期类别：多主音轨、超过像素上限、未知 FourCC、非有限 Float32 PCM、损坏头、截断头、audio-only 交给 video 模式、主视频交给 audio 模式。

合法静音不会被当成损坏；attached picture 不被选为主视频。所有运行样例观测到的 WASM heap 为 32 MiB，构建硬上限为 256 MiB；这不等于浏览器进程峰值内存。

测试临时创建稀疏文件，通过 File 输入读取 **4,294,967,313** 偏移处的已知字节，再反向 seek 读首字节，两者正确。该测试验证同一 libc/WORKERFS 文件路径的 64-bit 偏移，不代表已完成一个 >4 GiB 真实媒体容器的全流程验收。

opening abort 与 active pending-decode abort 的主线程 promise 拒绝观测时间分别约 0.18 ms、0.10 ms；不是浏览器释放进程内存的测量。另有 6 个客户端单元测试覆盖命令背压、过期响应、seek generation、预先取消、错误分类和 watchdog。

## 2. 体积与构建

| 资产 | raw bytes | gzip bytes |
|---|---:|---:|
| WASM | 11,808,469 | 4,699,547 |
| glue | 68,764 | 19,203 |
| Worker | 2,925 | 1,265 |
| 合计 | 11,880,158 | 4,720,015 |

宽 decoder 版本的运行资产合计 gzip 约 **4.50 MiB**，超过项目单资源 2 MiB / 冷启动 4 MiB 的外部分发门槛。产品采用 R2 → 同源分发。各 demuxer/decoder 的独立体积增量尚未测量。

同一配置保留的静态 libraries 对最终 adapter 再次独立链接，JS/WASM/Worker 三个 SHA-256 完全一致。这里证明的是**重复链接一致性**；两次完整构建使用了不同阶段的 adapter，尚未完成同一最终源码的两次全量重建比较。

`relink/` 保留精确上游源码归档、生成头文件与静态 libraries，便于实验复链；重链前检查这些输入的哈希、上游锁和配置配方。构建信息记录 Git 基线、工作区 dirty 状态与实际 adapter 源码哈希。

