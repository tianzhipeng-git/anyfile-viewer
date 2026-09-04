import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const photoshopManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "photoshop-document",
  name: { en: "Photoshop viewer", "zh-CN": "Photoshop 查看器" },
  formats: [{
    name: { en: "Adobe Photoshop document", "zh-CN": "Adobe Photoshop 文档" },
    extensions: [".psd"],
    mimeTypes: ["image/vnd.adobe.photoshop"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
