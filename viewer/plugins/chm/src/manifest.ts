import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const chmManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "chm-reader",
  name: { en: "CHM help reader", "zh-CN": "CHM 帮助文档阅读器" },
  formats: [
    {
      name: { en: "Compiled HTML Help", "zh-CN": "CHM 编译 HTML 帮助文档" },
      extensions: [".chm"],
      mimeTypes: ["application/vnd.ms-htmlhelp"],
    },
  ],
  workspaceAccess: "none",
};
