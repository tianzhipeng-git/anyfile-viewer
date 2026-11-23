import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const iworkManifest: ViewerPluginManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "iwork",
  name: { en: "Apple Pages & Keynote viewer", "zh-CN": "Apple Pages 与 Keynote 查看器" },
  formats: [
    {
      name: { en: "Apple Pages document", "zh-CN": "Apple Pages 文稿" },
      extensions: [".pages"],
      mimeTypes: ["application/vnd.apple.pages"],
    },
    {
      name: { en: "Apple Keynote presentation", "zh-CN": "Apple Keynote 演示文稿" },
      extensions: [".key"],
      mimeTypes: ["application/vnd.apple.keynote"],
    },
  ],
  workspaceAccess: "none",
};
