import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const fontManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "font-viewer",
  name: { en: "Font viewer", "zh-CN": "字体查看器" },
  formats: [
    {
      name: { en: "TrueType / OpenType font", "zh-CN": "TrueType / OpenType 字体" },
      extensions: [".ttf", ".otf"],
      mimeTypes: ["font/ttf", "font/otf", "application/font-sfnt"],
    },
    {
      name: { en: "Web font", "zh-CN": "Web 字体" },
      extensions: [".woff", ".woff2"],
      mimeTypes: ["font/woff", "font/woff2"],
    },
  ],
  workspaceAccess: "none",
};
