import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const safeSvgManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "safe-svg",
  name: "安全 SVG 查看器",
  formats: [{
    name: "SVG 矢量图",
    extensions: [".svg", ".svgz"],
    mimeTypes: ["image/svg+xml"],
  }],
  workspaceAccess: "none",
};
