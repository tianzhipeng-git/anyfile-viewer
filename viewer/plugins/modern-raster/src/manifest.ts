import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const modernRasterManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "modern-raster",
  name: { en: "Modern image viewer", "zh-CN": "现代图片查看器" },
  formats: [
    { name: { en: "JPEG XL image", "zh-CN": "JPEG XL 图片" }, extensions: [".jxl"], mimeTypes: ["image/jxl"] },
    { name: { en: "HEIF/HEIC image", "zh-CN": "HEIF/HEIC 图片" }, extensions: [".heic", ".heif", ".heifs", ".hif"], mimeTypes: ["image/heic", "image/heif"] },
  ],
  workspaceAccess: "none",
};
