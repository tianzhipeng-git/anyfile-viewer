import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const epubManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "epub-reader",
  name: { en: "EPUB reader", "zh-CN": "EPUB 阅读器" },
  formats: [
    {
      name: { en: "EPUB", "zh-CN": "EPUB" },
      extensions: [".epub"],
      mimeTypes: ["application/epub+zip"],
    },
  ],
  workspaceAccess: "none",
};
