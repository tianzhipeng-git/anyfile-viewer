import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const dicomManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dicom",
  name: { en: "DICOM medical image viewer", "zh-CN": "DICOM 医学影像查看器" },
  formats: [{
    name: { en: "DICOM medical image", "zh-CN": "DICOM 医学影像" },
    extensions: [".dcm", ".dicom"],
    mimeTypes: ["application/dicom"],
  }],
  workspaceAccess: "none",
};
