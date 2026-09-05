import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const mobiManifest: ViewerPluginManifest = {
  protocolVersion: 2,
  id: "mobi-reader",
  name: { en: "MOBI / Kindle reader", "zh-CN": "MOBI / Kindle 阅读器" },
  formats: [{ name: { en: "Unencrypted MOBI, KF8 and PalmDOC", "zh-CN": "无 DRM MOBI、KF8 与 PalmDOC" }, extensions: [".mobi", ".azw", ".azw3", ".prc", ".pdb"] }],
  workspaceAccess: "none",
};
