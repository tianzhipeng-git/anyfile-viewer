import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const hexManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "hex-viewer",
  name: "十六进制查看器",
  formats: [{
    name: "任意文件",
    extensions: ["*"],
    mimeTypes: ["application/octet-stream"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
