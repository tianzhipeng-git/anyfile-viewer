# 视频查看实施路线图

- 状态：阶段 0、阶段 1 与阶段 2 首批 Matroska 实现已于 2026-08-30 完成基准环境验收；其他浏览器按支持矩阵逐环境持续验收
- 范围：浏览器本地打开的视频文件；包含文件内音频和字幕轨道，不包含独立音频文件
- 产品结果：播放主要节目，不交付只能检查 metadata、轨道结构、封面或首帧的视频插件
- 核心目标：在满足播放与资源安全底线后，优先扩大可播放的容器 × 视频 codec × 音频 codec 组合

## 1. 排序与验收方法

组合优先级依次评价：

1. 用户遇到频率和无需转码直接播放的价值；
2. 目标环境能否原生播放，或能否以可接受成本补齐非原生播放；
3. 能否获得可再分发、能够证明编码参数的真实样例；
4. 能否连续播放画面与文件应有的主音频，并完成基础 seek；
5. 大文件、畸形索引、解码缓冲、取消和资源释放是否可控；
6. demuxer、decoder、Worker/WASM 的维护、体积、许可和部署成本；
7. rotation、多轨、字幕、色彩、HDR 等增强能力的用户价值。

路线图以实际可播放组合数衡量覆盖，不以 manifest 中的扩展名数量衡量。支持等级继续遵守全项目协议，但等级 3 已经可以成为视频组合的有效交付；不要求先把已有组合从等级 3 提升到等级 4，才开始下一个格式。

每个组合不可放松的播放底线是：

- 主要节目能够连续播放，而不是只显示 metadata、封面或首帧；
- 文件存在预期主音频时，不能静默丢失该音频；
- 可以完成基础 seek，或明确证明该组合本身不适用；
- 损坏、codec 不可用和环境不支持时给出准确错误；
- opening abort、active abort、切换和重复 dispose 后停止播放并释放资源；
- 实现不上传文件，也不把重型 parser、decoder、Worker 或 WASM 放进首包。

rotation、pixel aspect ratio、多轨切换、字幕、章节、准确逐帧 seek、色彩和 HDR 等不默认进入上述底线。缺失有实际影响时降低到等级 3 并记录限制，后续按需求增强。

## 2. 阶段 0：建立最小可验收基线

### 实施结果（2026-08-29）

- 已提交 13 个参数明确的正常/对照样例，以及 MP4、WebM、QuickTime、Ogg、3GPP 各自的损坏、截断和伪装样例；MP4/WebM 同时覆盖 video-only 与 audio-only；
- 已建立可重复的 FFmpeg 生成脚本、FFprobe 参数记录和 probe 测量脚本；
- 已确定 256 KiB 头部 + 256 KiB 尾部、总计 512 KiB 的初始 probe 读取预算，以及深度 12、轨道 32、访问项 4,096 的结构边界；
- 已用真实 Chromium 151 验证 metadata、首帧、连续播放、基础 seek、错误和 Object URL/媒体清理顺序；
- 已记录持续验收环境、未测试环境和首包/插件 chunk 门禁。完整证据见[阶段 0 验收证据](stage-0-evidence.md)。

### 工作

- 明确只处理本地视频文件，排除独立音频、流媒体、DRM、编辑和转码；
- 确定需要持续验收的浏览器、操作系统和版本记录方式；
- 建立容器 × 视频 codec × 音频 codec 的组合清单，避免用扩展名冒充支持；
- 为阶段 1 候选准备正常、video-only、audio-only、损坏、截断和伪装样例；
- 设计 MP4/WebM 以及新增原生候选所需的有界 probe；
- 验证 `<video>` 的首帧、连续播放、基础 seek、错误和清理事件；
- 记录首包、插件 chunk、Object URL 和媒体资源生命周期门禁。

### 首批候选

优先验证：

1. MP4 + AVC/H.264 + AAC；
2. WebM + VP8 + Vorbis 或 Opus；
3. WebM + VP9 + Opus；
4. 上述容器的 video-only 和 audio-only 对照样例；
5. 目标环境中实际可原生播放的 HEVC、AV1、MOV、Ogg Video 和 3GPP 组合。

第 5 类不因为语义验证尚未达到等级 4 而自动推迟到后续阶段；只要满足播放底线，就可以进入阶段 1 的实际覆盖。

### 完成标准

- 五份视频规划文档口径一致；
- 每个首批候选至少有一个参数明确、可再分发的正常固定样例；
- 每个容器族有损坏、截断和伪装扩展名样例；
- probe 预算和原生媒体资源策略有测量或协议依据；
- 能用真实浏览器区分“可连续播放”“只能读取 metadata”和“不能打开”；
- catalog 中已有的格式文案只作为候选，不作为实现证据。

## 3. 阶段 1：浏览器原生播放广覆盖

### 实施结果（2026-08-29）

- 已新增 `browser-video` workspace 插件，并接入网站注册表；manifest、probe 与完整实现保持独立入口；
- probe 在 256 KiB 头部 + 256 KiB 尾部、总计 512 KiB 的预算内识别 ISO BMFF/WebM、视频轨道、音频轨道与声明 codec 子集；
- 已交付 MP4/M4V 的 AVC + AAC-LC、AVC video-only、HEVC + AAC-LC、AV1 + AAC-LC，MOV/QuickTime 与 3GPP 的 AVC + AAC-LC，以及 WebM 的 VP8 + Vorbis、VP9 + Opus、VP9 video-only；
- 完整实现使用 `<video controls>` 与 Object URL，不自动播放；以真实 `loadeddata` 判断首帧，幂等释放媒体、URL 和插件 DOM；
- Chromium 151 / macOS 15.6.1 的真实插件 smoke 已验证十个固定样例的连续播放、非静音解码音频、seek，以及损坏、截断、audio-only、伪装文件、opening abort 和 active abort；
- `canPlayType()` 对本环境中的 HEVC MP4 与 AVC MOV 存在假阴性，因此已从 probe 路径移除；probe 只依赖有界字节解析和声明 codec 子集，真实环境失败由 `open()` 的媒体事件准确返回。

固定样例已移动到插件自己的 [`examples/`](../../viewer/plugins/browser-video/examples/) 目录；组合级证据见[支持矩阵](support-matrix.md)。

### 产品能力

- 使用一个 `browser-video` 插件打开目标环境中实际可原生播放的组合；
- 使用原生 controls 提供播放、暂停、音量和基础 seek，不自动播放；
- 显示文件名以及容易可靠取得的容器、codec、尺寸和时长信息；
- video-only 文件正常播放，含音频文件保留应有主音频；
- codec 不可用、文件损坏和环境不支持时提供准确错误；
- 切换、取消和 dispose 后立即停止播放并释放资源。

### 技术原则

- manifest、probe 和完整实现使用不同入口；
- probe 只进行有界容器/轨道识别，不创建 DOM 或初始化媒体元素；
- 完整插件使用 `<video controls>` + Object URL；
- `open()` 以真实文件的媒体事件判断是否达到播放条件，不能只相信扩展名、MIME 或 `canPlayType()`；
- 没有视频轨道时返回 0，不截获未来 audio-only 路由；
- 原生路径不自行 demux、不实现 Canvas 播放，也不为统一抽象创建媒体框架；
- 原生播放已满足底线的组合直接纳入，不等待 HDR、多轨、章节等增强验收。

### 完成标准

- 每个声明组合至少通过协议合规、正常/损坏/截断样例和真实播放 smoke；
- 打开后画面可见并能连续播放，基础 seek 可用；
- 含音频样例的主音频可用，video-only 样例不被当成损坏文件；
- audio-only 与伪装扩展名不会被视频插件选中；
- opening abort、active abort、连续切换和重复 dispose 后无声音、回调、Object URL 或媒体加载残留；
- 窄窗口、矮窗口和容器 resize 下仍可使用原生 controls；
- 初始 `/view` bundle 不包含视频完整实现或 probe parser；
- 支持矩阵按实际环境记录等级 3 或 4 及已知限制。

文件尾 `moov`、fragmented MP4、edit list、VFR、rotation 等变体如果影响某个已声明组合的基本播放，应作为该组合的缺陷修复；如果只影响高级语义，则进入阶段 3，不再单独占据一个“深挖 browser-video”的产品阶段。

## 4. 阶段 2：非原生格式播放扩展

阶段 2 的目标是让更多浏览器原生不能播放的常见视频真正播放，而不是继续系统性提高阶段 1 的支持等级。

### 首批实施结果（2026-08-30）

- 已新增单一 `non-native-video` workspace 插件，首批声明 `.mkv`、`.mk3d`；`browser-video` 保持原生 `<video>` 路径不变；
- 独立 probe 以 512 KiB 头部 + 256 KiB 尾部、总计 768 KiB 的预算检查 Matroska、轨道、codec、Cues 与资源上限，不导入 Mediabunny、UI 或 decoder；
- 完整实现精确锁定 Mediabunny 1.55.3（MPL-2.0），以 8 MiB Blob 缓存、2 个 Canvas 解码帧槽和约 1 秒音频预排形成有界播放管线；
- 已交付 AVC/AAC、HEVC/FLAC、VP8/Vorbis、VP9/Opus、AV1/MP3 与 AVC video-only 六条固定证据路径；实际文件仍通过主轨 decoder config 决定当前环境是否可解；
- `open()` 真实解码首帧和主音频首包后返回，不自动播放；用户点击后才恢复 AudioContext，并支持播放、暂停、音量、前后 seek、结束与重播；
- Chromium 151 / macOS 15.6.1（Apple Silicon）真实 smoke 已验证连续 Canvas 帧、非静音音频、seek/end/replay、260 × 180 resize、opening abort、active abort 与重复 dispose；
- 生产 bundle 门禁确认 `/view` 首包与 probe chunk 均不包含 Mediabunny或完整播放器；Mediabunny 只存在于完整插件的延迟 chunk。

固定样例、生成命令和反例见 [`viewer/plugins/non-native-video/examples/`](../../viewer/plugins/non-native-video/examples/)。多轨选择、字幕、章节、HDR 精确输出和专业色彩语义仍是等级 3 的已知限制。

### 候选方向

- Matroska 中用户常见的 AVC、HEVC、VP9、AV1 与常见音频组合；
- AVI 中用户常见且 decoder 可控的 codec 子集；
- MPEG-PS/TS 中 MPEG-1/2 Video、AVC、HEVC 与常见音频的代表组合；
- 原生路径未覆盖但仍有实际需求的 Ogg Video、3GPP 和 Flash Video 组合；
- MOV 中原生路径未覆盖、但不需要专业工作流的明确组合。

候选按真实使用频率选择，不要求一次支持整个容器家族。每次只声明已经完成端到端播放的容器与 codec 子集。

### 实现原则

- 优先使用维护活跃、许可清楚、可锁定版本的现成 demuxer 和 decoder；确需自行构建时遵守[源码构建型第三方依赖规范](../viewer-source-built-dependencies.md)；
- WebCodecs、WASM 或裁剪后的 FFmpeg 组件只是实现手段，不构成万能 fallback；
- 重型依赖仅在对应完整插件打开后加载，不进入 manifest、probe、首包或无关插件 chunk；
- demux、视频解码、音频输出、A/V clock、seek、背压和结束状态形成完整播放路径；
- 每条路径都能取消，并释放 Worker、WASM、AudioContext、帧缓存和 GPU 资源；
- 不创建 metadata-only 插件，也不把只解出第一帧的 spike 标为视频格式支持；
- rotation、色彩、HDR、多轨和字幕可以作为已知限制留在等级 3，不阻塞下一个高价值组合。

### 完成标准

- 每个新增组合有固定样例、精确 codec 范围、目标环境和实际等级；
- 主要画面与应有主音频能够连续播放，基础 seek、结束和重播可用；
- 峰值内存、帧/音频队列、索引工作量和首帧时间有边界；
- 损坏、截断、超限和不支持的子变体不会误报为可播放；
- abort、切换和重复 dispose 可以终止并释放全部自定义媒体资源；
- 依赖版本、许可证、资产来源、CSP、COOP/COEP 和部署路径可审计；
- 首包和不相关插件不包含新增 parser、decoder 或媒体实现。

## 5. 阶段 3：播放体验与专业能力增强

阶段 3 按用户价值增强已经可播放的组合，并评估专业视频播放，不作为扩大普通格式覆盖的前置阶段。

### 普通播放增强候选

- 更准确的 VFR、edit list、fragment 和 seek 行为；
- rotation、pixel aspect ratio 和显示尺寸；
- 多音轨选择、内嵌字幕和章节；
- 色彩 primaries、range、HDR 和 10-bit 输出验证；
- 键盘交互、倍速和其他有明确需求的播放器体验。

### 专业播放候选

- MOV/MXF 中的 ProRes、DNxHD/HR、AVC-Intra、JPEG 2000 等明确组合；
- timecode、逐帧导航、专业轨道和色彩检查；
- 在普通连续播放基础上提供领域能力，目标等级可达到 5。

专业方向仍必须先完成主要画面、应有音频、时间轴和资源清理，不能用 metadata 面板代替播放能力。

## 6. 每个可播放组合的交付清单

### 必须完成

- manifest、可选 probe 和完整实现按需分离；
- 扩展名、容器 magic、轨道类型、codec 配置和声明子集明确；
- 正常、损坏、截断、伪装、video-only 或 audio-only 对照样例；
- 首帧、连续播放、主音频、基础 seek、结束和重播；
- opening abort、active abort、切换文件和重复 dispose；
- 不修改容器外 DOM，不遗留声音、Object URL、媒体加载、Worker、AudioContext 或 GPU 资源；
- 真实浏览器的窄/矮窗口和 resize 冒烟；
- 生产 build、首包和插件 chunk 检查；
- 更新支持矩阵、catalog、目标环境和已知限制。

### 按声明范围验证

- rotation、显示比例、VFR、fragment 和准确 seek；
- 多视频/音频轨、字幕和章节；
- 色彩、range、HDR、alpha 和专业 metadata。

未声明的增强能力不阻止组合以等级 3 交付，但文案不能暗示已经支持。
