import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const devSourceMapManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dev-source-map-viewer",
  name: { en: "Source Map viewer", "zh-CN": "Source Map 查看器" },
  formats: [
    { name: { en: "ECMA-426 source map", "zh-CN": "ECMA-426 Source Map" }, extensions: [".map"], mimeTypes: ["application/json"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
