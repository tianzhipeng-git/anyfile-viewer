import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const comicBookManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "comic-book-reader",
  name: { en: "Comic book reader", "zh-CN": "漫画阅读器" },
  formats: [
    {
      name: { en: "CBZ / CBR / CB7 / CBT", "zh-CN": "CBZ / CBR / CB7 / CBT" },
      extensions: [".cbz", ".cbr", ".cb7", ".cbt"],
      mimeTypes: ["application/vnd.comicbook+zip"],
    },
  ],
  workspaceAccess: "none",
};
