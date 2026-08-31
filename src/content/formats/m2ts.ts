import { defineFormat } from "./define-format";

export const m2tsFormat = defineFormat(
  "m2ts",
  "images-video",
  3,
  { name: "MPEG transport stream", title: "Play M2TS and MPEG-TS Video Online", description: "Play verified transport-stream tracks locally with WebCodecs.", introduction: "MPEG transport streams packetize audio and video for broadcast, cameras and Blu-ray workflows. Anyfile demuxes supported AVC or HEVC video and synchronized audio on this device.", canShow: ["Verified primary video and audio tracks","Duration, seeking and playback controls when indexed"], limitations: ["Broadcast program switching is not exposed","Damaged continuity or unsupported codecs can stop playback"], faq: [{ question: "Why is seeking less predictable in transport streams?", answer: "Broadcast streams may lack the indexing and clean timestamps found in authored MP4 files." }] },
  { name: "MPEG 传输流", title: "在线播放 M2TS 与 MPEG-TS 视频", description: "通过 WebCodecs 在本地播放已验证的传输流轨道。", introduction: "MPEG 传输流为广播、相机与蓝光工作流分组封装音视频。Anyfile 在当前设备解封装受支持的 AVC 或 HEVC 视频及同步音频。", canShow: ["已验证的主视频与音频轨道","可建立索引时的时长、定位与播放控制"], limitations: ["不提供广播节目切换","连续性损坏或不支持的 codec 会中止播放"], faq: [{ question: "为什么传输流的定位不太稳定？", answer: "广播流可能缺少制作良好的 MP4 所具有的索引与整洁时间戳。" }] },
  {},
  undefined,
  ["mts","m2t"],
);

