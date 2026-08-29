# 视频查看相关概念

本文统一本地视频文件查看文档中的术语。分类服务于插件边界、支持等级和验收，不试图建立完整的数字媒体百科。

## 1. 本路线图的范围

视频路线图处理用户明确选择的本地视频文件，包括视频文件中的音频轨道、字幕轨道和容器元数据。

本路线图的产品结果是播放，不是媒体检查：

- 容器、轨道和 codec 解析用于选择播放实现、驱动 demux/decode 和解释失败；
- 只展示 metadata、轨道结构、封面或首帧，不算完成一个视频格式；
- 达到连续播放、应有主音频、基础 seek 和资源释放底线后，优先增加下一个可播放组合；
- rotation、pixel aspect ratio、多轨、字幕、色彩和 HDR 等高级语义按已知缺失降低支持等级或记录限制，不默认阻塞格式覆盖。

以下内容不属于本路线图：

- 独立音频文件；未来由 `docs/audio/` 和音频插件规划；
- HLS、DASH、RTMP、WebRTC 等流媒体协议；
- DRM、付费内容和访问控制绕过；
- 摄像头采集、录屏和实时通信；
- 编辑、转码、导出和服务端处理；
- DVD、Blu-ray、广播节目和其菜单/加密体系。

## 2. 扩展名、容器与 codec

### 文件扩展名

扩展名只用于产生候选插件，不能证明文件内容。例如 `.mp4` 可能包含不同视频和音频 codec，也可能根本没有视频轨道。

### 容器

容器规定轨道、样本、时间轴、索引、元数据和 codec 配置如何组织。典型容器包括 ISO Base Media File Format 家族、QuickTime、Matroska/WebM、Ogg、AVI、MPEG Transport Stream 和 MXF。

同一个容器可以保存多种 codec。MP4 或 MOV 可被浏览器打开，不等于其中任意编码组合都可播放。

### 视频 codec

视频 codec 规定画面如何编码和解码，例如 AVC/H.264、HEVC/H.265、VP9、AV1、ProRes 和 DNxHR。支持范围通常还受 profile、level、bit depth、chroma subsampling 和 codec 配置影响。

### 音频 codec

视频文件内的音频是视频完整播放能力的一部分。常见编码包括 AAC、Opus、Vorbis、MP3、AC-3/E-AC-3 和 PCM。只有画面而缺失应有声音时，不能声称完整支持该文件。

### Codec string

`video/mp4; codecs="avc1.640028, mp4a.40.2"` 一类字符串把容器 MIME 与 codec 配置组合起来。插件只有在从文件中可靠取得相应配置时才可以构造具体 codec string，不能根据扩展名猜测。

## 3. 轨道、节目与时间轴

### 轨道

一个容器可以包含多条视频、音频、字幕或元数据轨道。首期原生视频插件以可播放的主视频和浏览器实际选择的音频为核心，不因容器里存在轨道就宣称能够导航或切换全部轨道。

### 时间基与时间戳

视频帧和音频样本通常按各自 time scale 保存时间戳。查看器必须依赖可靠时间轴处理 seek 和音画同步，不能用帧序号除以名义帧率代替实际时间戳。

### 固定与可变帧率

固定帧率是相邻画面时长大致恒定；可变帧率允许每个样本使用不同持续时间。容器报告的平均帧率不能证明文件为固定帧率。

### Seek

Seek 不只是设置一个进度值。容器需要有可用索引，decoder 通常从关键帧开始恢复。一个播放组合至少应能进行基础跳转；更精细的逐帧、准确落点和异常时间轴处理属于后续增强。

### Fragmented / progressive organization

MP4 等容器可能把索引放在文件头、文件尾，或使用多个 fragment。它们属于同一家族的不同组织方式，需要独立样例验证，不能只用一个 fast-start 文件代表整个容器。

## 4. 画面语义

### 编码尺寸、显示尺寸与像素宽高比

编码像素尺寸不一定等于最终显示比例。容器或码流可能提供 pixel aspect ratio、clean aperture 或显示矩阵。UI 展示尺寸时要区分编码尺寸和浏览器最终显示尺寸。

### Rotation

手机视频常通过容器矩阵表达方向。插件必须记录方向由浏览器原生播放路径还是自定义 renderer 应用，避免重复旋转或忽略旋转。

### 色彩与 HDR

视频的色彩信息可能涉及 primaries、transfer characteristics、matrix coefficients、range、bit depth 和静态/动态 HDR metadata。能播放出画面不等于 HDR 和色彩语义正确。未知或未验证时必须降低支持声明。

### Alpha

少数视频 codec 或容器组合可以携带 alpha。首期普通视频播放不把 alpha 作为默认能力；未来若纳入，需要独立记录合成背景和浏览器行为。

## 5. 字幕与辅助内容

字幕可能是容器内文本/位图轨道，也可能是工作区中的外部文件。基础播放阶段不自动读取同目录字幕，也不把浏览器未暴露的内嵌字幕视为已支持；字幕能力不作为增加下一个可播放格式的默认前置条件。

章节、封面、缩略图、timecode、camera metadata 和空间视频信息同样属于独立语义。能够解析容器不代表已经展示这些内容。

## 6. 浏览器能力检查

- `HTMLMediaElement.canPlayType()` 只提供可能性判断，不保证当前文件实际可解码、可 seek 或能正确播放全部轨道。
- Media Capabilities 可以辅助判断某个配置是否受支持、是否可能流畅或节能，但不能替代真实文件打开。
- WebCodecs 不保证实现任意 codec，也不提供完整通用 demux、音画同步、字幕和播放器状态机。
- `open()` 必须等待当前文件产生足够的真实媒体事件或错误，再决定是否打开成功。

浏览器、操作系统、硬件和安装的系统 codec 都可能影响结果，因此支持证据必须记录测试环境和日期。

## 7. 参考资料

- [WHATWG HTML media elements](https://html.spec.whatwg.org/multipage/media.html)
- [RFC 6381: The `codecs` and `profiles` Parameters](https://www.rfc-editor.org/rfc/rfc6381)
- [W3C Media Capabilities](https://www.w3.org/TR/media-capabilities/)
- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)
- [WebM Container Guidelines](https://www.webmproject.org/docs/container/)
- [Matroska Specifications](https://www.matroska.org/technical/elements.html)
