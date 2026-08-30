import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const devWasmManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dev-wasm-viewer",
  name: "WebAssembly 模块查看器",
  formats: [
    { name: "WebAssembly module", extensions: [".wasm"], mimeTypes: ["application/wasm"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
