import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const devWasmManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dev-wasm-viewer",
  name: { en: "WebAssembly module viewer", "zh-CN": "WebAssembly 模块查看器" },
  formats: [
    { name: { en: "WebAssembly module", "zh-CN": "WebAssembly 模块" }, extensions: [".wasm"], mimeTypes: ["application/wasm"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
