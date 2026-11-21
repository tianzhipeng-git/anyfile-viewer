import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const devNativeBinaryManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "dev-native-binary-viewer",
  name: { en: "Native binary structure viewer", "zh-CN": "原生二进制结构查看器" },
  formats: [
    {
      name: { en: "ELF binary", "zh-CN": "ELF 二进制文件" },
      extensions: [".elf", ".so", ".o", ".out"],
      mimeTypes: ["application/x-elf", "application/x-sharedlib", "application/x-object"],
    },
    {
      name: { en: "PE / COFF binary", "zh-CN": "PE / COFF 二进制文件" },
      extensions: [".exe", ".dll", ".obj"],
      mimeTypes: ["application/vnd.microsoft.portable-executable", "application/x-msdownload"],
    },
    {
      name: { en: "Mach-O binary", "zh-CN": "Mach-O 二进制文件" },
      extensions: [".dylib", ".bundle"],
      mimeTypes: ["application/x-mach-binary"],
    },
    {
      name: { en: "Node.js native addon", "zh-CN": "Node.js 原生扩展" },
      extensions: [".node"],
    },
    {
      name: { en: "Unix archive / static library", "zh-CN": "Unix 归档 / 静态库" },
      extensions: [".a", ".lib", ".rlib"],
      mimeTypes: ["application/x-archive"],
    },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
