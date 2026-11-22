import { viewerRegistrations } from "@/lib/viewer-registrations";
import {
  BinaryIcon,
  BracesIcon,
  BoxIcon,
  DatabaseIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  PaletteIcon,
  PresentationIcon,
  SheetIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";

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

type FileTypeRule = {
  kind: FileTypeKind;
  icon: LucideIcon;
  extensions: readonly string[];
  fileNames?: readonly string[];
};

const manifestsById = new Map(viewerRegistrations.map(({ manifest }) => [manifest.id, manifest]));

function pluginManifest(id: string) {
  const manifest = manifestsById.get(id);
  if (!manifest) throw new Error(`Unknown viewer manifest id in file-type-icon: ${id}`);
  return manifest;
}

function pluginExtensions(...ids: readonly string[]) {
  return ids.flatMap((id) =>
    pluginManifest(id).formats.flatMap((format) => format.extensions.filter((extension) => extension !== "*"))
  );
}

function pluginFileNames(...ids: readonly string[]) {
  return ids.flatMap((id) =>
    pluginManifest(id).formats.flatMap((format) => format.fileNames ?? [])
  );
}

const SPREADSHEET_EXTENSIONS = pluginExtensions("excel-workbook")
  .filter((extension) => extension !== ".txt" && extension !== ".xml");

// Rules are ordered by semantic specificity. This keeps files such as .docx
// and .csv.gz from being represented only by their outer ZIP/gzip container.
const FILE_TYPE_RULES: readonly FileTypeRule[] = [
  {
    kind: "spreadsheet",
    icon: SheetIcon,
    extensions: [
      ".csv.gz", ".csv.zst", ".tsv.gz", ".tsv.zst", ".tab.gz", ".tab.zst",
      ...SPREADSHEET_EXTENSIONS,
    ],
  },
  {
    kind: "image",
    icon: FileImageIcon,
    extensions: [
      ...pluginExtensions("dji-osmo", "gopro-max").filter((extension) => extension === ".jpg" || extension === ".jpeg"),
      ...pluginExtensions("insta360").filter((extension) => extension === ".insp" || extension === ".dng"),
      ...pluginExtensions("browser-image", "modern-raster", "camera-raw", "general-raster", "dicom", "safe-svg"),
    ],
  },
  {
    kind: "video",
    icon: FileVideoIcon,
    // `.ts` is far more commonly a TypeScript source file; the content probe still
    // routes real MPEG-TS files to the video viewer.
    extensions: [
      ...pluginExtensions("dji-osmo").filter((extension) => extension === ".osv"),
      ...pluginExtensions("gopro-max").filter((extension) => extension === ".360"),
      ...pluginExtensions("insta360").filter((extension) => extension === ".lrv" || extension === ".insv"),
      ...pluginExtensions("browser-video", "non-native-video", "ffmpeg-video")
        .filter((extension) => extension !== ".ts"),
    ],
  },
  {
    kind: "presentation",
    icon: PresentationIcon,
    extensions: [
      ...pluginExtensions("powerpoint-presentation"),
      ...pluginExtensions("legacy-office").filter((extension) => extension === ".ppt"),
    ],
  },
  {
    kind: "document",
    icon: FileTextIcon,
    extensions: [
      ...pluginExtensions(
        "pdfjs-pdf", "postscript-document", "word-document", "microsoft-project",
        "mobi-reader", "fictionbook-reader", "epub-reader", "chm-reader",
        "djvu-reader", "comic-book-reader", "calendar-contacts",
      ),
      ...pluginExtensions("legacy-office").filter((extension) => extension !== ".ppt"),
    ].filter((extension) => extension !== ".ai" && extension !== ".zip"),
  },
  {
    kind: "design",
    icon: PaletteIcon,
    extensions: pluginExtensions("mind-map"),
  },
  {
    kind: "code",
    icon: FileCodeIcon,
    extensions: [
      ".json.gz", ".json.zst", ".jsonl.gz", ".jsonl.zst", ".ndjson.gz", ".ndjson.zst",
      ...pluginExtensions("ace-code-text", "http-archive"),
    ],
    fileNames: pluginFileNames("ace-code-text"),
  },
  {
    kind: "developer",
    icon: BracesIcon,
    extensions: pluginExtensions(
      "dev-array-viewer", "dev-source-map-viewer", "dev-wasm-viewer",
      "x509-certificate", "bittorrent-metadata", "ml-weights",
    ),
  },
  {
    kind: "database",
    icon: DatabaseIcon,
    extensions: pluginExtensions("sqlite-database", "duckdb-data"),
  },
  {
    kind: "audio",
    icon: FileAudioIcon,
    extensions: pluginExtensions("browser-audio", "non-native-audio", "ffmpeg-audio")
      .filter((extension) => ![".mp4", ".webm", ".ogg"].includes(extension)),
  },
  {
    kind: "model",
    icon: BoxIcon,
    extensions: [
      ...pluginExtensions("ifc", "cad-exchange", "mesh-3d", "print-3d", "point-cloud"),
      ".obj", ".gltf", ".glb", ".stl", ".fbx", ".dae", ".3ds", ".usdz",
    ],
  },
  {
    kind: "design",
    icon: PaletteIcon,
    extensions: [
      ...pluginExtensions("visio", "pixelmator-pxd", "photoshop-document", "cad-2d", "cad-dwg"),
      ...pluginExtensions("pdfjs-pdf").filter((extension) => extension === ".ai"),
      ".psb", ".fig", ".sketch", ".xd", ".indd",
    ],
  },
  {
    kind: "font",
    icon: TypeIcon,
    extensions: [".ttf", ".otf", ".woff", ".woff2", ".eot"],
  },
  {
    kind: "archive",
    icon: FileArchiveIcon,
    extensions: pluginExtensions("archive-metadata-viewer"),
  },
  {
    kind: "binary",
    icon: BinaryIcon,
    extensions: [
      ".bin", ".dmg", ".iso",
      ...pluginExtensions("dev-native-binary-viewer").filter((extension) => extension !== ".obj"),
    ],
  },
];

function findFileTypeRule(fileName: string) {
  const normalizedName = fileName.toLowerCase();

  return FILE_TYPE_RULES.find((rule) =>
    rule.fileNames?.some((candidate) => candidate.toLowerCase() === normalizedName)
    || rule.extensions.some((extension) => normalizedName.endsWith(extension))
  );
}

export function getFileTypeKind(fileName: string): FileTypeKind {
  return findFileTypeRule(fileName)?.kind ?? "unknown";
}

export function FileTypeIcon({ fileName }: { fileName: string }) {
  const Icon = findFileTypeRule(fileName)?.icon ?? FileIcon;

  return <Icon className="size-4 shrink-0" aria-hidden="true" />;
}
