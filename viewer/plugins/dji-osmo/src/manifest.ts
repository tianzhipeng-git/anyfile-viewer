import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const djiOsmoManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dji-osmo",
  name: { en: "DJI Osmo panorama viewer", "zh-CN": "DJI Osmo 全景查看器" },
  formats: [
    {
      name: { en: "DJI Osmo 360 panorama photo", "zh-CN": "DJI Osmo 360 全景照片" },
      extensions: [".jpg", ".jpeg"],
      mimeTypes: ["image/jpeg"],
    },
    {
      name: { en: "DJI Osmo 360 video", "zh-CN": "DJI Osmo 360 全景视频" },
      extensions: [".osv"],
      mimeTypes: ["video/mp4"],
    },
  ],
  workspaceAccess: "none",
};
