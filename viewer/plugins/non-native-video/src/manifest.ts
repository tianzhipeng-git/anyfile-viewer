import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const nonNativeVideoManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "non-native-video",
  name: { en: "Non-native video viewer", "zh-CN": "非原生视频查看器" },
  formats: [
    {
      name: { en: "Matroska video", "zh-CN": "Matroska 视频" },
      extensions: [".mkv", ".mk3d"],
      mimeTypes: ["video/x-matroska", "video/matroska-3d"],
    },
    {
      name: { en: "MPEG Transport Stream video", "zh-CN": "MPEG Transport Stream 视频" },
      extensions: [".ts", ".mts", ".m2ts", ".m2t"],
      mimeTypes: ["video/mp2t"],
    },
    {
      name: { en: "QuickTime video", "zh-CN": "QuickTime 视频" },
      extensions: [".mov", ".qt"],
      mimeTypes: ["video/quicktime"],
    },
    {
      name: { en: "Ogg Theora video", "zh-CN": "Ogg Theora 视频" },
      extensions: [".ogv", ".ogg"],
      mimeTypes: ["video/ogg", "application/ogg"],
    },
  ],
  workspaceAccess: "none",
};
