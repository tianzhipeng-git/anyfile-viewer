import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
export const pointCloudManifest: ViewerPluginManifest = { protocolVersion: 2, id: "point-cloud", name: { en: "Point cloud preview", "zh-CN": "点云预览" }, formats: [{ name: { en: "Point cloud", "zh-CN": "点云" }, extensions: [".pcd", ".xyz", ".las", ".laz"] }], workspaceAccess: "none" };
