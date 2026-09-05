import { fictionBookManifest } from "@anyfile/fictionbook-reader/manifest";
import { epubManifest } from "@anyfile/epub-reader/manifest";
import { comicBookManifest } from "@anyfile/comic-book-reader/manifest";
import { cadExchangeManifest } from "@anyfile/cad-exchange-viewer/manifest";
import { pointCloudManifest } from "@anyfile/point-cloud-viewer/manifest";
import { print3dManifest } from "@anyfile/print-3d-viewer/manifest";
import { mesh3dManifest } from "@anyfile/mesh-3d-viewer/manifest";
import { archiveMetadataManifest } from "@anyfile/archive-metadata-viewer/manifest";
import { browserAudioManifest } from "@anyfile/browser-audio-viewer/manifest";
import { browserImageManifest } from "@anyfile/browser-image-viewer/manifest";
import { browserVideoManifest } from "@anyfile/browser-video-viewer/manifest";
import { cad2dManifest } from "@anyfile/cad-2d-viewer/manifest";
import { cameraRawManifest } from "@anyfile/camera-raw-viewer/manifest";
import { codeManifest } from "@anyfile/code-viewer/manifest";
import { dataManifest } from "@anyfile/data-viewer/manifest";
import { devArrayManifest } from "@anyfile/dev-array-viewer/manifest";
import { devSourceMapManifest } from "@anyfile/dev-source-map-viewer/manifest";
import { devWasmManifest } from "@anyfile/dev-wasm-viewer/manifest";
import { djiOsmoManifest } from "@anyfile/dji-osmo-viewer/manifest";
import { excelManifest } from "@anyfile/excel-viewer/manifest";
import { generalRasterManifest } from "@anyfile/general-raster-viewer/manifest";
import { goProMaxManifest } from "@anyfile/gopro-max-viewer/manifest";
import { harManifest } from "@anyfile/har-viewer/manifest";
import { insta360Manifest } from "@anyfile/insta360-viewer/manifest";
import { modernRasterManifest } from "@anyfile/modern-raster-viewer/manifest";
import { nonNativeVideoManifest } from "@anyfile/non-native-video-viewer/manifest";
import { nonNativeAudioManifest } from "@anyfile/non-native-audio-viewer/manifest";
import { pdfManifest } from "@anyfile/pdf-viewer/manifest";
import { photoshopManifest } from "@anyfile/photoshop-viewer/manifest";
import { pixelmatorPxdManifest } from "@anyfile/pixelmator-pxd-viewer/manifest";
import { postscriptManifest } from "@anyfile/postscript-viewer/manifest";
import { powerpointManifest } from "@anyfile/powerpoint-viewer/manifest";
import { safeSvgManifest } from "@anyfile/safe-svg-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";
import { wordManifest } from "@anyfile/word-viewer/manifest";
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

function manifestExtensions(...manifests: readonly ViewerPluginManifest[]) {
  return manifests.flatMap((manifest) =>
    manifest.formats.flatMap((format) => format.extensions.filter((extension) => extension !== "*"))
  );
}

function manifestFileNames(...manifests: readonly ViewerPluginManifest[]) {
  return manifests.flatMap((manifest) =>
    manifest.formats.flatMap((format) => format.fileNames ?? [])
  );
}

const SPREADSHEET_EXTENSIONS = manifestExtensions(excelManifest)
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
      ...djiOsmoManifest.formats.flatMap((format) => format.extensions).filter((extension) => extension === ".jpg" || extension === ".jpeg"),
      ...goProMaxManifest.formats.flatMap((format) => format.extensions).filter((extension) => extension === ".jpg" || extension === ".jpeg"),
      ...insta360Manifest.formats.flatMap((format) => format.extensions).filter((extension) => extension === ".insp" || extension === ".dng"),
      ...manifestExtensions(
      browserImageManifest,
      modernRasterManifest,
      cameraRawManifest,
      generalRasterManifest,
      safeSvgManifest,
      ),
    ],
  },
  {
    kind: "video",
    icon: FileVideoIcon,
    // `.ts` is far more commonly a TypeScript source file; the content probe still
    // routes real MPEG-TS files to the video viewer.
    extensions: [
      ...djiOsmoManifest.formats.flatMap((format) => format.extensions).filter((extension) => extension === ".osv"),
      ...goProMaxManifest.formats.flatMap((format) => format.extensions).filter((extension) => extension === ".360"),
      ...insta360Manifest.formats.flatMap((format) => format.extensions).filter((extension) => extension === ".lrv" || extension === ".insv"),
      ...manifestExtensions(browserVideoManifest, nonNativeVideoManifest)
        .filter((extension) => extension !== ".ts"),
    ],
  },
  {
    kind: "presentation",
    icon: PresentationIcon,
    extensions: manifestExtensions(powerpointManifest),
  },
  {
    kind: "document",
    icon: FileTextIcon,
    extensions: manifestExtensions(pdfManifest, postscriptManifest, wordManifest, fictionBookManifest, epubManifest, comicBookManifest)
      .filter((extension) => extension !== ".ai" && extension !== ".zip"),
  },
  {
    kind: "code",
    icon: FileCodeIcon,
    extensions: [
      ".json.gz", ".json.zst", ".jsonl.gz", ".jsonl.zst", ".ndjson.gz", ".ndjson.zst",
      ...manifestExtensions(codeManifest, harManifest),
    ],
    fileNames: manifestFileNames(codeManifest),
  },
  {
    kind: "developer",
    icon: BracesIcon,
    extensions: manifestExtensions(devArrayManifest, devSourceMapManifest, devWasmManifest),
  },
  {
    kind: "database",
    icon: DatabaseIcon,
    extensions: manifestExtensions(sqliteManifest, dataManifest),
  },
  {
    kind: "audio",
    icon: FileAudioIcon,
    extensions: manifestExtensions(browserAudioManifest, nonNativeAudioManifest)
      .filter((extension) => ![".mp4", ".webm", ".ogg"].includes(extension)),
  },
  {
    kind: "model",
    icon: BoxIcon,
    extensions: [...manifestExtensions(cadExchangeManifest, mesh3dManifest, print3dManifest, pointCloudManifest), ".obj", ".gltf", ".glb", ".stl", ".fbx", ".dae", ".3ds", ".usdz"],
  },
  {
    kind: "design",
    icon: PaletteIcon,
    extensions: [
      ...manifestExtensions(pixelmatorPxdManifest, photoshopManifest, cad2dManifest),
      ...pdfManifest.formats.flatMap((format) => format.extensions).filter((extension) => extension === ".ai"),
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
    extensions: manifestExtensions(archiveMetadataManifest),
  },
  {
    kind: "binary",
    icon: BinaryIcon,
    extensions: [".bin", ".exe", ".dll", ".so", ".dylib", ".dmg", ".iso"],
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
