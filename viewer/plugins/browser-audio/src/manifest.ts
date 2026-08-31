import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const browserAudioManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "browser-audio",
  name: { en: "Browser audio viewer", "zh-CN": "浏览器音频查看器" },
  formats: [
    { name: { en: "MP3 audio", "zh-CN": "MP3 音频" }, extensions: [".mp3"], mimeTypes: ["audio/mpeg"] },
    { name: { en: "WAVE audio", "zh-CN": "WAVE 音频" }, extensions: [".wav", ".wave"], mimeTypes: ["audio/wav"] },
    { name: { en: "MPEG-4 audio", "zh-CN": "MPEG-4 音频" }, extensions: [".m4a", ".mp4"], mimeTypes: ["audio/mp4"] },
    { name: { en: "Ogg audio", "zh-CN": "Ogg 音频" }, extensions: [".ogg", ".oga", ".opus"], mimeTypes: ["audio/ogg"] },
    { name: { en: "WebM audio", "zh-CN": "WebM 音频" }, extensions: [".webm"], mimeTypes: ["audio/webm"] },
    { name: { en: "FLAC audio", "zh-CN": "FLAC 音频" }, extensions: [".flac", ".fla"], mimeTypes: ["audio/flac"] },
    { name: { en: "ADTS AAC audio", "zh-CN": "ADTS AAC 音频" }, extensions: [".aac", ".adts"], mimeTypes: ["audio/aac"] },
  ],
  workspaceAccess: "none",
};
