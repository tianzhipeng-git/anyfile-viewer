import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const ffmpegAudioManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "ffmpeg-audio",
  name: { en: "FFmpeg audio viewer", "zh-CN": "FFmpeg 音频查看器" },
  formats: [{ name: { en: "AIFF / AIFC PCM audio", "zh-CN": "AIFF / AIFC PCM audio" }, extensions: [".aif", ".aiff", ".aifc"] }],
  workspaceAccess: "none",
};
