import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const mppManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "microsoft-project",
  name: { en: "Microsoft Project viewer", "zh-CN": "Microsoft Project 查看器" },
  formats: [{ name: { en: "Microsoft Project", "zh-CN": "Microsoft Project 项目计划" }, extensions: [".mpp"] }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
