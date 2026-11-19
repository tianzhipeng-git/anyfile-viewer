import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const ffmpegVideoManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "ffmpeg-video",
  name: { en: "FFmpeg video viewer", "zh-CN": "FFmpeg 视频查看器" },
  formats: [
    { name: { en: "AVI MPEG-4 video", "zh-CN": "AVI MPEG-4 视频" }, extensions: [".avi"] },
    { name: { en: "ASF / Windows Media video", "zh-CN": "ASF / Windows Media 视频" }, extensions: [".wmv", ".asf"], mimeTypes: ["video/x-ms-wmv", "video/x-ms-asf"] },
    { name: { en: "MPEG program stream video", "zh-CN": "MPEG 节目流视频" }, extensions: [".mpg", ".mpeg", ".vob"], mimeTypes: ["video/mpeg"] },
  ],
  workspaceAccess: "none",
};
