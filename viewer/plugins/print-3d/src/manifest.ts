import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const print3dManifest: ViewerPluginManifest = {
  protocolVersion: 2, id: "print-3d", name: { en: "3D print model viewer", "zh-CN": "三维打印模型查看器" },
  formats: [{ name: { en: "3D print model", "zh-CN": "三维打印模型" }, extensions: [".3mf", ".amf"] }], workspaceAccess: "none",
};
