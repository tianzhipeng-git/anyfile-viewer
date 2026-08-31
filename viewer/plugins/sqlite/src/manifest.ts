import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const sqliteManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "sqlite-database",
  name: { en: "SQLite viewer", "zh-CN": "SQLite 查看器" },
  formats: [{
    name: { en: "SQLite database", "zh-CN": "SQLite 数据库" },
    extensions: [".sqlite", ".sqlite3", ".db"],
    mimeTypes: ["application/vnd.sqlite3", "application/x-sqlite3"],
  }],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
