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
  ],
  workspaceAccess: "none",
};
