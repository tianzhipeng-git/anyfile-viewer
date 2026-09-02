import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const insta360Manifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "insta360",
  name: { en: "Insta360 panorama viewer", "zh-CN": "Insta360 全景查看器" },
  formats: [
    {
      name: { en: "Insta360 X3 panorama photo", "zh-CN": "Insta360 X3 全景照片" },
      extensions: [".insp"],
      mimeTypes: ["image/jpeg"],
    },
    {
      name: { en: "Insta360 RAW panorama", "zh-CN": "Insta360 RAW 全景照片" },
      extensions: [".dng"],
      mimeTypes: ["image/x-adobe-dng"],
    },
    {
      name: { en: "Insta360 low-resolution video", "zh-CN": "Insta360 低分辨率视频" },
      extensions: [".lrv"],
      mimeTypes: ["video/mp4"],
    },
    {
      name: { en: "Insta360 360 video", "zh-CN": "Insta360 全景视频" },
      extensions: [".insv"],
      mimeTypes: ["video/mp4"],
    },
  ],
  workspaceAccess: "optional",
};
