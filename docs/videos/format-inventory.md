# 视频格式与编码候选清单

- 状态：阶段 0 候选 inventory，不是支持承诺或开发排期
- 用途：帮助确定测试组合、插件边界和支持等级

实际支持状态只看 [support-matrix.md](support-matrix.md)。扩展名出现在网站 catalog 或本文中，不表示已有可用插件。

## 1. 纳入原则

本清单收录主要用于保存本地视频节目的容器和其中常见的视频、音频、字幕编码。排序需要同时考虑：

1. 用户遇到频率和本地预览价值；
2. 浏览器原生播放能力；
3. 能否获得可再分发且能证明编码组合的样例；
4. 容器解析、索引和 seek 复杂度；
5. 自定义 demux/decode 的包体积、内存和许可成本；
6. 色彩、HDR、多轨、字幕和专业元数据的正确性要求。

## 2. 常见容器

| 容器家族 | 常见扩展名 | 常见内容 | 首期判断 |
|---|---|---|---|
| ISO BMFF / MP4 | `.mp4` `.m4v` | AVC、HEVC、AV1；AAC、Opus 等 | 阶段 1 首选，但必须按 sample entry 和 codec 配置验证 |
| QuickTime | `.mov` `.qt` | AVC、HEVC、ProRes；AAC、PCM 等 | 与 MP4 结构相关但编码范围更宽，不自动并入首期 |
| WebM | `.webm` | VP8、VP9、AV1；Vorbis、Opus | 阶段 1 首选 |
| Matroska | `.mkv` `.mk3d` | 多种视频、音频和字幕编码 | 容器范围远大于 WebM，后续独立评估 |
| Ogg | `.ogv` `.ogg` | Theora；Vorbis、Opus | 价值与目标浏览器能力验证后排期 |
| AVI | `.avi` | 多种历史 VfW/DirectShow 编码 | 容器简单不代表 codec 可用，后续评估 |
| MPEG Program Stream | `.mpg` `.mpeg` `.vob` | MPEG-1/2 Video、MPEG audio、AC-3 等 | 后续评估；DVD 语义不纳入 |
| MPEG Transport Stream | `.ts` `.mts` `.m2ts` | AVC/HEVC、AAC/AC-3 等 | 广播分段、时间戳和损坏恢复复杂，后续评估 |
| Flash Video | `.flv` `.f4v` | Sorenson、VP6、AVC；AAC/MP3 | 历史格式，近期价值较低 |
| MXF | `.mxf` | MPEG-2、AVC-Intra、DNx、JPEG 2000 等 | 专业领域插件候选 |
| 3GPP | `.3gp` `.3g2` | AVC/H.263、AAC/AMR 等 | 移动历史格式，按真实需求排期 |

`.ogg`、`.mp4` 等容器也可能只有音频轨道。视频插件必须检查是否存在可播放视频轨道；audio-only 文件留给未来音频插件。

## 3. 视频 codec 候选

| 家族 | 典型标识 | 主要变量 | 建议阶段 |
|---|---|---|---|
| AVC / H.264 | `avc1` `avc3` | profile、level、bit depth、reference frames | 阶段 1 常见组合 |
| HEVC / H.265 | `hvc1` `hev1` | profile、tier、level、10-bit、系统许可与硬件 | 阶段 2 按环境验证 |
| VP8 | `vp8` | 容器与浏览器路径 | 阶段 1 WebM 基线 |
| VP9 | `vp09` | profile、bit depth、chroma | 阶段 1/2 WebM 基线 |
| AV1 | `av01` | profile、level、tier、bit depth、硬件能力 | 阶段 2 按环境验证 |
| MPEG-1/2 Video | 容器专属标识 | profile、level、interlace | 后续 |
| MPEG-4 Part 2 | `mp4v` 等 | profile 和历史实现差异 | 后续 |
| Theora | Ogg codec identification | 浏览器路径 | 后续 |
| Motion JPEG | `mjpg` 等 | 色彩、帧尺寸、容器 | 后续 |
| ProRes | `apch` `ap4h` 等 | profile、alpha、10/12-bit、色彩 | 专业视频 spike |
| DNxHD / DNxHR | VC-3/DNx 标识 | profile、bit depth、MXF/MOV | 专业视频 spike |
| CineForm | `cfhd` 等 | profile、bit depth | 专业视频 spike |
| JPEG 2000 video | `mjp2` 等 | profile、色彩、MXF/JP2 family | 专业视频 spike |

“支持 H.264”不是完整声明。支持矩阵至少要绑定容器、sample entry、profile/level 和固定样例。

## 4. 视频内音频 codec

| 家族 | 常见容器 | 视频路线图中的意义 |
|---|---|---|
| AAC | MP4/MOV/TS | 常见主音轨，需验证实际对象类型和声道布局 |
| Opus | WebM/Matroska/Ogg，部分 MP4 | 常见 WebM 音轨 |
| Vorbis | WebM/Matroska/Ogg | 历史 WebM/Ogg 音轨 |
| MP3 | MP4/AVI/Matroska 等 | 需按容器组合验证 |
| PCM | MOV/AVI/MXF 等 | 位深、端序、声道和采样格式众多 |
| AC-3 / E-AC-3 | MP4/TS/MXF 等 | 浏览器和系统差异明显，后续评估 |
| FLAC | Matroska/WebM 等 | 组合与浏览器行为需独立验证 |
| DTS family | Matroska/TS 等 | 近期不承诺 |

本文不规划 `.mp3`、`.flac`、`.wav`、`.m4a` 等独立音频文件的产品体验。

## 5. 字幕和辅助轨道

| 类型 | 示例 | 首期范围 |
|---|---|---|
| 容器内文本字幕 | WebVTT、TTML、tx3g、ASS/SSA 等 | 记录存在性，不默认承诺展示或切换 |
| 容器内位图字幕 | PGS、VobSub 等 | 后续专业/容器插件评估 |
| 外部字幕 | `.vtt` `.srt` `.ass` 等 | 阶段 1 不自动读取工作区文件 |
| 章节 | MP4/Matroska chapter | 后续 |
| Timecode | QuickTime/MXF timecode track | 专业视频插件候选 |
| 封面/缩略图 | attachment 或 metadata | 不能代替视频播放能力 |

## 6. 明确排除的类别

- 独立音频文件；
- HLS、DASH、RTMP、SRT、WebRTC 等传输或流媒体协议；
- DRM、加密媒体和访问控制绕过；
- DVD/Blu-ray 菜单、播放列表、分支和加密体系；
- 摄像头 RAW、图像序列和 GIF/APNG；它们分别属于摄影、图片或专业序列工作流；
- 视频编辑工程文件；
- 服务端转码、云端媒体分析和第三方上传。

## 7. 参考资料

- [IANA Media Types](https://www.iana.org/assignments/media-types/media-types.xhtml)
- [MP4 Registration Authority](https://mp4ra.org/)
- [WebM Container Guidelines](https://www.webmproject.org/docs/container/)
- [Matroska Specifications](https://www.matroska.org/technical/elements.html)
- [Xiph Ogg Specifications](https://xiph.org/ogg/)
