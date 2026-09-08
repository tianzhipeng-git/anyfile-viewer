import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const dwgManifest = {
  protocolVersion: 2, id: "cad-dwg", name: { en: "DWG drawing viewer", "zh-CN": "DWG 工程图查看器" },
  formats: [{ name: { en: "DWG drawing", "zh-CN": "DWG 工程图" }, extensions: [".dwg"], mimeTypes: ["image/vnd.dwg"] }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
