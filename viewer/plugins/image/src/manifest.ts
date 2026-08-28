import {
  VIEWER_PROTOCOL_VERSION,
  type ViewerPluginManifest,
} from "@anyfile/viewer-protocol";

export const browserImageManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "browser-image",
  name: "浏览器图片查看器",
  formats: [
    {
      name: "浏览器原生图片",
      extensions: [".jpg", ".jpeg", ".jfif", ".png", ".apng", ".gif", ".webp", ".avif"],
      mimeTypes: ["image/jpeg", "image/png", "image/apng", "image/gif", "image/webp", "image/avif"],
    },
  ],
  workspaceAccess: "none",
};
