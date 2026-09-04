import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const pixelmatorPxdManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "pixelmator-pxd",
  name: { en: "Pixelmator Pro document viewer", "zh-CN": "Pixelmator Pro 文档查看器" },
  formats: [
    {
      name: { en: "Pixelmator Pro document", "zh-CN": "Pixelmator Pro 文档" },
      extensions: [".pxd"],
    },
  ],
  workspaceAccess: "none",
};
