import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const plistManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "apple-plist",
  name: { en: "Apple property list viewer", "zh-CN": "Apple 属性列表查看器" },
  formats: [{
    name: { en: "Apple property list", "zh-CN": "Apple 属性列表" },
    extensions: [".plist"],
    mimeTypes: ["application/x-plist", "application/xml"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
