import { defineFormat } from "./define-format";

export const flacFormat = defineFormat(
  "flac",
  "images-video",
  4,
  { name: "FLAC audio", title: "Play FLAC Audio Online", description: "Play lossless FLAC audio locally with browser decoding.", introduction: "FLAC stores losslessly compressed audio frames with stream metadata. Anyfile validates the stream and uses the current browser decoder for local playback without transcoding.", canShow: ["Lossless browser-decoded audio","Duration, seeking and volume controls"], limitations: ["Rare channel layouts or damaged frames may fail","Metadata blocks are not an editable tag view"], faq: [{ question: "Does Anyfile convert FLAC to MP3?", answer: "No. It plays the selected FLAC locally and does not convert or upload it." }] },
  { name: "FLAC 音频", title: "在线播放 FLAC 音频", description: "通过浏览器解码在本地播放无损 FLAC 音频。", introduction: "FLAC 使用流元数据与无损压缩音频帧保存声音。Anyfile 校验音频流，并使用当前浏览器解码器在本地播放，不进行转码。", canShow: ["浏览器解码的无损音频","时长、定位与音量控制"], limitations: ["少见声道布局或损坏帧可能失败","元数据块不是可编辑标签视图"], faq: [{ question: "Anyfile 会把 FLAC 转成 MP3 吗？", answer: "不会。它在本地播放所选 FLAC，不转换也不上传。" }] },
  {},
  undefined,
  ["fla"],
);

