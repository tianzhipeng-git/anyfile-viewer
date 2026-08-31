import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const pdfManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "pdfjs-pdf",
  name: { en: "PDF.js viewer", "zh-CN": "PDF.js 查看器" },
  formats: [{
    name: { en: "PDF document", "zh-CN": "PDF 文档" },
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
