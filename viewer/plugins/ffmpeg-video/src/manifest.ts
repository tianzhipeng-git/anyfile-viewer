import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const ffmpegVideoManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "ffmpeg-video",
  name: { en: "FFmpeg video viewer", "zh-CN": "FFmpeg 视频查看器" },
  formats: [{ name: { en: "AVI MPEG-4 video", "zh-CN": "AVI MPEG-4 视频" }, extensions: [".avi"] }],
  workspaceAccess: "none",
};
