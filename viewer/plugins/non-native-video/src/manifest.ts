import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const nonNativeVideoManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "non-native-video",
  name: "非原生视频查看器",
  formats: [
    {
      name: "Matroska 视频",
      extensions: [".mkv", ".mk3d"],
      mimeTypes: ["video/x-matroska", "video/matroska-3d"],
    },
    {
      name: "MPEG Transport Stream 视频",
      extensions: [".ts", ".mts", ".m2ts", ".m2t"],
      mimeTypes: ["video/mp2t"],
    },
    {
      name: "QuickTime 视频",
      extensions: [".mov", ".qt"],
      mimeTypes: ["video/quicktime"],
    },
    {
      name: "Ogg Theora 视频",
      extensions: [".ogv", ".ogg"],
      mimeTypes: ["video/ogg", "application/ogg"],
    },
  ],
  workspaceAccess: "none",
};
