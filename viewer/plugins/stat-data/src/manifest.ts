import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const statDataManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "statistical-data",
  name: { en: "Statistical data viewer", "zh-CN": "统计数据查看器" },
  formats: [
    { name: { en: "SPSS data file", "zh-CN": "SPSS 数据文件" }, extensions: [".sav", ".zsav"], mimeTypes: ["application/x-spss-sav"] },
    { name: { en: "SPSS portable file", "zh-CN": "SPSS 可移植文件" }, extensions: [".por"], mimeTypes: ["application/x-spss-por"] },
    { name: { en: "Stata dataset", "zh-CN": "Stata 数据集" }, extensions: [".dta"], mimeTypes: ["application/x-stata-dta"] },
    { name: { en: "SAS dataset", "zh-CN": "SAS 数据集" }, extensions: [".sas7bdat"], mimeTypes: ["application/x-sas-data"] },
    { name: { en: "SAS transport file", "zh-CN": "SAS 传输文件" }, extensions: [".xpt"], mimeTypes: ["application/x-sas-xport"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
