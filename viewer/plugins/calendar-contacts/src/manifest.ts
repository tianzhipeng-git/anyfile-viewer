import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const calendarContactsManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "calendar-contacts",
  name: { en: "Calendar and contacts viewer", "zh-CN": "日历与联系人查看器" },
  formats: [
    {
      name: { en: "iCalendar", "zh-CN": "iCalendar 日历" },
      extensions: [".ics"],
      mimeTypes: ["text/calendar"],
    },
    {
      name: { en: "vCard", "zh-CN": "vCard 联系人" },
      extensions: [".vcf"],
      mimeTypes: ["text/vcard", "text/x-vcard"],
    },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
