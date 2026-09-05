# FFmpeg 音视频播放架构

`ffmpeg-video` 与 `ffmpeg-audio` 使用共享的 `@anyfile/ffmpeg-playback`，为原生和 non-native 路径未覆盖的文件提供浏览器本地播放。运行时从锁定的 FFmpeg 官方源码构建，只负责读取和解码，不提供转码、编辑、录制、流媒体或 DRM。

## 1. 插件与支持范围

| 插件 | 当前组合 | 边界 |
|---|---|---|
| `ffmpeg-video` | AVI MPEG-4 Part 2 + MP3 或 video-only | 单 RIFF、有效 idx1、单视频、最多一条音频；FMP4/XVID/DIVX/DX50/MP4V；最多 2,073,600 像素 |
| `ffmpeg-audio` | AIFF PCM S16BE/S24BE；AIFC `fl32` PCM F32BE | 单音轨、mono/stereo、整数采样率 8–96 kHz、有效 COMM/SSND 和长度 |

两个插件的当前支持等级为 3，分别维护 manifest、probe、UI 和支持矩阵。MPEG-PS/VOB、ASF/WMV/WMA 只有底层解码证据，尚未接入产品；APE 尚无固定验证样例。OpenDML、多主轨、字幕、HDR、专业色彩、精确显示比例、gapless 与 bit-perfect 不在当前声明中。

宿主按扩展名产生候选，再按轻量 probe 的支持等级和注册顺序选择插件，同级时原生与 non-native 路径优先。`open()` 失败不自动切换插件。视频 probe 拒绝 audio-only；音频 probe 拒绝主视频节目，attached picture 不算主视频。编译包含某个 decoder 不等于产品支持该格式。

## 2. 数据路径

```text
File → 独立有界 probe → 选中的 FFmpeg 插件
                           │
                     共享播放会话（主线程）
                           │ 命令 / 交错帧事件
                     专用模块 Worker
                           │
                     项目 C adapter
                           ├── WORKERFS + 自定义 AVIO：只读随机访问
                           ├── libavformat：demux / seek
                           ├── libavcodec：视频 / 音频解码
                           ├── libswscale：I420 视频
                           └── libswresample：Float32 PCM
                           │
                     Canvas / Web Audio
```

每个播放实例拥有一个 Worker、一个 demux 游标和一个交错输出流。Worker 每次从 WASM heap 复制并转移一个输出 buffer；客户端最多保留一个未完成命令，播放层共同控制视频与音频背压。两个插件共用代码与版本化资产，各自拥有播放实例。

Mediabunny/OGV.js 保留独立播放路径。共享 FFmpeg 会话是内部 workspace 边界，不加入查看器公共协议。

## 3. 文件与会话 API

Worker 将唯一的本地 `File` 只读挂载到 `/input/media`，自定义 AVIO 按需分片读取。全部 FFmpeg URL protocols 和次级 `io_open` 均关闭；文件名不作为挂载路径，不整体复制文件到 JS/WASM，也不生成临时转码文件。

| 操作 | 行为 |
|---|---|
| `open(file, mode)` | 复验主节目、打开唯一主轨组合并返回媒体信息 |
| `next()` | 返回一个视频帧、PCM buffer 或 EOF；EOF 时 drain 两路 decoder |
| `seek(time)` | 定位并重置 decoder、resampler、packet/frame、EOF 和时间戳状态 |
| `close()` | 释放 C 会话与文件挂载 |
| abort / dispose / watchdog | 主线程直接 terminate Worker，拒绝未完成请求并清理回调 |

同步 WASM 执行期间无法处理取消消息，硬取消由 Worker terminate 完成。错误区分损坏或不支持的文件、资源超限、环境初始化失败和标准 `AbortError`；所有失败路径均可清理。

MPEG-PS 的 PES 时间戳索引不保证关键帧。其 seek 在 1/2/4/8/16 秒的有限回看窗口内试解码，确认有不晚于目标的有效画面后重新定位，再输出完整交错流。每轨首个有效输出之前允许最多 512 个 packet 的重同步；全部尝试共享同一命令预算。该机制仅有底层测试证据，未扩大产品支持范围。

## 4. 播放与生命周期

`open()` 真实解码首帧及应有首 PCM 后返回，不创建 AudioContext、不发声。用户播放手势后创建 Web Audio 时钟，视频和 PCM 按同一时钟调度；video-only 使用 performance 时钟。

- 视频输出为 8-bit I420，通过可转移 buffer 创建 `VideoFrame` 并绘制 Canvas。
- 音频输出为 Float32 PCM，保留源采样率和 mono/stereo 布局；拒绝中途布局、采样率或 sample format 变化。
- 暂停停止已排音频 source 并保留播放位置；音量由 GainNode 控制。
- seek 合并到最新目标，串行完成旧命令与定位，以 generation 丢弃过期结果，跳过目标前视频并裁剪跨目标 PCM。
- EOF drain 完成后进入结束状态，重播通过 seek 回到起点。
- abort、切换和重复 dispose 统一释放 Worker、AudioContext、source、帧、监听和 DOM。

## 5. 资源边界

| 资源 | 上限 |
|---|---:|
| 轻量 probe | 512 KiB / 4,096 次定点读取 |
| WASM heap | 初始 32 MiB，最大 256 MiB |
| 单 FFmpeg allocation | 64 MiB |
| 视频像素 | 2,073,600 |
| 音频 | 1–2 声道，8–96 kHz |
| 单 PCM frame | 每声道 65,536 samples |
| packet / 单输出 buffer | 16 MiB |
| demux 轨道 / 索引 | 8 条 / 4 MiB |
| 单命令读取 / 工作步 | 32 MiB / 8,192 |
| C 协作期限 / 主线程 watchdog | 10 秒 / 15 秒；初始化 watchdog 10 秒 |
| 视频队列 | 16 帧且不超过 32 MiB |
| PCM 队列 | 64 source 且不超过 8 MiB，通常预排 0.5 秒 |

Worker 提供响应性和强制释放边界；输入结构、偏移、分配与输出仍需独立校验。WASM heap 上限不等于浏览器进程峰值内存。

## 6. 构建与资产分发

版本为 FFmpeg **9.0.1**、Emscripten **4.0.10**，产物版本 **9.0.1-anyfile.1**。源码 SHA-256、容器 digest、配置和产物哈希由构建材料锁定。上游源码未修改，项目维护窄 C adapter；宽 decode-only 构建禁用 programs、encoders、muxers、filters、devices、network、URL protocols、线程、GPL/nonfree 组件和外部库自动探测。

```text
tools/ffmpeg-playback-build/                  构建配方、adapter、样例与测试
third_party/ffmpeg-playback/9.0.1-anyfile.1/   审核产物、源码、许可证与重链接材料
public/vendor/ffmpeg-playback/9.0.1-anyfile.1/ prepare 生成的同源资产
```

`pnpm prepare:ffmpeg` 校验版本、文件清单和 SHA-256 后复制审核产物。普通 dev/build 不下载源码、不编译 FFmpeg。WASM 为 11,808,469 bytes，gzip 4,699,547 bytes，prepare 门禁为 5 MiB gzip。

Worker 从同源版本路径创建；glue/WASM 按 `https://assets.anyfile.top/vendor/ffmpeg-playback/9.0.1-anyfile.1/` → 同源顺序初始化。仅获取或初始化失败时销毁实例并尝试下一来源，文件打开后的错误不触发回退。运行时只随选中的完整插件加载，不进入首包、manifest、probe 或无关插件。

R2 bucket 为 `anyfile-bucket`，同版本目录包含运行资产、build info、配置、许可证、精确上游源码和重链接材料。版本路径不可覆盖；发布须校验公共 URL 的 SHA-256、MIME、CORS、CORP、immutable 缓存和真实 GET 缓存命中。部署约束见[加载与部署约定](../viewer-loading-and-deployment.md)。

## 7. 验证与扩展

当前产品证据来自 Chromium 145.0.7632.6 / Darwin 24.6.0 arm64，覆盖连续画面、实际音频、暂停、音量、seek、结束重播与资源释放，见[播放验证](ffmpeg-playback-delivery.md)。底层解码、随机读取与构建测量见[运行时测量](ffmpeg-runtime-spike-evidence.md)。Safari、Firefox、移动端、长时间播放 CPU/进程峰值内存和最终源码的两次全量重建一致性仍待验证。

后续按[视频路线图](roadmap.md)和[音频路线图](../audio/roadmap.md)增加组合。每个组合必须同时具备固定样例、有界 probe、真实播放与生命周期验证，再更新 manifest 和支持矩阵；专业视频及音频体验增强分别属于阶段 4。
