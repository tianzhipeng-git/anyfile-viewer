import { defineFormat } from "./define-format";

export const ogvFormat = defineFormat(
  "ogv",
  "images-video",
  3,
  { name: "Ogg Theora video", title: "Play OGV Theora Videos Online", description: "Decode supported Theora video locally without server conversion.", introduction: "OGV commonly identifies Ogg containers with Theora video. Anyfile demuxes the stream on this device, decodes verified video locally and synchronizes supported Vorbis audio.", canShow: ["Theora video frames and supported Vorbis audio","Local playback, pause and seeking controls"], limitations: ["Chained Ogg streams are not fully supported","Unusual granule positions or damaged pages may fail"], faq: [{ question: "Is OGV uploaded for conversion?", answer: "No. Demuxing and decoding happen in this browser tab on the current device." }] },
  { name: "Ogg Theora 视频", title: "在线播放 OGV Theora 视频", description: "无需服务器转换，在本地解码受支持的 Theora 视频。", introduction: "OGV 通常表示包含 Theora 视频的 Ogg 容器。Anyfile 在当前设备解封装视频流、本地解码已验证画面，并同步受支持的 Vorbis 音频。", canShow: ["Theora 视频帧与受支持的 Vorbis 音频","本地播放、暂停与定位控制"], limitations: ["不完整支持串联 Ogg 流","少见 granule position 或损坏 page 可能失败"], faq: [{ question: "OGV 会上传转换吗？", answer: "不会。解封装与解码都在当前设备的浏览器标签页完成。" }] },
  {},
  undefined,
  [],
);

