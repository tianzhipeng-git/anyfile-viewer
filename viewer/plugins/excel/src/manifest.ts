import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const excelManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "excel-workbook",
  name: "Excel 查看器",
  formats: [{
    name: "电子表格",
    extensions: [
      ".xlsx", ".xlsm", ".xlsb", ".xls", ".xlw", ".xml",
      ".ods", ".fods", ".numbers", ".et", ".csv", ".tsv", ".txt",
      ".dbf", ".dif", ".slk", ".prn", ".wk1", ".wk2", ".wk3",
      ".wk4", ".wks", ".123", ".wq1", ".wq2", ".wb1", ".wb2",
      ".wb3", ".qpw", ".xlr",
    ],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      "application/vnd.ms-excel",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/csv",
    ],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
