import { defineFormat } from "./define-format";

export const aacFormat = defineFormat(
  "aac",
  "images-video",
  4,
  { name: "ADTS AAC audio", title: "Play AAC Audio Online", description: "Play supported ADTS-framed AAC audio from local storage.", introduction: "Raw .aac files commonly wrap AAC access units in ADTS headers rather than an MP4 container. Anyfile validates that framing before handing compatible audio to the browser.", canShow: ["Supported ADTS AAC streams","Standard local playback controls"], limitations: ["Other raw AAC transports are not implied","Profile and channel support depends on the browser"], faq: [{ question: "Is an AAC file the same as M4A?", answer: "Not necessarily. This page covers ADTS-framed .aac files; M4A normally stores AAC in an MPEG-4 container." }] },
  { name: "ADTS AAC 音频", title: "在线播放 AAC 音频", description: "从本地存储播放受支持的 ADTS 帧 AAC 音频。", introduction: "裸 .aac 文件通常使用 ADTS 文件头封装 AAC access unit，而不是 MP4 容器。Anyfile 会先校验这种分帧，再交给兼容的浏览器音频管线。", canShow: ["受支持的 ADTS AAC 流","标准本地播放控制"], limitations: ["不代表支持其他裸 AAC 传输方式","profile 与声道支持取决于浏览器"], faq: [{ question: "AAC 文件与 M4A 相同吗？", answer: "不一定。本页描述 ADTS 分帧的 .aac；M4A 通常是在 MPEG-4 容器中保存 AAC。" }] },
  {},
  undefined,
  ["adts"],
);

