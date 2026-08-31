import { defineFormat } from "./define-format";

export const wavFormat = defineFormat(
  "wav",
  "images-video",
  4,
  { name: "WAVE audio", title: "Play WAV Audio Online", description: "Play supported RIFF/WAVE audio directly from the selected file.", introduction: "WAVE is a RIFF container most often used for PCM audio, but it can carry other codecs. Anyfile checks the container and lets the browser play supported sample formats locally.", canShow: ["Supported PCM and browser-decodable WAVE audio","Duration, seeking and volume controls"], limitations: ["Unsupported codecs inside WAVE will not play","Broadcast and cue metadata are not fully exposed"], faq: [{ question: "Does every WAV file contain uncompressed PCM?", answer: "No. WAVE is a container and can identify compressed codecs that the browser may not decode." }] },
  { name: "WAVE 音频", title: "在线播放 WAV 音频", description: "直接从所选文件播放受支持的 RIFF/WAVE 音频。", introduction: "WAVE 是最常用于 PCM 音频的 RIFF 容器，但也可承载其他 codec。Anyfile 检查容器，并让浏览器在本地播放受支持的采样格式。", canShow: ["受支持的 PCM 与浏览器可解码 WAVE 音频","时长、定位与音量控制"], limitations: ["WAVE 内不支持的 codec 无法播放","不会完整展示广播与 cue 元数据"], faq: [{ question: "每个 WAV 都是未压缩 PCM 吗？", answer: "不是。WAVE 是容器，也可标识浏览器可能无法解码的压缩 codec。" }] },
  {},
  undefined,
  ["wave"],
);

