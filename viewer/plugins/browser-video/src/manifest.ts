import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const browserVideoManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "browser-video",
  name: "浏览器视频查看器",
  formats: [
    {
      name: "ISO BMFF 视频",
      extensions: [".mp4", ".m4v", ".mov", ".qt", ".3gp", ".3g2"],
      mimeTypes: ["video/mp4", "video/quicktime", "video/3gpp"],
    },
    {
      name: "WebM 视频",
      extensions: [".webm"],
      mimeTypes: ["video/webm"],
    },
  ],
  workspaceAccess: "none",
};
