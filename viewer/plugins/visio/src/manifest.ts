import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const visioManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "visio",
  name: { en: "Visio viewer", "zh-CN": "Visio 查看器" },
  formats: [
    { name: { en: "Visio XML drawing", "zh-CN": "Visio XML 绘图" }, extensions: [".vsdx"] },
    { name: { en: "Visio binary drawing", "zh-CN": "Visio 二进制绘图" }, extensions: [".vsd"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
