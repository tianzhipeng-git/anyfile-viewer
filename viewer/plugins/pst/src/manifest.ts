import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const pstManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "outlook-pst",
  name: { en: "Outlook mailbox archive viewer", "zh-CN": "Outlook 邮箱归档查看器" },
  formats: [
    {
      name: { en: "Outlook personal folders", "zh-CN": "Outlook 个人文件夹" },
      extensions: [".pst"],
      mimeTypes: ["application/vnd.ms-outlook"],
    },
    {
      name: { en: "Outlook offline folders", "zh-CN": "Outlook 脱机文件夹" },
      extensions: [".ost"],
    },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
