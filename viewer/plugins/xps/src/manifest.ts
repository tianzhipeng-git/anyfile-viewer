import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const xpsManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "xps-reader",
  name: { en: "XPS document viewer", "zh-CN": "XPS 文档查看器" },
  formats: [
    {
      name: { en: "XPS document", "zh-CN": "XPS 文档" },
      extensions: [".xps"],
      mimeTypes: ["application/vnd.ms-xpsdocument"],
    },
    {
      name: { en: "OpenXPS document", "zh-CN": "OpenXPS 文档" },
      extensions: [".oxps"],
      mimeTypes: ["application/oxps"],
    },
  ],
  workspaceAccess: "none",
};
