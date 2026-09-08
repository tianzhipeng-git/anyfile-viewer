import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const cadExchangeManifest: ViewerPluginManifest = { protocolVersion:2, id:"cad-exchange", name:{ en:"CAD exchange viewer", "zh-CN":"CAD 交换格式查看器" }, formats:[{ name:{ en:"STEP, IGES and BREP", "zh-CN":"STEP、IGES 与 BREP" }, extensions:[".step",".stp",".iges",".igs",".brep"] }], workspaceAccess:"none" };
