import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const generalRasterManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "general-raster",
  name: "通用栅格图片查看器",
  formats: [
    {
      name: "TGA 图片",
      extensions: [".tga", ".icb", ".vda", ".vst"],
      mimeTypes: ["image/x-tga", "image/x-targa", "image/tga"],
    },
    {
      name: "Netpbm 图片",
      extensions: [".pnm", ".pbm", ".pgm", ".ppm", ".pam"],
      mimeTypes: [
        "image/x-portable-anymap",
        "image/x-portable-bitmap",
        "image/x-portable-graymap",
        "image/x-portable-pixmap",
        "image/x-portable-arbitrarymap",
      ],
    },
    {
      name: "TIFF 图片",
      extensions: [
        ".tif", ".tiff",
        ".tf8", ".btf", ".btiff",
        ".ptif", ".ptiff",
        ".gtif", ".gtiff", ".geotif", ".geotiff",
        ".ome.tif", ".ome.tiff", ".ome.tf2", ".ome.tf8", ".ome.btf",
      ],
      mimeTypes: ["image/tiff", "image/x-tiff", "image/geotiff", "image/x-geotiff"],
    },
  ],
  workspaceAccess: "none",
};
