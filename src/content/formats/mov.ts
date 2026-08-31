import { defineFormat } from "./define-format";

export const movFormat = defineFormat(
  "mov",
  "images-video",
  3,
  { name: "QuickTime movie", title: "Play MOV Videos Online", description: "Probe and play supported QuickTime tracks locally.", introduction: "MOV is Apple’s QuickTime container and can hold many codec families. Anyfile inspects its sample tables, then uses the native browser path or local WebCodecs path for verified combinations.", canShow: ["Supported primary video and audio","Rotation, duration and standard playback controls"], limitations: ["Legacy QuickTime codecs are not broadly decodable","Reference movies and external media are not loaded"], faq: [{ question: "Why does one MOV play and another fail?", answer: "MOV identifies the container, while the internal codec may be modern, legacy or platform-specific." }] },
  { name: "QuickTime 影片", title: "在线播放 MOV 视频", description: "在本地探测并播放受支持的 QuickTime 轨道。", introduction: "MOV 是 Apple 的 QuickTime 容器，可承载多种 codec 家族。Anyfile 检查 sample table，再为已验证组合选择浏览器原生或本地 WebCodecs 路径。", canShow: ["受支持的主视频与音频","旋转、时长与标准播放控制"], limitations: ["旧式 QuickTime codec 通常无法解码","不会加载 reference movie 与外部媒体"], faq: [{ question: "为什么一个 MOV 能播放，另一个却失败？", answer: "MOV 标识的是容器，内部 codec 可能是现代、旧式或平台专用类型。" }] },
  {},
  undefined,
  ["qt"],
);

