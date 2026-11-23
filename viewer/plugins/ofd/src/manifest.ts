import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const ofdManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "ofd-reader",
  name: { en: "OFD document viewer", "zh-CN": "OFD 版式文档查看器" },
  formats: [
    {
      name: { en: "OFD fixed-layout document", "zh-CN": "OFD 版式文档" },
      extensions: [".ofd"],
      mimeTypes: ["application/ofd"],
    },
  ],
  workspaceAccess: "none",
};
