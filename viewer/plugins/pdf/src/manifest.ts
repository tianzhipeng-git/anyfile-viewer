import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const pdfManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "pdfjs-pdf",
  name: { en: "PDF.js viewer", "zh-CN": "PDF.js 查看器" },
  formats: [{
    name: { en: "PDF document", "zh-CN": "PDF 文档" },
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  }, {
    name: { en: "PDF-compatible Adobe Illustrator artwork", "zh-CN": "PDF 兼容的 Adobe Illustrator 图稿" },
    extensions: [".ai"],
    mimeTypes: ["application/illustrator"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
