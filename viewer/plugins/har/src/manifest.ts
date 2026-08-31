import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const harManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "http-archive",
  name: { en: "HTTP Archive viewer", "zh-CN": "HTTP Archive 查看器" },
  formats: [{
    name: { en: "HTTP Archive", "zh-CN": "HTTP Archive" },
    extensions: [".har"],
    mimeTypes: ["application/json", "application/vnd.har+json"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
