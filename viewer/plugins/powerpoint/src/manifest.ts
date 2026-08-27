import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const powerpointManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "powerpoint-presentation",
  name: "PowerPoint 查看器",
  formats: [{
    name: "PowerPoint Open XML 演示文稿",
    extensions: [".pptx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
