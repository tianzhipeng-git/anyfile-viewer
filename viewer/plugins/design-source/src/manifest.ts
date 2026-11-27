import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const designSourceManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "design-source",
  name: {
    en: "Design Source Viewer",
    "zh-CN": "设计源文件查看器",
  },
  workspaceAccess: "none",
  formats: [
    {
      name: {
        en: "Figma Design",
        "zh-CN": "Figma 设计稿",
      },
      extensions: [".fig"],
      mimeTypes: ["application/x-figma", "application/octet-stream"],
    },
    {
      name: {
        en: "Sketch Design",
        "zh-CN": "Sketch 设计稿",
      },
      extensions: [".sketch"],
      mimeTypes: ["application/x-sketch", "application/zip"],
    },
  ],
};
