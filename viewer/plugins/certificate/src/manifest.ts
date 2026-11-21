import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const certificateManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "x509-certificate",
  name: { en: "X.509 certificate viewer", "zh-CN": "X.509 证书查看器" },
  formats: [{
    name: { en: "X.509 certificate", "zh-CN": "X.509 证书" },
    extensions: [".pem", ".crt", ".cer", ".der"],
    mimeTypes: ["application/x-pem-file", "application/pkix-cert", "application/x-x509-ca-cert"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
