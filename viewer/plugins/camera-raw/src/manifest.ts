import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const cameraRawManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "camera-raw",
  name: "相机 RAW 查看器",
  formats: [{
    name: "相机 RAW",
    extensions: [".dng", ".cr2", ".cr3", ".nef", ".arw", ".raf"],
    mimeTypes: ["image/x-adobe-dng", "image/x-canon-cr2", "image/x-canon-cr3", "image/x-nikon-nef", "image/x-sony-arw", "image/x-fuji-raf"],
  }],
  workspaceAccess: "none",
};
