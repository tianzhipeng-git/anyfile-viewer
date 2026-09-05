import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const cad2dManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "cad-2d",
  name: { en: "CAD DXF viewer", "zh-CN": "CAD DXF 查看器" },
  formats: [{
    name: { en: "DXF CAD drawing", "zh-CN": "DXF 工程图" },
    extensions: [".dxf"],
    mimeTypes: ["application/dxf", "image/vnd.dxf"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
