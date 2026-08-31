import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const powerpointManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "powerpoint-presentation",
  name: { en: "PowerPoint viewer", "zh-CN": "PowerPoint 查看器" },
  formats: [{
    name: { en: "PowerPoint Open XML presentation", "zh-CN": "PowerPoint Open XML 演示文稿" },
    extensions: [".pptx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
