import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const fictionBookManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "fictionbook-reader",
  name: { en: "FictionBook reader", "zh-CN": "FictionBook 阅读器" },
  formats: [{ name: { en: "FictionBook ebook", "zh-CN": "FictionBook 电子书" }, extensions: [".fb2", ".fb2.zip", ".zip"], mimeTypes: ["application/x-fictionbook+xml"] }],
  workspaceAccess: "none",
};
