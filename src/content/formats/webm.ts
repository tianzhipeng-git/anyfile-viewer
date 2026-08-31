import { defineFormat } from "./define-format";

export const webmFormat = defineFormat(
  "webm",
  "images-video",
  4,
  { name: "WebM media", title: "Play WebM Files Online", description: "Play supported WebM video or audio locally in the browser.", introduction: "WebM is a Matroska-derived container centered on web codecs such as VP8, VP9, AV1, Vorbis and Opus. Anyfile probes its tracks and uses an available native or local playback path.", canShow: ["Supported WebM video and audio tracks","Duration, seeking and playback controls"], limitations: ["A supported container does not guarantee every codec profile","Subtitle and full multi-track controls are unavailable"], faq: [{ question: "Can a WebM file contain only audio?", answer: "Yes. Anyfile can route supported audio-only WebM files to the browser audio player." }] },
  { name: "WebM 媒体", title: "在线播放 WebM 文件", description: "在浏览器本地播放受支持的 WebM 视频或音频。", introduction: "WebM 是以 VP8、VP9、AV1、Vorbis 与 Opus 等 Web codec 为中心的 Matroska 派生容器。Anyfile 探测轨道并选择可用的原生或本地播放路径。", canShow: ["受支持的 WebM 视频与音频轨道","时长、定位与播放控制"], limitations: ["容器受支持不代表每种 codec profile 都可播放","不提供字幕与完整多轨控制"], faq: [{ question: "WebM 可以只有音频吗？", answer: "可以。Anyfile 可把受支持的纯音频 WebM 路由到浏览器音频播放器。" }] },
  { possibleLevels: [3,4] },
  undefined,
  [],
);

