import {
  AgentError,
  ViewerError,
  abortError,
  isViewerAbortError,
  paginateLines,
  paginateText,
  parsePositionCursor,
  renderMarkdownTablePage,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

import { readMemberPrefix } from "./extract-members";
import { identifyArchive, parseArchive } from "./parse";
import { RangeReader } from "./range-reader";
import type { ArchiveEntry, ArchiveMetadata, IdentifiedFormat } from "./types";

const PLUGIN_ID = "archive-metadata-viewer";
const MAX_ENTRY_TARGETS = 50;
/** Member text is decompressed at most this far; larger members are cut with a notice. */
const MEMBER_TEXT_CAP = 1024 * 1024;
const ENTRY_PREFIX = "entry:";
const ENTRY_COLUMNS = ["Path", "Type", "Size", "Packed", "Modified", "Method", "Notes"];

/** Parsers label entries for the zh-CN UI; Agent output uses stable English names. */
const LABELS: Readonly<Record<string, string>> = {
  文件: "file", 目录: "directory", 符号链接: "symlink", 硬链接: "hardlink", 字符设备: "char-device",
  块设备: "block-device", FIFO: "fifo", "GNU 稀疏文件": "sparse-file", 未压缩: "Stored", 存储: "Stored",
  最快: "Fastest", 较快: "Fast", 标准: "Normal", 较好: "Good", 最好: "Best",
};
const label = (value: string | undefined) => (value === undefined ? undefined : LABELS[value] ?? value);

interface LoadedArchive {
  readonly format: IdentifiedFormat;
  readonly metadata: ArchiveMetadata;
  readonly entries: readonly ArchiveEntry[];
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ViewerError && error.code === "resource-limit") {
    throw new AgentError("resource-limit", "The archive exceeds metadata safety limits.", { pluginId: PLUGIN_ID, cause: error });
  }
  if (error instanceof ViewerError && error.code === "unsupported-environment") {
    throw new AgentError("runtime-unavailable", "This runtime cannot process this archive format.", {
      pluginId: PLUGIN_ID,
      cause: error,
    });
  }
  throw new AgentError("invalid-file", "The file is damaged or is not a supported archive format.", {
    pluginId: PLUGIN_ID,
    cause: error,
  });
}

async function load(context: ExtractContext): Promise<LoadedArchive> {
  if (context.signal.aborted) throw abortError();
  try {
    if (context.file.size === 0) throw new ViewerError("invalid-file", "Empty file.");
    const reader = new RangeReader(context.file, context.signal);
    const format = await identifyArchive(context.file, reader);
    const metadata = await parseArchive(context.file, reader, format, context.signal);
    return { format, metadata, entries: metadata.entries ?? [] };
  } catch (error) {
    mapError(error);
  }
}

const isFile = (entry: ArchiveEntry) => label(entry.type) === "file";
/** RAR bodies are never decompressed; ZIP/JMOD/TAR/gzip TAR members are. */
const readsMembers = ({ format, metadata }: LoadedArchive) => metadata.kind === "archive" && format.id !== "rar";

function entryNotes(entry: ArchiveEntry): string {
  return [
    entry.encrypted ? "encrypted" : "",
    entry.dangerousPath ? "unsafe path" : "",
    entry.suspiciousCompression ? "high compression ratio" : "",
    entry.linkTarget ? `-> ${entry.linkTarget}` : "",
  ].filter(Boolean).join("; ");
}

function entryRow(entry: ArchiveEntry): string[] {
  const modified = entry.modified && !Number.isNaN(entry.modified.getTime()) ? entry.modified.toISOString() : "";
  return [
    entry.path,
    label(entry.type) ?? "",
    entry.size === undefined ? "" : String(entry.size),
    entry.compressedSize === undefined ? "" : String(entry.compressedSize),
    modified,
    label(entry.method) ?? "",
    entryNotes(entry),
  ];
}

function readEntries(entries: readonly ArchiveEntry[], params: ReadParams): ReadResult {
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  if (start > entries.length) {
    throw new AgentError("target-not-found", `Cursor row ${start} is out of range.`, { pluginId: PLUGIN_ID });
  }
  const needle = params.filter?.trim().toLowerCase();
  const result = renderMarkdownTablePage({
    columns: ENTRY_COLUMNS,
    rows: entries.slice(start).map((entry) => {
      const row = entryRow(entry);
      return !needle || row.some((cell) => cell.toLowerCase().includes(needle)) ? row : null;
    }),
    start,
    maxBytes: params.maxBytes,
    cursorPrefix: "row:",
  });
  return needle ? { ...result, filterApplied: true } : result;
}

function readFields(metadata: ArchiveMetadata, params: ReadParams): ReadResult {
  let lines = [
    `# ${metadata.format}`,
    "",
    `- **Kind**: ${metadata.kind}`,
    `- **Detected by**: ${metadata.detectedBy}`,
    ...metadata.fields.map(({ label: name, value }) => `- **${name}**: ${value}`),
    ...(metadata.limitation ? [`- **Limitation**: ${metadata.limitation}`] : []),
  ];
  const needle = params.filter?.trim().toLowerCase();
  if (needle) lines = lines.filter((line) => line.toLowerCase().includes(needle));
  const page = paginateLines(lines, params.cursor, params.maxBytes, PLUGIN_ID);
  return {
    content: page.content,
    contentType: "markdown",
    truncated: page.truncated,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    ...(needle ? { filterApplied: true } : {}),
  };
}

function decodeText(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    // `stream: true` tolerates a code point split by the size cap.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true }).replace(/^﻿/, "");
  } catch {
    return undefined;
  }
}

async function readMember(context: ExtractContext, archive: LoadedArchive, path: string, params: ReadParams) {
  const entry = archive.entries.find((item) => item.path === path);
  if (!entry) throw new AgentError("target-not-found", `Archive member not found: "${path}".`, { pluginId: PLUGIN_ID });
  let text: string;
  let contentType: ReadResult["contentType"] = "text";
  if (!isFile(entry)) {
    text = `\`${path}\` is a ${label(entry.type)}${entry.linkTarget ? ` pointing to \`${entry.linkTarget}\`` : ""}; it has no content.`;
    contentType = "markdown";
  } else {
    let bytes: Uint8Array;
    try {
      bytes = await readMemberPrefix(context.file, archive.format, entry, MEMBER_TEXT_CAP, context.signal);
    } catch (error) {
      mapError(error);
    }
    const decoded = decodeText(bytes);
    const total = entry.size ?? bytes.byteLength;
    if (decoded === undefined) {
      text = `Binary member \`${path}\` (${total} bytes); content is not shown.`;
      contentType = "markdown";
    } else {
      text = total > bytes.byteLength
        ? `${decoded}\n\n[member truncated: showing the first ${bytes.byteLength} of ${total} bytes]`
        : decoded;
    }
  }
  const page = paginateText(text, params.cursor, params.maxBytes, contentType, PLUGIN_ID);
  return params.filter ? { ...page, filterApplied: false } : page;
}

const archiveExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const archive = await load(context);
    const { metadata, entries } = archive;
    const files = entries.filter(isFile);
    const members = readsMembers(archive) ? files : [];
    const methods = [...new Set(entries.map((entry) => label(entry.method)).filter((value) => value !== undefined))];
    const packed = entries.filter((entry) => entry.compressedSize !== undefined);
    const targets: TargetEntry[] = [];
    if (metadata.entries) targets.push({ id: "entries", title: "Entry listing", kind: "table", size: entries.length });
    targets.push({ id: "fields", title: "Container fields", kind: "metadata", size: metadata.fields.length });
    const seen = new Set<string>();
    for (const entry of members) {
      if (seen.size >= MAX_ENTRY_TARGETS) break;
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      targets.push({ id: `${ENTRY_PREFIX}${entry.path}`, title: entry.path, kind: "entry", size: entry.size });
    }
    const fields: Record<string, JsonValue> = {};
    for (const field of metadata.fields) fields[field.label] = field.value;
    return {
      metadata: {
        format: metadata.format,
        kind: metadata.kind,
        sizeBytes: context.source.size,
        ...(metadata.entries
          ? {
              entryCount: entries.length,
              fileCount: files.length,
              directoryCount: entries.filter((entry) => label(entry.type) === "directory").length,
              totalSize: files.reduce((total, entry) => total + (entry.size ?? 0), 0),
              ...(packed.length
                ? { totalCompressedSize: packed.reduce((total, entry) => total + (entry.compressedSize ?? 0), 0) }
                : {}),
              compression: methods,
              encryptedEntries: entries.filter((entry) => entry.encrypted).length,
              unsafePaths: entries.filter((entry) => entry.dangerousPath).length,
              ...(members.length
                ? { memberTargets: `${ENTRY_PREFIX}<path> reads one text member (first ${MEMBER_TEXT_CAP} bytes)` }
                : {}),
            }
          : {}),
        ...(metadata.limitation ? { limitation: metadata.limitation } : {}),
        fields,
      },
      targets,
      ...(members.length > seen.size ? { targetsTruncated: true } : {}),
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const archive = await load(context);
    const target = params.target ?? (archive.metadata.entries ? "entries" : "fields");
    if (target === "entries" && archive.metadata.entries) return readEntries(archive.entries, params);
    if (target === "fields") return readFields(archive.metadata, params);
    if (target.startsWith(ENTRY_PREFIX)) return readMember(context, archive, target.slice(ENTRY_PREFIX.length), params);
    throw new AgentError("target-not-found", `Archive target not found: "${target}".`, { pluginId: PLUGIN_ID });
  },
};

export default archiveExtractor;
