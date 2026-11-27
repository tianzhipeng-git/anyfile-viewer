// Single-point declaration of the semantic file-type kind for each viewer
// plugin. `file-type-icon.tsx` derives its rule extensions from this table plus
// each plugin's manifest, so adding a plugin means one entry here rather than
// editing scattered `pluginExtensions("a", "b")` lists per kind block.
//
// A plugin appears once per kind it feeds. Use `only` to keep a kind on a subset
// of the plugin's extensions (e.g. dji-osmo is an image for `.jpg` but a video
// for `.osv`) and `exclude` to drop extensions handled by another rule.

export type FileTypeKind =
  | "archive"
  | "audio"
  | "binary"
  | "code"
  | "database"
  | "design"
  | "developer"
  | "document"
  | "font"
  | "image"
  | "model"
  | "presentation"
  | "spreadsheet"
  | "unknown"
  | "video";

export type PluginFileKind = {
  readonly id: string;
  readonly kind: FileTypeKind;
  /** Restrict this kind to these extensions (still filtered by the manifest). */
  readonly only?: readonly string[];
  /** Drop these extensions from this kind. */
  readonly exclude?: readonly string[];
};

// Order here is the icon rule order: more specific kinds first so composite
// names such as `.docx` and `.csv.gz` are not reduced to their outer container.
export const PLUGIN_FILE_KINDS: readonly PluginFileKind[] = [
  { id: "excel-workbook", kind: "spreadsheet" },

  { id: "dji-osmo", kind: "image", only: [".jpg", ".jpeg"] },
  { id: "gopro-max", kind: "image", only: [".jpg", ".jpeg"] },
  { id: "insta360", kind: "image", only: [".insp", ".dng"] },
  { id: "browser-image", kind: "image" },
  { id: "modern-raster", kind: "image" },
  { id: "camera-raw", kind: "image" },
  { id: "general-raster", kind: "image" },
  { id: "hdr-image", kind: "image" },
  { id: "dicom", kind: "image" },
  { id: "safe-svg", kind: "image" },

  { id: "dji-osmo", kind: "video", only: [".osv"] },
  { id: "gopro-max", kind: "video", only: [".360"] },
  { id: "insta360", kind: "video", only: [".lrv", ".insv"] },
  { id: "browser-video", kind: "video" },
  { id: "non-native-video", kind: "video" },
  { id: "ffmpeg-video", kind: "video" },

  { id: "powerpoint-presentation", kind: "presentation" },
  { id: "legacy-office", kind: "presentation", only: [".ppt"] },
  { id: "iwork", kind: "presentation", only: [".key"] },

  { id: "pdfjs-pdf", kind: "document" },
  { id: "postscript-document", kind: "document" },
  { id: "xps-reader", kind: "document" },
  { id: "ofd-reader", kind: "document" },
  { id: "word-document", kind: "document" },
  { id: "microsoft-project", kind: "document" },
  { id: "mobi-reader", kind: "document" },
  { id: "fictionbook-reader", kind: "document" },
  { id: "epub-reader", kind: "document" },
  { id: "chm-reader", kind: "document" },
  { id: "djvu-reader", kind: "document" },
  { id: "comic-book-reader", kind: "document" },
  { id: "calendar-contacts", kind: "document" },
  { id: "outlook-pst", kind: "document" },
  { id: "legacy-office", kind: "document", exclude: [".ppt"] },
  { id: "iwork", kind: "document", only: [".pages"] },

  { id: "mind-map", kind: "design" },

  { id: "ace-code-text", kind: "code" },
  { id: "http-archive", kind: "code" },

  { id: "dev-array-viewer", kind: "developer" },
  { id: "dev-source-map-viewer", kind: "developer" },
  { id: "dev-wasm-viewer", kind: "developer" },
  { id: "x509-certificate", kind: "developer" },
  { id: "bittorrent-metadata", kind: "developer" },
  { id: "ml-weights", kind: "developer" },
  { id: "apple-plist", kind: "developer" },

  { id: "sqlite-database", kind: "database" },
  { id: "duckdb-data", kind: "database" },
  { id: "statistical-data", kind: "database" },
  { id: "scientific-data", kind: "database" },

  { id: "browser-audio", kind: "audio" },
  { id: "non-native-audio", kind: "audio" },
  { id: "ffmpeg-audio", kind: "audio" },

  { id: "ifc", kind: "model" },
  { id: "cad-exchange", kind: "model" },
  { id: "mesh-3d", kind: "model" },
  { id: "print-3d", kind: "model" },
  { id: "point-cloud", kind: "model" },

  { id: "visio", kind: "design" },
  { id: "pixelmator-pxd", kind: "design" },
  { id: "photoshop-document", kind: "design" },
  { id: "design-source", kind: "design" },
  { id: "cad-2d", kind: "design" },
  { id: "cad-dwg", kind: "design" },

  { id: "archive-metadata-viewer", kind: "archive" },

  { id: "dev-native-binary-viewer", kind: "binary", exclude: [".obj"] },
];
