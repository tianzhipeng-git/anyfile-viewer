import { PLUGIN_FILE_KINDS, type FileTypeKind } from "@/lib/plugin-taxonomy";
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

export type { FileTypeKind };

type FileTypeRule = {
  kind: FileTypeKind;
  icon: LucideIcon;
  extensions: readonly string[];
  fileNames?: readonly string[];
};

const manifestsById = new Map(viewerRegistrations.map(({ manifest }) => [manifest.id, manifest]));

// Icons per kind; every kind emitted by the taxonomy must be listed here.
const KIND_ICONS: Record<Exclude<FileTypeKind, "unknown">, LucideIcon> = {
  spreadsheet: SheetIcon,
  image: FileImageIcon,
  video: FileVideoIcon,
  presentation: PresentationIcon,
  document: FileTextIcon,
  design: PaletteIcon,
  code: FileCodeIcon,
  developer: BracesIcon,
  database: DatabaseIcon,
  audio: FileAudioIcon,
  model: BoxIcon,
  font: TypeIcon,
  archive: FileArchiveIcon,
  binary: BinaryIcon,
};

// Extensions shown in the tree for anticipated formats that have no plugin yet,
// appended to their kind's derived list.
const EXTRA_KIND_EXTENSIONS: Partial<Record<FileTypeKind, readonly string[]>> = {
  spreadsheet: [".csv.gz", ".csv.zst", ".tsv.gz", ".tsv.zst", ".tab.gz", ".tab.zst"],
  code: [".json.gz", ".json.zst", ".jsonl.gz", ".jsonl.zst", ".ndjson.gz", ".ndjson.zst"],
  model: [".obj", ".gltf", ".glb", ".stl", ".fbx", ".dae", ".3ds", ".usdz"],
  design: [".ai", ".psb", ".fig", ".sketch", ".xd", ".indd"],
  font: [".ttf", ".otf", ".woff", ".woff2", ".eot"],
  binary: [".bin", ".dmg", ".iso"],
};

// Extensions owned by another rule despite appearing in a plugin's manifest.
const KIND_EXCLUDED_EXTENSIONS: Partial<Record<FileTypeKind, ReadonlySet<string>>> = {
  spreadsheet: new Set([".txt", ".xml"]),
  document: new Set([".ai", ".zip"]),
  video: new Set([".ts"]),
  audio: new Set([".mp4", ".webm", ".ogg"]),
};

// Derive one rule per kind in taxonomy order, gathering each manifest-backed
// plugin's extensions (honouring per-entry only/exclude) plus the extra hints.
const FILE_TYPE_RULES: readonly FileTypeRule[] = (() => {
  const byKind = new Map<FileTypeKind, { extensions: string[]; fileNames: string[] }>();
  // `font` has no plugin (literal extensions only) but needs its own rule.
  const order: FileTypeKind[] = ["font"];
  byKind.set("font", { extensions: [], fileNames: [] });

  for (const { id, kind, only, exclude } of PLUGIN_FILE_KINDS) {
    let bucket = byKind.get(kind);
    if (!bucket) {
      bucket = { extensions: [], fileNames: [] };
      byKind.set(kind, bucket);
      order.push(kind);
    }
    const manifest = manifestsById.get(id);
    if (!manifest) throw new Error(`Unknown viewer manifest id in file-type-icon: ${id}`);
    for (const format of manifest.formats) {
      for (const extension of format.extensions) {
        if (extension === "*") continue;
        if (only && !only.includes(extension)) continue;
        if (exclude?.includes(extension)) continue;
        if (KIND_EXCLUDED_EXTENSIONS[kind]?.has(extension)) continue;
        if (!bucket.extensions.includes(extension)) bucket.extensions.push(extension);
      }
      if (kind === "code") bucket.fileNames.push(...(format.fileNames ?? []));
    }
  }

  return order.map((kind) => {
    const bucket = byKind.get(kind)!;
    const extensions = [...bucket.extensions];
    for (const extra of EXTRA_KIND_EXTENSIONS[kind] ?? []) {
      if (!extensions.includes(extra)) extensions.push(extra);
    }
    return {
      kind,
      icon: KIND_ICONS[kind as Exclude<FileTypeKind, "unknown">],
      extensions,
      fileNames: bucket.fileNames.length > 0 ? bucket.fileNames : undefined,
    };
  });
})();

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
