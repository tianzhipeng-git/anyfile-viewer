# INSV 双轨 HEVC 软件播放

## 范围与路径

现代 Insta360 INSV 仍先使用 Mediabunny/WebCodecs。原生首帧失败并报告环境不支持时，由 Insta360 插件动态加载共享 FFmpeg client，显式请求 `openPanorama(file)`。普通 AVI/AIFF 模式的主轨数量、1080p 像素限制与播放会话不变。

全景模式严格要求两条 3840×3840 HEVC 8-bit 4:2:0 BT.709 视频和一条 AAC 音频。单 Worker 内三套 decoder 共用只读 WORKERFS/AVIO 和 demux 游标。输入不上传、不整体复制、不生成转码文件。逐文件镜头标定仍由 Insta360 probe 读取并交给现有 WebGL 渲染器。

HEVC 在原分辨率解码；libswscale 以 BT.709 limited-range I420 输出每路 1920×1920，主线程 VideoFrame 显式标注同一色彩空间。显示降采样减少消息传输和纹理开销，不能减少 HEVC 参考帧解码成本。

两路视频事件带 `lens: 0 | 1`，音频输出保持源采样率/声道。全景会话以音频时钟显示两路帧，只在两镜头和音频都已解码的时间范围内前进。约 500 ms 数据可用后播放；数据不足时停止音频 source、冻结媒体位置，补齐后从该位置恢复，避免画面落后而声音持续推进。

支持播放/暂停、音量、合并快速 seek、结束重播、拖动全景和缩放。软件模式明确显示预览分辨率及性能提示。Worker/Web Audio/VideoFrame 等所需环境不可用时可回退内嵌静态全景；文件损坏或资源超限不伪装成静态播放成功。

## 资源约束

- WASM：32 MiB 初始、512 MiB 硬上限；单 allocation 64 MiB，单 packet/output 16 MiB。
- 显示帧：每镜头 1920² I420，约 5.27 MiB；队列总计 256 MiB，每轨最多 128 个事件。另持有最后显示的一对帧和有限 Web Audio 输出。
- 读取、命令步数、解码期限、Worker watchdog 沿用共享 runtime 限制。
- seek 串行处理并丢弃旧 generation；取消直接终止 Worker，清理音频、帧、事件和动画。
- 当前源构建产物版本 `9.0.1-anyfile.4`；上游 FFmpeg 和锁定工具链不变，更新 C adapter/Worker/link recipe 和完整源码重链接材料。旧发布路径不可覆盖。

## 2026-09-08 实测

样例为用户本地 X4 `VID_20240415_213145_00_035.insv`：1,183,762,666 字节；两轨 HEVC Main，3840²、30000/1001 fps；AAC-LC 48 kHz stereo；容器时长 43.977 秒。素材未纳入仓库或上传。

Chromium 145.0.7632.6 / macOS arm64，无头渲染使用 SwiftShader。测试显式禁用 VideoDecoder 并阻断资产镜像，验证软件解码与同源资产回退。

初次底层测量：打开约 58 ms；解码 12 组双镜头帧及 17 个音频 buffer 用时约 4.32 秒，约 **2.8 组双镜头帧/秒**；WASM heap 311,230,464 字节（约 297 MiB），读取约 15.7 MB。此 heap 测量不是浏览器进程峰值内存。

**这是一条可用但不保证实时的软件回退路径。** 该原片在测试设备上会频繁缓冲，不能宣称流畅 30 fps 或全分辨率播放。硬件解码可用时仍走原有全分辨率路径。多线程/SIMD、移动端和其他浏览器的性能另行验证，不以提高资源上限代替性能优化。

最终页面首帧约 2.02 秒；真实音频 analyser 有非零输出；快速前后 seek、窄窗口、片尾与重播、切换释放均通过，控制台无运行错误。结构化记录见 [INSV 页面证据](evidence/insv-ffmpeg-browser.json) 与 [普通音视频回归](evidence/ffmpeg-playback-browser-v2.json)。

## 验证入口

```sh
node scripts/measure-insv-runtime.mjs /path/to/runtime /path/to/sample.insv
INSV_TEST_URL=http://localhost:3000 node scripts/verify-insv-browser.mjs /path/to/sample.insv
node tools/ffmpeg-playback-build/smoke-test.mjs /path/to/runtime
pnpm exec vitest run --config viewer/plugins/insta360/vitest.config.ts viewer/plugins/insta360 viewer/ffmpeg-playback
```

浏览器检查包括：静默打开两路真实首帧、连续变化的成对画面、音频输出、暂停、快速前后定位、接近片尾到 EOF、重播、窄窗口和文件切换清理。脚本将验收报告与截图写入系统临时目录；截图可能包含用户素材，不作为公共测试资产提交。

普通 runtime 回归覆盖 AVI、MPEG-PS、ASF、AIFF/AIFC 等现有固定样例、损坏/多轨/超限拒绝、取消及超过 4 GiB 的分段读取。构建门禁确保运行时代码不进入 manifest、probe、查看页首包或无关插件。

新资产尚未发布到公共镜像，当前可使用同源准备产物；发布时必须部署完整 `9.0.1-anyfile.4` 目录并校验哈希、CORS/CORP、MIME 与不可变缓存。

## 同日补充：简单 SIMD 优化

`9.0.1-anyfile.3` 仅在编译和链接选项加入 `-msimd128`，启用 C 编译器自动向量化。播放、缓冲和单线程结构保持原实现，需要支持 WASM SIMD 的环境。

遵照用户要求，没有操作浏览器。用 Node 24.4.0 直接运行生产 WASM，通过只读分段适配器提供 WORKERFS 的 FileReaderSync；对同一 X4 文件交替测量旧版/新版各三轮，每轮解码 30 组双镜头帧。中位纯解码耗时从 10,759.68 ms 降到 9,737.77 ms，吞吐量提高约 **10.5%**（耗时减少约 9.5%）。两路 I420 和 Float32 PCM 哈希完全一致。压缩 WASM 从约 4.70 MB 增至 4.96 MB，仍在 5 MiB 门禁以内。

这项小幅提速值得保留，但不足以解决实时播放缺口；没有把终端测量写成浏览器端实测。完整记录见 [SIMD 三轮对比](evidence/ffmpeg-simd-comparison.json)。

终端回归还覆盖 13 个原有音视频样例，每个样例比较从头读取及 seek 后读取到 EOF，共 26 组；新旧版本的输出、时间戳与帧数全部一致，见 [SIMD 回归记录](evidence/ffmpeg-simd-regression.json)。

## 同日补充：帧解码线程与较长缓冲

`9.0.1-anyfile.4` 保留 SIMD，启用 pthreads。每个 HEVC 镜头使用 2 个帧线程，固定预加载 4 个 Worker；音频与普通 AVI/AIFF 解码仍指定单线程。原片 PPS 为 `tiles_enabled_flag=1`、`entropy_coding_sync_enabled_flag=0`；FFmpeg 的 HEVC 行并行入口要求单 tile，因此没有采用对这个文件无效的 slice/WPP 线程配置。

三轮交替终端测试中，解码 30 对镜头帧的中位耗时从单线程 SIMD 版的 **9.799 秒降至 3.604 秒**，吞吐量约 **2.72 倍**，约 **8.32 对/秒**。CPU 时间/墙钟时间约 2.82，确认实际并行；这仍低于原片约 30 fps，不保证实时。两镜头和音频各取前 30 个输出比较，哈希一致。帧线程增加输出延迟，会改变视频与音频事件的交错顺序，不能直接比较停止时所有 PCM 事件的总哈希。详见 [线程对比记录](evidence/ffmpeg-thread-comparison.json)。

WASM 观察到的 heap 为 355,991,552 字节（约 340 MiB），硬上限仍为 512 MiB。产物 gzip 为 4,987,170 字节，继续满足 5 MiB 门禁。模块 glue 兼作 pthread 入口，固定同源；只有 WASM 按镜像→同源回退。运行要求 SharedArrayBuffer 与跨源隔离。

播放及欠载恢复的缓冲目标从 0.1 秒提高到 **0.5 秒**，预取目标从 0.2 秒提高到 **0.7 秒**。1920² 双镜头原始帧每秒约占 316 MiB，故显示队列上限配套从 96 MiB 提高到 **256 MiB**，保持每轨 128 个事件上限。打开静默预览和暂停定位仍只预读 0.1 秒；短于目标的 EOF 尾段照常播放。较长缓冲减少启停频率，同时增加启动/恢复等待时间，不能弥补持续的解码吞吐缺口。

本次遵照用户要求只做终端验证，没有操作浏览器。Node Worker 使用生产 WASM 和实际 pthread 池；WORKERFS 通过只读分段适配器访问本地文件。关闭 decoder 后断言线程已全部 join，再终止池。播放器单测覆盖 0.5 秒启动/恢复门槛、短片尾和取消。浏览器播放流畅度及新线程加载/硬取消仍需手工验收。

终端回归覆盖原有 13 个音视频样例从头和 seek 后读到 EOF（26 组），另比较原片 seek 1 秒后的输出与 seek 40 秒至片尾的完整输出/时间戳，并确认 6 个损坏、超限或不支持样例保持原错误类别。全部通过，见 [线程回归记录](evidence/ffmpeg-thread-regression.json)。相关 66 项单测、lint、生产构建及资产/分包门禁通过。
