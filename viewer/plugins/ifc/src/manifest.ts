import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const ifcManifest: ViewerPluginManifest = {
  protocolVersion: 2, id: "ifc", name: { en: "IFC building viewer", "zh-CN": "IFC 建筑模型查看器" },
  formats: [{ name: { en: "Industry Foundation Classes", "zh-CN": "IFC 建筑信息模型" }, extensions: [".ifc"] }],
  workspaceAccess: "none",
};
