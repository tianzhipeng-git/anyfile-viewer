import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const devSourceMapManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dev-source-map-viewer",
  name: "Source Map 查看器",
  formats: [
    { name: "ECMA-426 source map", extensions: [".map"], mimeTypes: ["application/json"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
