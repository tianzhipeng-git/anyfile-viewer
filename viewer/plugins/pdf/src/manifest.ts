import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const pdfManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "browser-pdf",
  name: "PDF 查看器",
  formats: [{
    name: "PDF 文档",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
