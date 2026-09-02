import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const goProMaxManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "gopro-max",
  name: { en: "GoPro MAX panorama viewer", "zh-CN": "GoPro MAX 全景查看器" },
  formats: [
    {
      name: { en: "GoPro MAX panorama photo", "zh-CN": "GoPro MAX 全景照片" },
      extensions: [".jpg", ".jpeg"],
      mimeTypes: ["image/jpeg"],
    },
    {
      name: { en: "GoPro MAX 360 video", "zh-CN": "GoPro MAX 全景视频" },
      extensions: [".360"],
      mimeTypes: ["video/mp4"],
    },
  ],
  workspaceAccess: "none",
};
