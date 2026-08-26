import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const excelManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "excel-workbook",
  name: "Excel 查看器",
  formats: [{
    name: "Excel 工作簿",
    extensions: [".xlsx", ".xlsm"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
    ],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
