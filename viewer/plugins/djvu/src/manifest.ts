import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const djvuManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "djvu-reader",
  name: { en: "DjVu reader", "zh-CN": "DjVu 电子书阅读器" },
  formats: [
    {
      name: { en: "DjVu document", "zh-CN": "DjVu 文档" },
      extensions: [".djvu", ".djv"],
      mimeTypes: ["image/vnd.djvu", "image/x-djvu"],
    },
  ],
  workspaceAccess: "none",
};
