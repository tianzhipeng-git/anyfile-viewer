import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const archiveMetadataManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "archive-metadata-viewer",
  name: "压缩与归档元数据查看器",
  formats: [
    {
      name: "ZIP 与 ZIP 派生归档",
      extensions: [
        ".zip", ".zip64", ".jar", ".war", ".ear", ".apk", ".aab", ".ipa",
        ".epub", ".odt", ".ods", ".odp", ".odg", ".odf", ".docx", ".xlsx",
        ".pptx", ".nupkg", ".snupkg", ".vsix", ".whl", ".xpi", ".cbz", ".kmz",
        ".usdz", ".egg", ".pyz", ".pyzw",
      ],
      mimeTypes: ["application/zip"],
    },
    { name: "RAR 归档", extensions: [".rar"], mimeTypes: ["application/vnd.rar"] },
    { name: "TAR 归档", extensions: [".tar"], mimeTypes: ["application/x-tar"] },
    { name: "JMOD", extensions: [".jmod"] },
    { name: "gzip", extensions: [".gz", ".gzip", ".tgz", ".tar.gz", ".crate"] },
    { name: "XZ", extensions: [".xz", ".txz", ".tar.xz"] },
    { name: "Zstandard frame", extensions: [".zst", ".zstd", ".tzst", ".tar.zst", ".tar.zstd"] },
    { name: "bzip2", extensions: [".bz2", ".bzip2", ".tbz", ".tbz2", ".tar.bz2"] },
    { name: "LZ4 frame", extensions: [".lz4", ".tar.lz4"] },
    { name: "zlib", extensions: [".zlib", ".zz"] },
    { name: "raw DEFLATE", extensions: [".deflate", ".dfl"] },
    { name: "Brotli", extensions: [".br"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
