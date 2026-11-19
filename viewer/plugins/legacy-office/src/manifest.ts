import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const legacyOfficeManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "legacy-office",
  name: { en: "Legacy Office viewer", "zh-CN": "旧版 Office 文档查看器" },
  formats: [
    {
      name: { en: "Word 97–2003 document", "zh-CN": "Word 97–2003 文档" },
      extensions: [".doc"],
      mimeTypes: ["application/msword"],
    },
    {
      name: { en: "PowerPoint 97–2003 presentation", "zh-CN": "PowerPoint 97–2003 演示文稿" },
      extensions: [".ppt"],
      mimeTypes: ["application/vnd.ms-powerpoint"],
    },
    {
      name: { en: "Rich Text Format document", "zh-CN": "RTF 富文本文档" },
      extensions: [".rtf"],
      mimeTypes: ["application/rtf", "text/rtf"],
    },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
