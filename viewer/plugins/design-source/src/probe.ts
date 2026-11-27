import {
  abortError,
  readBlob,
  type ProbeViewerContext,
  type ViewerSupportLevel,
} from "@anyfile/viewer-protocol";

const PROBE_HEAD_BYTES = 16;
const PROBE_TAIL_BYTES = 256 * 1024;
const ZIP_LOCAL_SIG = 0x04034b50;
const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CD_SIG = 0x02014b50;

const FIG_MAGICS = ["fig-kiwi", "fig-jam.", "fig-deck"];
const SQLITE_MAGIC = "SQLite format 3\0";
const SKETCH_DOC_JSON = ["docu", "ment.json"].join("");

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return out;
}

function uint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function uint16LE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)) >>> 0;
}

export function isRawFigHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const magic = ascii(bytes, 0, 8);
  return FIG_MAGICS.includes(magic);
}

function parseZipEntryNamesFromTail(
  tail: Uint8Array,
  fileSize: number,
): { hasEocd: boolean; names: string[] | null } {
  // Search backwards for End of Central Directory (EOCD) record
  const minOffset = Math.max(0, tail.length - 65557);
  let eocdOffset = -1;
  for (let i = tail.length - 22; i >= minOffset; i -= 1) {
    if (uint32LE(tail, i) === ZIP_EOCD_SIG) {
      const commentLen = uint16LE(tail, i + 20);
      if (i + 22 + commentLen === tail.length) {
        eocdOffset = i;
        break;
      }
    }
  }
  if (eocdOffset < 0) return { hasEocd: false, names: null };

  const cdSize = uint32LE(tail, eocdOffset + 12);
  const cdOffset = uint32LE(tail, eocdOffset + 16);
  const tailStartInFile = fileSize - tail.length;
  const cdLocalStart = cdOffset - tailStartInFile;
  if (cdLocalStart < 0 || cdLocalStart + cdSize > eocdOffset) {
    return { hasEocd: true, names: null };
  }

  const names: string[] = [];
  let cursor = cdLocalStart;
  const end = cdLocalStart + cdSize;
  const decoder = new TextDecoder();
  while (cursor + 46 <= end && names.length < 2048) {
    if (uint32LE(tail, cursor) !== ZIP_CD_SIG) break;
    const nameLen = uint16LE(tail, cursor + 28);
    const extraLen = uint16LE(tail, cursor + 30);
    const commentLen = uint16LE(tail, cursor + 32);
    const nameStart = cursor + 46;
    if (nameStart + nameLen > end) break;
    names.push(decoder.decode(tail.subarray(nameStart, nameStart + nameLen)));
    cursor = nameStart + nameLen + extraLen + commentLen;
  }
  return { hasEocd: true, names };
}

function parseZipEntryNamesFromHead(head: Uint8Array): string[] {
  const names: string[] = [];
  let cursor = 0;
  const decoder = new TextDecoder();
  while (cursor + 30 <= head.length && names.length < 64) {
    if (uint32LE(head, cursor) !== ZIP_LOCAL_SIG) break;
    const flags = uint16LE(head, cursor + 6);
    const compSize = uint32LE(head, cursor + 18);
    const nameLen = uint16LE(head, cursor + 26);
    const extraLen = uint16LE(head, cursor + 28);
    const nameStart = cursor + 30;
    if (nameStart + nameLen > head.length) break;
    names.push(decoder.decode(head.subarray(nameStart, nameStart + nameLen)));
    if ((flags & 0x08) !== 0) break; // data descriptor means compSize may be 0
    cursor = nameStart + nameLen + extraLen + compSize;
  }
  return names;
}

export async function probeDesignSource(
  context: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (context.signal.aborted) throw abortError();
  const { file, signal } = context;
  const lower = file.name.toLowerCase();
  const isFig = lower.endsWith(".fig");
  const isSketch = lower.endsWith(".sketch");
  if (!isFig && !isSketch) return 0;
  if (file.size < 16) return 0;

  const head = await readBlob(file.slice(0, Math.min(file.size, PROBE_HEAD_BYTES)), signal);
  if (signal.aborted) throw abortError();

  // Reject legacy pre-Sketch-43 SQLite .sketch files
  if (isSketch && ascii(head, 0, 16) === SQLITE_MAGIC) {
    return 0;
  }

  // Raw fig-kiwi / fig-jam. / fig-deck binary stream (not wrapped in ZIP)
  if (isFig && isRawFigHeader(head)) {
    return 3;
  }

  // ZIP container check
  if (uint32LE(head, 0) !== ZIP_LOCAL_SIG) {
    return 0;
  }

  const tailStart = Math.max(0, file.size - PROBE_TAIL_BYTES);
  const tail = await readBlob(file.slice(tailStart, file.size), signal);
  if (signal.aborted) throw abortError();

  const parsed = parseZipEntryNamesFromTail(tail, file.size);
  if (!parsed.hasEocd) return 0;

  let names = parsed.names;
  if (!names) {
    // Valid EOCD exists, but Central Directory is larger than 256 KiB tail window
    const scanHead =
      tailStart === 0
        ? tail
        : await readBlob(file.slice(0, Math.min(file.size, 64 * 1024)), signal);
    if (signal.aborted) throw abortError();
    names = parseZipEntryNamesFromHead(scanHead);
  }

  if (names.length === 0) return 0;
  const normalized = new Set(names.map((n) => n.replace(/^\/+/, "")));

  if (isFig) {
    if (normalized.has("canvas.fig")) return 3;
    // Some Figma exports may only have meta.json + thumbnail.png
    if (normalized.has("meta.json") && normalized.has("thumbnail.png")) return 2;
    return 0;
  }

  // .sketch
  const hasDocOrMeta = normalized.has(SKETCH_DOC_JSON) || normalized.has("meta.json");
  const hasPages = names.some((n) => /^pages\/[^/]+\.json$/i.test(n.replace(/^\/+/, "")));
  if (hasDocOrMeta && hasPages) return 3;
  if (normalized.has(SKETCH_DOC_JSON) && normalized.has("meta.json")) return 3;
  return 0;
}
