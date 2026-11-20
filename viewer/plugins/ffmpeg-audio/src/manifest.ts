import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const ffmpegAudioManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "ffmpeg-audio",
  name: { en: "FFmpeg audio viewer", "zh-CN": "FFmpeg 音频查看器" },
  formats: [
    { name: { en: "AIFF / AIFC PCM audio", "zh-CN": "AIFF / AIFC PCM 音频" }, extensions: [".aif", ".aiff", ".aifc"] },
    { name: { en: "ASF / Windows Media audio", "zh-CN": "ASF / Windows Media 音频" }, extensions: [".wma"], mimeTypes: ["audio/x-ms-wma"] },
  ],
  workspaceAccess: "none",
};
