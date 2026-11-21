import { ViewerError } from "@anyfile/viewer-protocol";
import { CHM_LIMITS } from "./limits";

export interface ChmEntry {
  readonly path: string;
  readonly lowerPath: string;
  readonly section: 0 | 1;
  readonly offset: number;
  readonly length: number;
}

export interface ChmDirectory {
  readonly version: number;
  readonly lcid: number;
  readonly contentOffset: number;
  readonly entries: readonly ChmEntry[];
  readonly byExactPath: ReadonlyMap<string, ChmEntry>;
  readonly byLowerPath: ReadonlyMap<string, ChmEntry>;
}

const textDecoder = new TextDecoder("utf-8", { fatal: true });

function readUint64Safe(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  if (high > 0x001fffff) {
    throw new ViewerError("invalid-file", "CHM 64-bit offset exceeds safe bounds.");
  }
  return high * 2 ** 32 + low;
}

function readEncInt(bytes: Uint8Array, state: { pos: number }, end: number): number {
  let value = 0;
  let count = 0;
  while (state.pos < end) {
    const byte = bytes[state.pos++];
    count += 1;
    if (count > 8) {
      throw new ViewerError("invalid-file", "CHM encint exceeds 64-bit limit.");
    }
    if (value > 0x0003ffffffffff) {
      throw new ViewerError("invalid-file", "CHM encint overflows safe integer.");
    }
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new ViewerError("invalid-file", "Truncated CHM encint.");
}

async function readFileSlice(
  file: File,
  start: number,
  end: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (start < 0 || end < start || end > file.size) {
    throw new ViewerError("invalid-file", "CHM slice offset out of range.");
  }
  const buffer = await file.slice(start, end).arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return new Uint8Array(buffer);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

function parsePmglChunk(
  chunk: Uint8Array,
  entries: ChmEntry[],
  byExactPath: Map<string, ChmEntry>,
  byLowerPath: Map<string, ChmEntry>,
): number {
  if (ascii(chunk, 0, 4) !== "PMGL") {
    throw new ViewerError("invalid-file", "Expected PMGL directory chunk.");
  }
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const freeSpace = view.getUint32(0x04, true);
  const nextChunk = view.getInt32(0x10, true);
  if (freeSpace < 2 || freeSpace > chunk.byteLength - 0x14) {
    throw new ViewerError("invalid-file", "Invalid PMGL free space.");
  }
  const entriesEnd = chunk.byteLength - freeSpace;
  const state = { pos: 0x14 };

  while (state.pos < entriesEnd) {
    const nameLen = readEncInt(chunk, state, entriesEnd);
    if (nameLen === 0 || state.pos + nameLen > entriesEnd) {
      throw new ViewerError("invalid-file", "Invalid CHM entry name length.");
    }
    const nameBytes = chunk.subarray(state.pos, state.pos + nameLen);
    state.pos += nameLen;
    let path: string;
    try {
      path = textDecoder.decode(nameBytes);
    } catch {
      throw new ViewerError("invalid-file", "Invalid UTF-8 in CHM entry path.");
    }
    if (!path || path.includes("\0")) {
      throw new ViewerError("invalid-file", "Invalid CHM entry path.");
    }

    const section = readEncInt(chunk, state, entriesEnd);
    if (section !== 0 && section !== 1) {
      throw new ViewerError("invalid-file", "Unsupported CHM section number.");
    }
    const offset = readEncInt(chunk, state, entriesEnd);
    const length = readEncInt(chunk, state, entriesEnd);

    if (entries.length >= CHM_LIMITS.maxEntries) {
      throw new ViewerError("resource-limit", "CHM entry count limit exceeded.");
    }

    const entry: ChmEntry = {
      path,
      lowerPath: path.toLowerCase(),
      section,
      offset,
      length,
    };
    entries.push(entry);
    if (!byExactPath.has(entry.path)) byExactPath.set(entry.path, entry);
    if (!byLowerPath.has(entry.lowerPath)) byLowerPath.set(entry.lowerPath, entry);
  }

  return nextChunk;
}

export async function parseChmDirectory(file: File, signal: AbortSignal): Promise<ChmDirectory> {
  if (file.size > CHM_LIMITS.maxFileBytes) {
    throw new ViewerError("resource-limit", "CHM file exceeds 128 MiB limit.");
  }
  if (file.size < 0x58 + 0x54) {
    throw new ViewerError("invalid-file", "File is too small to be a CHM archive.");
  }

  const header = await readFileSlice(file, 0, Math.min(file.size, 0x60), signal);
  if (ascii(header, 0, 4) !== "ITSF") {
    throw new ViewerError("invalid-file", "Missing ITSF signature.");
  }
  const hView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const version = hView.getUint32(0x04, true);
  const headerLength = hView.getUint32(0x08, true);
  if (version === 2) {
    if (headerLength < 0x58 || headerLength > CHM_LIMITS.maxHeaderBytes) {
      throw new ViewerError("invalid-file", "Invalid ITSF v2 header length.");
    }
  } else if (version === 3) {
    if (headerLength < 0x60 || headerLength > CHM_LIMITS.maxHeaderBytes || header.byteLength < 0x60) {
      throw new ViewerError("invalid-file", "Invalid ITSF v3 header length.");
    }
  } else {
    throw new ViewerError("invalid-file", "Unsupported ITSF version.");
  }

  const headerLcid = hView.getUint32(0x14, true);
  // Validate section 0 bounds even though section 0 data spans from contentOffset.
  readUint64Safe(hView, 0x38);
  readUint64Safe(hView, 0x40);
  const dirOffset = readUint64Safe(hView, 0x48);
  const dirLength = readUint64Safe(hView, 0x50);

  if (dirOffset < headerLength || dirLength < 0x54 || dirOffset + dirLength > file.size) {
    throw new ViewerError("invalid-file", "CHM directory bounds out of range.");
  }

  const contentOffset = version >= 3 ? readUint64Safe(hView, 0x58) : dirOffset + dirLength;
  if (contentOffset < dirOffset + dirLength || contentOffset > file.size) {
    throw new ViewerError("invalid-file", "Invalid CHM content offset.");
  }

  const itsp = await readFileSlice(file, dirOffset, dirOffset + 0x54, signal);
  if (ascii(itsp, 0, 4) !== "ITSP") {
    throw new ViewerError("invalid-file", "Missing ITSP directory header.");
  }
  const dView = new DataView(itsp.buffer, itsp.byteOffset, itsp.byteLength);
  const itspVersion = dView.getUint32(0x04, true);
  const itspLen = dView.getUint32(0x08, true);
  const chunkSize = dView.getUint32(0x10, true);
  const firstPmgl = dView.getInt32(0x20, true);
  const lastPmgl = dView.getInt32(0x24, true);
  const numChunks = dView.getUint32(0x2c, true);
  const dirLcid = dView.getUint32(0x30, true);

  if (itspVersion !== 1 || itspLen < 0x54 || itspLen > CHM_LIMITS.maxHeaderBytes) {
    throw new ViewerError("invalid-file", "Invalid ITSP header.");
  }
  if (chunkSize < 64 || chunkSize > 65536) {
    throw new ViewerError("invalid-file", "Unsupported CHM directory chunk size.");
  }
  if (numChunks > CHM_LIMITS.maxDirChunks) {
    throw new ViewerError("resource-limit", "CHM directory chunk count exceeds limit.");
  }
  const chunksStart = dirOffset + itspLen;
  if (chunksStart + numChunks * chunkSize > dirOffset + dirLength) {
    throw new ViewerError("invalid-file", "CHM directory chunks exceed directory bounds.");
  }

  const entries: ChmEntry[] = [];
  const byExactPath = new Map<string, ChmEntry>();
  const byLowerPath = new Map<string, ChmEntry>();

  if (numChunks > 0 && firstPmgl >= 0) {
    if (firstPmgl >= numChunks || (lastPmgl >= 0 && lastPmgl >= numChunks)) {
      throw new ViewerError("invalid-file", "CHM PMGL chunk index out of range.");
    }
    const visited = new Set<number>();
    let current = firstPmgl;
    while (current >= 0) {
      if (current >= numChunks || visited.has(current)) {
        throw new ViewerError("invalid-file", "CHM directory chunk loop or invalid link.");
      }
      visited.add(current);
      const offset = chunksStart + current * chunkSize;
      const chunk = await readFileSlice(file, offset, offset + chunkSize, signal);
      const next = parsePmglChunk(chunk, entries, byExactPath, byLowerPath);
      if (current === lastPmgl) {
        if (next >= 0) {
          throw new ViewerError("invalid-file", "CHM directory chunk loop or trailing link.");
        }
        break;
      }
      current = next;
    }
  }

  return {
    version,
    lcid: dirLcid || headerLcid,
    contentOffset,
    entries,
    byExactPath,
    byLowerPath,
  };
}
