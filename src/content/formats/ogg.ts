import { defineFormat } from "./define-format";

export const oggFormat = defineFormat(
  "ogg",
  "images-video",
  4,
  { name: "Ogg media", title: "Play Ogg Audio and Video Online", description: "Probe and play supported Ogg audio or Theora video locally.", introduction: "Ogg is a page-based media container used for Vorbis, Opus and Theora streams. Anyfile identifies the primary stream and chooses native audio playback or the dedicated local video path.", canShow: ["Vorbis or Opus audio when supported","Verified Theora video with synchronized audio"], limitations: ["Chained streams and unusual mappings may not play","Codec support differs between audio and video paths"], faq: [{ question: "Why can an OGG file contain video?", answer: "OGG names the container, which can carry Theora video as well as Vorbis or Opus audio." }] },
  { name: "Ogg 媒体", title: "在线播放 Ogg 音频与视频", description: "在本地探测并播放受支持的 Ogg 音频或 Theora 视频。", introduction: "Ogg 是用于 Vorbis、Opus 与 Theora 流的分页媒体容器。Anyfile 识别主流，并选择原生音频播放或专用本地视频路径。", canShow: ["受支持的 Vorbis 或 Opus 音频","已验证的 Theora 视频与同步音频"], limitations: ["串联流和少见映射可能无法播放","音频与视频路径的 codec 支持不同"], faq: [{ question: "为什么 OGG 文件可能包含视频？", answer: "OGG 指容器，它既可承载 Theora 视频，也可承载 Vorbis 或 Opus 音频。" }] },
  { possibleLevels: [3,4] },
  undefined,
  ["oga"],
);

