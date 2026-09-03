import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const nonNativeAudioManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "non-native-audio",
  name: { en: "Non-native audio viewer", "zh-CN": "非原生音频查看器" },
  formats: [
    {
      name: { en: "Matroska audio", "zh-CN": "Matroska 音频" },
      extensions: [".mka"],
      mimeTypes: ["audio/x-matroska"],
    },
    {
      name: { en: "WAVE A-law / μ-law", "zh-CN": "WAVE A-law / μ-law" },
      extensions: [".wav", ".wave"],
      mimeTypes: ["audio/wav", "audio/wave"],
    },
  ],
  workspaceAccess: "none",
};
