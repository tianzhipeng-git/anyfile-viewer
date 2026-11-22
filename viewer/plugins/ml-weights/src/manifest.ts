import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const mlWeightsManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "ml-weights",
  name: { en: "ML model weights viewer", "zh-CN": "机器学习模型权重查看器" },
  formats: [{
    name: { en: "Safetensors weights", "zh-CN": "Safetensors 权重" },
    extensions: [".safetensors"],
    mimeTypes: ["application/octet-stream"],
  }, {
    name: { en: "GGUF model", "zh-CN": "GGUF 模型" },
    extensions: [".gguf"],
    mimeTypes: ["application/octet-stream"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
