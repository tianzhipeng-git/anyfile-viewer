import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const browserAudioManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "browser-audio",
  name: "浏览器音频查看器",
  formats: [
    { name: "MP3 音频", extensions: [".mp3"], mimeTypes: ["audio/mpeg"] },
    { name: "WAVE 音频", extensions: [".wav", ".wave"], mimeTypes: ["audio/wav"] },
    { name: "MPEG-4 音频", extensions: [".m4a", ".mp4"], mimeTypes: ["audio/mp4"] },
    { name: "Ogg 音频", extensions: [".ogg", ".oga", ".opus"], mimeTypes: ["audio/ogg"] },
    { name: "WebM 音频", extensions: [".webm"], mimeTypes: ["audio/webm"] },
    { name: "FLAC 音频", extensions: [".flac", ".fla"], mimeTypes: ["audio/flac"] },
    { name: "ADTS AAC 音频", extensions: [".aac", ".adts"], mimeTypes: ["audio/aac"] },
  ],
  workspaceAccess: "none",
};
