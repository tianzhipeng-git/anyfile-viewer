import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const hdrImageManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "hdr-image",
  name: { en: "OpenEXR & HDR image viewer", "zh-CN": "OpenEXR 与 HDR 高动态范围图像查看器" },
  formats: [
    {
      name: { en: "OpenEXR image", "zh-CN": "OpenEXR 高动态范围图像" },
      extensions: [".exr"],
      mimeTypes: ["image/x-exr", "image/exr"],
    },
    {
      name: { en: "Radiance HDR image", "zh-CN": "Radiance HDR 图像" },
      extensions: [".hdr", ".rgbe"],
      mimeTypes: ["image/vnd.radiance", "image/x-hdr"],
    },
  ],
  workspaceAccess: "none",
};
