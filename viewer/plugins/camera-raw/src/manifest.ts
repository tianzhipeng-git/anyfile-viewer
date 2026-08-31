import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const cameraRawManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "camera-raw",
  name: { en: "Camera RAW viewer", "zh-CN": "相机 RAW 查看器" },
  formats: [{
    name: { en: "Camera RAW", "zh-CN": "相机 RAW" },
    extensions: [".dng", ".cr2", ".cr3", ".crw", ".nef", ".nrw", ".arw", ".sr2", ".srf", ".raf", ".orf", ".pef", ".rwl", ".raw", ".rw2"],
    mimeTypes: ["image/x-adobe-dng", "image/x-canon-cr2", "image/x-canon-cr3", "image/x-canon-crw", "image/x-nikon-nef", "image/x-nikon-nrw", "image/x-sony-arw", "image/x-sony-sr2", "image/x-sony-srf", "image/x-fuji-raf", "image/x-olympus-orf", "image/x-pentax-pef", "image/x-leica-rwl", "image/x-panasonic-raw"],
  }],
  workspaceAccess: "none",
};
