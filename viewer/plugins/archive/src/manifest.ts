import { VIEWER_PROTOCOL_VERSION, type ViewerPluginManifest } from "@anyfile/viewer-protocol";

export const archiveMetadataManifest = {
  protocolVersion: VIEWER_PROTOCOL_VERSION,
  id: "archive-metadata-viewer",
  name: { en: "Archive metadata viewer", "zh-CN": "压缩与归档元数据查看器" },
  formats: [
    {
      name: { en: "ZIP and ZIP-derived archive", "zh-CN": "ZIP 与 ZIP 派生归档" },
      extensions: [
        ".zip", ".zip64", ".jar", ".war", ".ear", ".apk", ".aab", ".ipa",
        ".epub", ".odt", ".ods", ".odp", ".odg", ".odf", ".docx", ".xlsx",
        ".pptx", ".nupkg", ".snupkg", ".vsix", ".whl", ".xpi", ".cbz", ".kmz",
        ".usdz", ".egg", ".pyz", ".pyzw",
      ],
      mimeTypes: ["application/zip"],
    },
    { name: { en: "RAR archive", "zh-CN": "RAR 归档" }, extensions: [".rar", ".cbr"], mimeTypes: ["application/vnd.rar"] },
    { name: { en: "TAR archive", "zh-CN": "TAR 归档" }, extensions: [".tar", ".cbt"], mimeTypes: ["application/x-tar"] },
    { name: { en: "JMOD", "zh-CN": "JMOD" }, extensions: [".jmod"] },
    { name: { en: "gzip", "zh-CN": "gzip" }, extensions: [".gz", ".gzip", ".tgz", ".tar.gz", ".crate"] },
    { name: { en: "XZ", "zh-CN": "XZ" }, extensions: [".xz", ".txz", ".tar.xz"] },
    { name: { en: "Zstandard frame", "zh-CN": "Zstandard 帧" }, extensions: [".zst", ".zstd", ".tzst", ".tar.zst", ".tar.zstd"] },
    { name: { en: "bzip2", "zh-CN": "bzip2" }, extensions: [".bz2", ".bzip2", ".tbz", ".tbz2", ".tar.bz2"] },
    { name: { en: "LZ4 frame", "zh-CN": "LZ4 帧" }, extensions: [".lz4", ".tar.lz4"] },
    { name: { en: "zlib", "zh-CN": "zlib" }, extensions: [".zlib", ".zz"] },
    { name: { en: "raw DEFLATE", "zh-CN": "原始 DEFLATE" }, extensions: [".deflate", ".dfl"] },
    { name: { en: "Brotli", "zh-CN": "Brotli" }, extensions: [".br"] },
  ],
  workspaceAccess: "none",
} as const satisfies ViewerPluginManifest;
