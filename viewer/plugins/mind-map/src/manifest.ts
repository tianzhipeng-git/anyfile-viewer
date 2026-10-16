import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const mindMapManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "mind-map",
  name: { en: "Mind map viewer", "zh-CN": "思维导图查看器" },
  formats: [
    { name: { en: "XMind", "zh-CN": "XMind 思维导图" }, extensions: [".xmind"] },
    { name: { en: "MindManager", "zh-CN": "MindManager 思维导图" }, extensions: [".mmap"] },
    { name: { en: "FreeMind / Freeplane", "zh-CN": "FreeMind / Freeplane 思维导图" }, extensions: [".mm"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
