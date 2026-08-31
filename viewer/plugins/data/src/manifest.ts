import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

import { DATA_FILE_FORMATS } from "./formats";

export const dataManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "duckdb-data",
  name: { en: "DuckDB data viewer", "zh-CN": "DuckDB 数据查看器" },
  formats: DATA_FILE_FORMATS.map(({ name, extensions, mimeTypes }) => ({
    name,
    extensions,
    mimeTypes,
  })),
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
