import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const postscriptManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "postscript-document",
  name: { en: "PostScript viewer", "zh-CN": "PostScript 查看器" },
  formats: [{
    name: { en: "Encapsulated PostScript", "zh-CN": "封装 PostScript" },
    extensions: [".eps", ".epsf", ".epsi"],
    mimeTypes: ["application/postscript", "image/x-eps"],
  }, {
    name: { en: "PostScript document", "zh-CN": "PostScript 文档" },
    extensions: [".ps"],
    mimeTypes: ["application/postscript"],
  }, {
    name: { en: "Legacy PostScript Adobe Illustrator artwork", "zh-CN": "旧版 PostScript Adobe Illustrator 图稿" },
    extensions: [".ai"],
    mimeTypes: ["application/illustrator"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
