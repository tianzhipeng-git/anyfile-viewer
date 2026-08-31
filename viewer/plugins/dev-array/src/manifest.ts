import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const devArrayManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dev-array-viewer",
  name: { en: "NumPy array viewer", "zh-CN": "NumPy 数组查看器" },
  formats: [
    { name: { en: "NumPy array", "zh-CN": "NumPy 数组" }, extensions: [".npy"], mimeTypes: ["application/x-npy"] },
    { name: { en: "NumPy array archive", "zh-CN": "NumPy 数组归档" }, extensions: [".npz"], mimeTypes: ["application/x-npz"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
