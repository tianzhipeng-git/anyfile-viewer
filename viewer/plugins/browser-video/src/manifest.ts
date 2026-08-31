import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const browserVideoManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "browser-video",
  name: { en: "Browser video viewer", "zh-CN": "浏览器视频查看器" },
  formats: [
    {
      name: { en: "ISO BMFF video", "zh-CN": "ISO BMFF 视频" },
      extensions: [".mp4", ".m4v", ".mov", ".qt", ".3gp", ".3g2"],
      mimeTypes: ["video/mp4", "video/quicktime", "video/3gpp"],
    },
    {
      name: { en: "WebM video", "zh-CN": "WebM 视频" },
      extensions: [".webm"],
      mimeTypes: ["video/webm"],
    },
  ],
  workspaceAccess: "none",
};
