import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const nonNativeAudioManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "non-native-audio",
  name: "非原生音频查看器",
  formats: [{
    name: "Matroska 音频",
    extensions: [".mka"],
    mimeTypes: ["audio/x-matroska"],
  }],
  workspaceAccess: "none",
};
