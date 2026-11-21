import { decodeUtf16Le, decodeWithCodePage } from "./cp1252";
import { MAX_STREAM_BYTES, type LegacyMetadata } from "./model";

const CFBF_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const MAXREGSECT = 0xfffffffa;

export class CfbfError extends Error {
  readonly code: "invalid-file" | "resource-limit";
  constructor(code: "invalid-file" | "resource-limit", message: string) {
    super(message);
    this.code = code;
  }
}

export interface CfbfDirectoryEntry {
  readonly name: string;
  readonly type: number;
  readonly startSector: number;
  readonly size: number;
}

export interface CfbfArchive {
  readonly entries: readonly CfbfDirectoryEntry[];
  hasStream(name: string): boolean;
  getStream(name: string): Uint8Array | undefined;
  readMetadata(): LegacyMetadata;
}

function readSectorChain(
  bytes: Uint8Array,
  sectorSize: number,
  fat: Int32Array,
  startSector: number,
  expectedSize?: number,
): Uint8Array {
  if (expectedSize !== undefined && expectedSize > MAX_STREAM_BYTES) {
    throw new CfbfError("resource-limit", "CFBF stream exceeds browser memory budget.");
  }
  if (startSector === ENDOFCHAIN || startSector === FREESECT) {
    return new Uint8Array(0);
  }
  const maxSectors = Math.floor((bytes.byteLength - sectorSize) / sectorSize);
  const visited = new Uint8Array(Math.max(1, maxSectors));
  const chunks: Uint8Array[] = [];
  let total = 0;
  let current = startSector >>> 0;

  while (current <= MAXREGSECT) {
    if (current >= maxSectors) {
      throw new CfbfError("invalid-file", "CFBF sector index out of bounds.");
    }
    if (visited[current]) {
      throw new CfbfError("invalid-file", "CFBF FAT chain contains a cycle.");
    }
    visited[current] = 1;
    const offset = (current + 1) * sectorSize;
    const end = Math.min(bytes.byteLength, offset + sectorSize);
    if (offset >= bytes.byteLength) {
      throw new CfbfError("invalid-file", "CFBF sector offset out of bounds.");
    }
    const slice = bytes.subarray(offset, end);
    chunks.push(slice);
    total += slice.byteLength;
    if (total > MAX_STREAM_BYTES + sectorSize) {
      throw new CfbfError("resource-limit", "CFBF stream exceeds browser memory budget.");
    }
    if (expectedSize !== undefined && total >= expectedSize) break;
    current = current < fat.length ? (fat[current]! >>> 0) : ENDOFCHAIN;
  }

  const outLength = expectedSize !== undefined ? Math.min(expectedSize, total) : total;
  const out = new Uint8Array(outLength);
  let writePos = 0;
  for (const chunk of chunks) {
    const remaining = outLength - writePos;
    if (remaining <= 0) break;
    const copyLen = Math.min(chunk.byteLength, remaining);
    out.set(chunk.subarray(0, copyLen), writePos);
    writePos += copyLen;
  }
  return out;
}

function readMiniChain(
  miniStream: Uint8Array,
  miniSectorSize: number,
  miniFat: Int32Array,
  startSector: number,
  expectedSize: number,
): Uint8Array {
  if (expectedSize > MAX_STREAM_BYTES) {
    throw new CfbfError("resource-limit", "CFBF mini-stream exceeds browser memory budget.");
  }
  if (expectedSize === 0 || startSector === ENDOFCHAIN || startSector === FREESECT) {
    return new Uint8Array(0);
  }
  const maxMiniSectors = Math.floor(miniStream.byteLength / miniSectorSize);
  const visited = new Uint8Array(Math.max(1, maxMiniSectors));
  const out = new Uint8Array(expectedSize);
  let writePos = 0;
  let current = startSector >>> 0;

  while (current <= MAXREGSECT && writePos < expectedSize) {
    if (current >= maxMiniSectors) {
      throw new CfbfError("invalid-file", "CFBF mini-sector index out of bounds.");
    }
    if (visited[current]) {
      throw new CfbfError("invalid-file", "CFBF MiniFAT chain contains a cycle.");
    }
    visited[current] = 1;
    const offset = current * miniSectorSize;
    const copyLen = Math.min(miniSectorSize, expectedSize - writePos);
    out.set(miniStream.subarray(offset, offset + copyLen), writePos);
    writePos += copyLen;
    current = current < miniFat.length ? (miniFat[current]! >>> 0) : ENDOFCHAIN;
  }
  return out.subarray(0, writePos);
}

function filetimeToIso(low: number, high: number): string | undefined {
  const ticks = (high >>> 0) * 4294967296 + (low >>> 0);
  if (ticks === 0) return undefined;
  const unixMs = ticks / 10000 - 11644473600000;
  if (!Number.isFinite(unixMs) || unixMs < -62135596800000 || unixMs > 253402300799999) {
    return undefined;
  }
  return new Date(unixMs).toISOString().slice(0, 10);
}

function readPropertyString(bytes: Uint8Array, offset: number, type: number, codePage: number): string | undefined {
  if (offset + 8 > bytes.byteLength) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(offset + 4, true);
  if (type === 30) {
    if (len === 0 || offset + 8 + len > bytes.byteLength) return undefined;
    const raw = bytes.subarray(offset + 8, offset + 8 + len);
    const trimmed = raw[raw.length - 1] === 0 ? raw.subarray(0, raw.length - 1) : raw;
    const text = decodeWithCodePage(trimmed, codePage).replace(/\0+$/, "").trim();
    return text || undefined;
  }
  if (type === 31) {
    const byteLen = len * 2;
    if (byteLen === 0 || offset + 8 + byteLen > bytes.byteLength) return undefined;
    const text = decodeUtf16Le(bytes.subarray(offset + 8, offset + 8 + byteLen)).replace(/\0+$/, "").trim();
    return text || undefined;
  }
  return undefined;
}

function parsePropertySet(bytes: Uint8Array): Map<number, string> {
  const result = new Map<number, string>();
  if (bytes.byteLength < 48) return result;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numSections = view.getUint32(24, true);
  if (numSections === 0 || numSections > 16 || 28 + numSections * 20 > bytes.byteLength) return result;

  const sectionOffset = view.getUint32(28 + 16, true);
  if (sectionOffset + 8 > bytes.byteLength) return result;
  const numProps = view.getUint32(sectionOffset + 4, true);
  if (numProps > 256 || sectionOffset + 8 + numProps * 8 > bytes.byteLength) return result;

  let codePage = 1252;
  const props: Array<{ id: number; offset: number }> = [];
  for (let i = 0; i < numProps; i += 1) {
    const base = sectionOffset + 8 + i * 8;
    const id = view.getUint32(base, true);
    const propOff = sectionOffset + view.getUint32(base + 4, true);
    if (propOff + 8 <= bytes.byteLength) {
      props.push({ id, offset: propOff });
      if (id === 1 && view.getUint32(propOff, true) === 2) {
        const cp = view.getInt16(propOff + 4, true) & 0xffff;
        if (cp > 0) codePage = cp;
      }
    }
  }

  for (const { id, offset } of props) {
    const type = view.getUint32(offset, true);
    if (type === 30 || type === 31) {
      const value = readPropertyString(bytes, offset, type, codePage);
      if (value) result.set(id, value);
    } else if (type === 64 && offset + 12 <= bytes.byteLength) {
      const iso = filetimeToIso(view.getUint32(offset + 4, true), view.getUint32(offset + 8, true));
      if (iso) result.set(id, iso);
    }
  }
  return result;
}

export function parseCfbf(bytes: Uint8Array): CfbfArchive {
  if (bytes.byteLength < 512) {
    throw new CfbfError("invalid-file", "File is smaller than a 512-byte CFBF header.");
  }
  for (let i = 0; i < CFBF_MAGIC.length; i += 1) {
    if (bytes[i] !== CFBF_MAGIC[i]) {
      throw new CfbfError("invalid-file", "Missing CFBF signature.");
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const majorVersion = view.getUint16(26, true);
  const byteOrder = view.getUint16(28, true);
  const sectorShift = view.getUint16(30, true);
  const miniSectorShift = view.getUint16(32, true);
  if (byteOrder !== 0xfffe || (sectorShift !== 9 && sectorShift !== 12) || miniSectorShift !== 6) {
    throw new CfbfError("invalid-file", "Unsupported CFBF sector layout.");
  }

  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  if (bytes.byteLength < sectorSize) {
    throw new CfbfError("invalid-file", "Truncated CFBF header sector.");
  }

  const numFatSectors = view.getUint32(44, true);
  const firstDirSector = view.getUint32(48, true);
  const miniStreamCutoff = view.getUint32(56, true);
  const firstMiniFatSector = view.getUint32(60, true);
  const firstDifatSector = view.getUint32(68, true);
  const numDifatSectors = view.getUint32(72, true);
  const maxSectors = Math.floor((bytes.byteLength - sectorSize) / sectorSize);

  if (numFatSectors === 0 || numFatSectors > maxSectors) {
    throw new CfbfError("invalid-file", "Invalid CFBF FAT sector count.");
  }

  const fatSectorList: number[] = [];
  for (let i = 0; i < 109 && fatSectorList.length < numFatSectors; i += 1) {
    const sector = view.getUint32(76 + i * 4, true);
    if (sector <= MAXREGSECT) fatSectorList.push(sector);
  }

  let difatSector = firstDifatSector;
  const visitedDifat = new Set<number>();
  const difatEntriesPerSector = sectorSize / 4 - 1;
  for (let d = 0; d < numDifatSectors && fatSectorList.length < numFatSectors && difatSector <= MAXREGSECT; d += 1) {
    if (difatSector >= maxSectors || visitedDifat.has(difatSector)) {
      throw new CfbfError("invalid-file", "Invalid CFBF DIFAT chain.");
    }
    visitedDifat.add(difatSector);
    const base = (difatSector + 1) * sectorSize;
    for (let i = 0; i < difatEntriesPerSector && fatSectorList.length < numFatSectors; i += 1) {
      const sector = view.getUint32(base + i * 4, true);
      if (sector <= MAXREGSECT) fatSectorList.push(sector);
    }
    difatSector = view.getUint32(base + difatEntriesPerSector * 4, true);
  }

  const intsPerSector = sectorSize / 4;
  const fat = new Int32Array(fatSectorList.length * intsPerSector);
  for (let i = 0; i < fatSectorList.length; i += 1) {
    const sector = fatSectorList[i]!;
    if (sector >= maxSectors) {
      throw new CfbfError("invalid-file", "CFBF FAT sector out of bounds.");
    }
    const base = (sector + 1) * sectorSize;
    for (let j = 0; j < intsPerSector && base + j * 4 + 4 <= bytes.byteLength; j += 1) {
      fat[i * intsPerSector + j] = view.getInt32(base + j * 4, true);
    }
  }

  const dirBytes = readSectorChain(bytes, sectorSize, fat, firstDirSector);
  const entries: CfbfDirectoryEntry[] = [];
  let rootEntry: CfbfDirectoryEntry | undefined;

  for (let off = 0; off + 128 <= dirBytes.byteLength; off += 128) {
    const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 128);
    const nameByteLen = dirView.getUint16(64, true);
    const type = dirBytes[off + 66]!;
    if (type === 0 || nameByteLen < 2 || nameByteLen > 64) continue;
    const name = decodeUtf16Le(dirBytes.subarray(off, off + nameByteLen - 2));
    const startSector = dirView.getUint32(116, true);
    const lowSize = dirView.getUint32(120, true);
    const highSize = majorVersion === 4 ? dirView.getUint32(124, true) : 0;
    const size = highSize > 0 ? highSize * 0x100000000 + lowSize : lowSize;
    const entry: CfbfDirectoryEntry = { name, type, startSector, size };
    entries.push(entry);
    if (type === 5 && !rootEntry) rootEntry = entry;
  }

  let miniStream: Uint8Array | undefined;
  let miniFat: Int32Array | undefined;
  const cache = new Map<string, Uint8Array>();
  const entryMap = new Map<string, CfbfDirectoryEntry>();
  for (const entry of entries) {
    if (entry.type === 2 && !entryMap.has(entry.name)) {
      entryMap.set(entry.name, entry);
    }
  }

  const getStream = (name: string): Uint8Array | undefined => {
    const cached = cache.get(name);
    if (cached) return cached;
    const entry = entryMap.get(name);
    if (!entry) return undefined;
    let streamBytes: Uint8Array;
    if (entry.size === 0) {
      streamBytes = new Uint8Array(0);
    } else if (entry.size < miniStreamCutoff) {
      if (!miniStream) {
        miniStream = rootEntry
          ? readSectorChain(bytes, sectorSize, fat, rootEntry.startSector, rootEntry.size)
          : new Uint8Array(0);
      }
      if (!miniFat) {
        const rawMiniFat = readSectorChain(bytes, sectorSize, fat, firstMiniFatSector);
        miniFat = new Int32Array(Math.floor(rawMiniFat.byteLength / 4));
        const mfView = new DataView(rawMiniFat.buffer, rawMiniFat.byteOffset, rawMiniFat.byteLength);
        for (let i = 0; i < miniFat.length; i += 1) {
          miniFat[i] = mfView.getInt32(i * 4, true);
        }
      }
      streamBytes = readMiniChain(miniStream, miniSectorSize, miniFat, entry.startSector, entry.size);
    } else {
      streamBytes = readSectorChain(bytes, sectorSize, fat, entry.startSector, entry.size);
    }
    cache.set(name, streamBytes);
    return streamBytes;
  };

  return {
    entries,
    hasStream(name: string) {
      return entryMap.has(name);
    },
    getStream,
    readMetadata(): LegacyMetadata {
      const summaryRaw = getStream("\x05SummaryInformation");
      const docSummaryRaw = getStream("\x05DocumentSummaryInformation");
      const summary = summaryRaw ? parsePropertySet(summaryRaw) : new Map<number, string>();
      const docSummary = docSummaryRaw ? parsePropertySet(docSummaryRaw) : new Map<number, string>();
      return {
        title: summary.get(2),
        subject: summary.get(3),
        author: summary.get(4),
        keywords: summary.get(5),
        created: summary.get(12),
        modified: summary.get(13),
        company: docSummary.get(15),
      };
    },
  };
}
