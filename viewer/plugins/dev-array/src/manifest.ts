import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const devArrayManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dev-array-viewer",
  name: "NumPy 数组查看器",
  formats: [
    { name: "NumPy array", extensions: [".npy"], mimeTypes: ["application/x-npy"] },
    { name: "NumPy array archive", extensions: [".npz"], mimeTypes: ["application/x-npz"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
