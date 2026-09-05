import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const mesh3dManifest: ViewerPluginManifest = {
  protocolVersion: 2, id: "mesh-3d", name: { en: "3D mesh and scene viewer", "zh-CN": "三维网格与场景查看器" },
  formats: [{ name: { en: "3D mesh", "zh-CN": "三维网格" }, extensions: [".stl", ".obj", ".ply", ".off", ".glb", ".gltf"] }],
  workspaceAccess: "optional",
};
