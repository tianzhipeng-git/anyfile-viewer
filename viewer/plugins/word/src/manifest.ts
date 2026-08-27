import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const wordManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "word-document",
  name: "Word 查看器",
  formats: [{
    name: "Word Open XML 文档",
    extensions: [".docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
