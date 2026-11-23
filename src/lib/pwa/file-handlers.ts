export const MAX_FILE_HANDLER_EXTENSIONS = 300;
export const MAX_FILE_HANDLER_EXTENSION_LENGTH = 16;

// High-risk executable, installer, script and active-web extensions that must
// never be registered as desktop OS file handlers.
export const DANGEROUS_FILE_HANDLER_EXTENSIONS: ReadonlySet<string> = new Set([
  ".exe", ".dll", ".com", ".bat", ".cmd", ".msi", ".msp", ".mst", ".scr", ".pif", ".cpl",
  ".vbs", ".vbe", ".js", ".jse", ".mjs", ".cjs", ".wsf", ".wsh", ".ps1", ".sh", ".hta",
  ".lnk", ".url", ".reg", ".inf", ".scf", ".msc", ".gadget", ".chm",
  ".app", ".dmg", ".pkg", ".deb", ".rpm", ".apk", ".aab", ".ipa", ".jar", ".war", ".ear",
  ".jmod", ".xpi", ".crx", ".vsix", ".nupkg", ".snupkg", ".whl", ".egg", ".pyz", ".pyzw",
  ".so", ".dylib", ".bundle", ".node", ".elf", ".o", ".out", ".a", ".lib", ".rlib", ".wasm",
  ".crt", ".cer", ".der", ".p12", ".pfx", ".p7b",
  ".html", ".htm", ".xhtml", ".mhtml",
]);

export type PwaFileHandlerGroup = {
  readonly name: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
};

export type WebAppFileHandler = {
  readonly action: string;
  readonly name: string;
  readonly accept: Record<string, string[]>;
  readonly launch_type: "single-client";
};

// Curated core viewing formats across all major domains, kept well under
// Chromium's 300-extension limit and free of dangerous or multi-dot suffixes.
export const PWA_FILE_HANDLER_GROUPS: readonly PwaFileHandlerGroup[] = [
  {
    name: "Documents and office files",
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "application/rtf": [".rtf"],
      "application/vnd.oasis.opendocument.text": [".odt"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "application/vnd.ms-powerpoint": [".ppt"],
      "application/vnd.oasis.opendocument.presentation": [".odp"],
      "application/vnd.ms-project": [".mpp"],
      "application/vnd.ms-visio.drawing": [".vsdx", ".vsd"],
      "application/postscript": [".ps", ".eps", ".ai"],
      "application/vnd.ms-xpsdocument": [".xps"],
      "application/oxps": [".oxps"],
      "application/x-xmind": [".xmind", ".mmap", ".mm"],
    },
  },
  {
    name: "Spreadsheets and data files",
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xlsm"],
      "application/vnd.ms-excel.sheet.binary.macroenabled.12": [".xlsb"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.oasis.opendocument.spreadsheet": [".ods", ".fods"],
      "application/vnd.apple.numbers": [".numbers"],
      "application/vnd.wps-office.et": [".et"],
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "application/vnd.apache.parquet": [".parquet", ".parq"],
      "application/vnd.apache.arrow.file": [".arrow", ".feather", ".ipc"],
      "application/vnd.duckdb": [".duckdb", ".ddb"],
      "application/vnd.sqlite3": [".sqlite", ".sqlite3", ".db"],
      "application/x-spss-sav": [".sav", ".zsav", ".por"],
      "application/x-stata-dta": [".dta"],
      "application/x-sas-data": [".sas7bdat", ".xpt"],
      "application/x-dbf": [".dbf"],
      "application/x-numpy": [".npy", ".npz"],
    },
  },
  {
    name: "Ebooks and comics",
    accept: {
      "application/epub+zip": [".epub"],
      "application/x-mobipocket-ebook": [".mobi", ".azw", ".azw3", ".prc", ".pdb"],
      "application/x-fictionbook+xml": [".fb2"],
      "image/vnd.djvu": [".djvu", ".djv"],
      "application/vnd.comicbook+zip": [".cbz"],
      "application/vnd.comicbook-rar": [".cbr"],
      "application/x-cb7": [".cb7"],
      "application/x-cbt": [".cbt"],
    },
  },
  {
    name: "Images, design files and fonts",
    accept: {
      "image/jpeg": [".jpg", ".jpeg", ".jfif"],
      "image/png": [".png", ".apng"],
      "image/gif": [".gif"],
      "image/webp": [".webp"],
      "image/avif": [".avif"],
      "image/heic": [".heic"],
      "image/heif": [".heif", ".hif"],
      "image/jxl": [".jxl"],
      "image/bmp": [".bmp"],
      "image/x-icon": [".ico", ".cur"],
      "image/svg+xml": [".svg", ".svgz"],
      "image/tiff": [".tif", ".tiff", ".gtiff", ".geotiff"],
      "image/x-tga": [".tga"],
      "image/x-portable-anymap": [".pnm", ".pbm", ".pgm", ".ppm", ".pam"],
      "image/vnd.adobe.photoshop": [".psd", ".psb"],
      "application/x-pixelmator": [".pxd"],
      "font/ttf": [".ttf"],
      "font/otf": [".otf"],
      "font/woff": [".woff"],
      "font/woff2": [".woff2"],
    },
  },
  {
    name: "Camera RAW and 360 media",
    accept: {
      "image/x-adobe-dng": [".dng"],
      "image/x-canon-cr2": [".cr2", ".cr3", ".crw"],
      "image/x-nikon-nef": [".nef", ".nrw"],
      "image/x-sony-arw": [".arw", ".sr2", ".srf"],
      "image/x-fuji-raf": [".raf"],
      "image/x-olympus-orf": [".orf"],
      "image/x-pentax-pef": [".pef"],
      "image/x-panasonic-rw2": [".rw2"],
      "image/x-leica-rwl": [".rwl"],
      "image/x-dcraw": [".raw"],
      "video/x-insta360": [".insv", ".lrv"],
      "image/x-insta360": [".insp"],
      "video/x-gopro-360": [".360"],
      "video/x-dji-osv": [".osv"],
    },
  },
  {
    name: "CAD, BIM and 3D models",
    accept: {
      "image/vnd.dwg": [".dwg"],
      "image/vnd.dxf": [".dxf"],
      "model/step": [".step", ".stp"],
      "model/iges": [".iges", ".igs"],
      "application/x-brep": [".brep"],
      "application/x-step-ifc": [".ifc"],
      "model/gltf-binary": [".glb"],
      "model/gltf+json": [".gltf"],
      "model/stl": [".stl"],
      "model/obj": [".obj"],
      "application/x-ply": [".ply"],
      "model/x-off": [".off"],
      "application/vnd.autodesk.fbx": [".fbx"],
      "model/vnd.collada+xml": [".dae"],
      "application/vnd.sketchup.skp": [".skp"],
      "model/3mf": [".3mf"],
      "application/x-amf": [".amf"],
      "application/x-pcd": [".pcd"],
      "chemical/x-xyz": [".xyz"],
      "application/vnd.las": [".las", ".laz"],
    },
  },
  {
    name: "Video and audio",
    accept: {
      "video/mp4": [".mp4", ".m4v"],
      "video/quicktime": [".mov"],
      "video/webm": [".webm"],
      "video/x-matroska": [".mkv"],
      "video/mp2t": [".ts", ".mts", ".m2ts"],
      "video/ogg": [".ogv"],
      "video/x-msvideo": [".avi"],
      "video/x-ms-wmv": [".wmv", ".asf"],
      "video/mpeg": [".mpg", ".mpeg", ".vob"],
      "video/3gpp": [".3gp", ".3g2"],
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
      "audio/mp4": [".m4a"],
      "audio/flac": [".flac"],
      "audio/ogg": [".ogg", ".oga", ".opus"],
      "audio/aac": [".aac"],
      "audio/x-matroska": [".mka"],
      "audio/aiff": [".aif", ".aiff"],
      "audio/x-ms-wma": [".wma"],
    },
  },
  {
    name: "Archives",
    accept: {
      "application/zip": [".zip"],
      "application/vnd.rar": [".rar"],
      "application/x-tar": [".tar"],
      "application/gzip": [".gz", ".tgz"],
      "application/x-xz": [".xz", ".txz"],
      "application/zstd": [".zst", ".tzst"],
      "application/x-bzip2": [".bz2", ".tbz2"],
      "application/x-lz4": [".lz4"],
      "application/x-brotli": [".br"],
    },
  },
  {
    name: "Medical, scientific, structured text and inspector files",
    accept: {
      "application/dicom": [".dcm", ".dicom"],
      "application/x-bittorrent": [".torrent"],
      "application/x-safetensors": [".safetensors"],
      "application/x-gguf": [".gguf"],
      "application/x-har+json": [".har"],
      "text/calendar": [".ics"],
      "text/vcard": [".vcf"],
      "application/x-pem-file": [".pem"],
      "text/markdown": [".md", ".markdown"],
      "text/plain": [".txt", ".log", ".ini", ".diff"],
      "application/json": [".json", ".jsonl", ".ndjson", ".json5"],
      "application/xml": [".xml"],
      "application/yaml": [".yaml", ".yml"],
      "application/toml": [".toml"],
    },
  },
];

export function buildPwaFileHandlers(action: string): WebAppFileHandler[] {
  return PWA_FILE_HANDLER_GROUPS.map((group) => ({
    action,
    name: group.name,
    accept: Object.fromEntries(
      Object.entries(group.accept).map(([mimeType, extensions]) => [mimeType, [...extensions]]),
    ),
    launch_type: "single-client",
  }));
}
