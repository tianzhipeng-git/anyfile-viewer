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
      name: { en: "Insta360 X3 low-resolution video", "zh-CN": "Insta360 X3 低分辨率视频" },
      extensions: [".lrv"],
      mimeTypes: ["video/mp4"],
    },
    {
      name: { en: "Insta360 X3 paired video", "zh-CN": "Insta360 X3 成对全景视频" },
      extensions: [".insv"],
      mimeTypes: ["video/mp4"],
    },
  ],
  workspaceAccess: "optional",
};
