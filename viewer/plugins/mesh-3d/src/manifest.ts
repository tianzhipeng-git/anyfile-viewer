import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const mesh3dManifest: ViewerPluginManifest = {
  protocolVersion: 2, id: "mesh-3d", name: { en: "3D mesh and scene viewer", "zh-CN": "三维网格与场景查看器" },
  formats: [
    { name: { en: "3D mesh", "zh-CN": "三维网格" }, extensions: [".stl", ".obj", ".ply", ".off", ".glb", ".gltf"] },
    { name: { en: "FBX and COLLADA scenes", "zh-CN": "FBX 与 COLLADA 场景" }, extensions: [".fbx", ".dae"] },
    { name: { en: "SketchUp Model", "zh-CN": "SketchUp 模型" }, extensions: [".skp"] },
  ],
  workspaceAccess: "optional",
};
