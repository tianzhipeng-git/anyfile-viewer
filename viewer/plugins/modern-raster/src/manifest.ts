import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const modernRasterManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "modern-raster",
  name: "现代图片查看器",
  formats: [
    { name: "JPEG XL 图片", extensions: [".jxl"], mimeTypes: ["image/jxl"] },
    { name: "HEIF/HEIC 图片", extensions: [".heic", ".heif", ".heifs", ".hif"], mimeTypes: ["image/heic", "image/heif"] },
  ],
  workspaceAccess: "none",
};
