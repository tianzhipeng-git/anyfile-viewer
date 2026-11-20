import { ViewerError } from "@anyfile/viewer-protocol";
import type { ChmDirectory, ChmEntry } from "./itsf";
import { CHM_LIMITS } from "./limits";
import { decompressLzxStream, LZX_FRAME_SIZE, type ControlData } from "./lzx";

export interface ResetTable {
  readonly uncompressedLength: number;
  readonly compressedLength: number;
  readonly frameLength: number;
  readonly offsets: readonly number[];
}

export interface ChmSectionReader {
  readEntry(entry: ChmEntry, maxBytes: number, signal: AbortSignal): Promise<Uint8Array>;
  dispose(): void;
}

function readUint64Checked(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  if (hi > 0x001fffff) {
    throw new ViewerError("invalid-file", "CHM ResetTable 64-bit integer out of range.");
  }
  return hi * 2 ** 32 + lo;
}

export function parseControlData(bytes: Uint8Array): ControlData {
  if (bytes.byteLength < 28) {
    throw new ViewerError("invalid-file", "CHM ControlData is truncated.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[4] !== 0x4c || bytes[5] !== 0x5a || bytes[6] !== 0x58 || bytes[7] !== 0x43) {
    throw new ViewerError("invalid-file", "Invalid CHM LZXC signature.");
  }
  const version = view.getUint32(8, true);
  let resetInterval = view.getUint32(12, true);
  let windowSize = view.getUint32(16, true);
  if (version === 2) {
    resetInterval *= LZX_FRAME_SIZE;
    windowSize *= LZX_FRAME_SIZE;
  } else if (version !== 1) {
    throw new ViewerError("invalid-file", "Unsupported LZXC ControlData version.");
  }

  let windowBits = 0;
  for (let bits = 15; bits <= 21; bits += 1) {
    if (windowSize === 1 << bits) {
      windowBits = bits;
      break;
    }
  }
  if (!windowBits) {
    throw new ViewerError("invalid-file", "Unsupported LZX window size.");
  }
  if (resetInterval === 0 || resetInterval % LZX_FRAME_SIZE !== 0) {
    throw new ViewerError("invalid-file", "Invalid LZX reset interval.");
  }
  if (resetInterval > CHM_LIMITS.maxResetIntervalBytes) {
    throw new ViewerError("resource-limit", "LZX reset interval exceeds budget.");
  }
  return {
    windowBits,
    windowSize,
    resetInterval,
    resetFrames: resetInterval / LZX_FRAME_SIZE,
  };
}

export function parseResetTable(bytes: Uint8Array, compressedContentSize: number): ResetTable {
  if (bytes.byteLength < 40) {
    throw new ViewerError("invalid-file", "CHM ResetTable is truncated.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0x00, true);
  const numEntries = view.getUint32(0x04, true);
  const entrySize = view.getUint32(0x08, true);
  const tableOffset = view.getUint32(0x0c, true);
  const uncompressedLength = readUint64Checked(view, 0x10);
  const compressedLength = readUint64Checked(view, 0x18);
  const frameLength = readUint64Checked(view, 0x20);

  if (version !== 2 || (entrySize !== 4 && entrySize !== 8) || tableOffset < 40) {
    throw new ViewerError("invalid-file", "Invalid CHM ResetTable header.");
  }
  if (numEntries > CHM_LIMITS.maxResetEntries) {
    throw new ViewerError("resource-limit", "CHM ResetTable entry count exceeds budget.");
  }
  if (uncompressedLength > CHM_LIMITS.maxSectionBytes) {
    throw new ViewerError("resource-limit", "CHM uncompressed section exceeds 128 MiB limit.");
  }
  if (compressedLength > compressedContentSize) {
    throw new ViewerError("invalid-file", "CHM ResetTable compressed length exceeds content stream.");
  }
  if (tableOffset + numEntries * entrySize > bytes.byteLength) {
    throw new ViewerError("invalid-file", "CHM ResetTable entries exceed table bounds.");
  }

  const offsets: number[] = [];
  let prev = 0;
  for (let i = 0; i < numEntries; i += 1) {
    const pos = tableOffset + i * entrySize;
    const offset = entrySize === 8 ? readUint64Checked(view, pos) : view.getUint32(pos, true);
    if (offset < prev || offset > compressedContentSize) {
      throw new ViewerError("invalid-file", "Invalid CHM ResetTable entry offset.");
    }
    offsets.push(offset);
    prev = offset;
  }

  return {
    uncompressedLength,
    compressedLength,
    frameLength: frameLength || LZX_FRAME_SIZE,
    offsets,
  };
}

async function sliceFile(file: File, start: number, end: number, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (start < 0 || end < start || end > file.size) {
    throw new ViewerError("invalid-file", "CHM file slice out of bounds.");
  }
  const buffer = await file.slice(start, end).arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return new Uint8Array(buffer);
}

export function createChmSectionReader(file: File, directory: ChmDirectory): ChmSectionReader {
  let lzxInfoPromise: Promise<{
    contentEntry: ChmEntry;
    control: ControlData;
    resetTable: ResetTable | null;
    totalUncompressed: number;
  }> | null = null;

  const intervalCache = new Map<number, Uint8Array>();

  async function readSection0(entry: ChmEntry, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
    if (entry.length > maxBytes) {
      throw new ViewerError("resource-limit", "CHM entry exceeds read budget.");
    }
    if (entry.length === 0) return new Uint8Array(0);
    const start = directory.contentOffset + entry.offset;
    return sliceFile(file, start, start + entry.length, signal);
  }

  async function ensureLzxInfo(signal: AbortSignal) {
    if (lzxInfoPromise) return lzxInfoPromise;
    lzxInfoPromise = (async () => {
      const contentEntry = directory.byLowerPath.get("::dataspace/storage/mscompressed/content");
      const controlEntry = directory.byLowerPath.get("::dataspace/storage/mscompressed/controldata");
      if (!contentEntry || !controlEntry || contentEntry.section !== 0 || controlEntry.section !== 0) {
        throw new ViewerError("invalid-file", "Missing CHM MSCompressed stream metadata.");
      }
      const controlBytes = await readSection0(controlEntry, 1024, signal);
      const control = parseControlData(controlBytes);

      const resetEntry = directory.byLowerPath.get(
        "::dataspace/storage/mscompressed/transform/{7fc28940-9d31-11d0-9b27-00a0c91e9c7c}/instancedata/resettable",
      );
      let resetTable: ResetTable | null = null;
      let totalUncompressed = 0;

      if (resetEntry && resetEntry.section === 0) {
        const resetBytes = await readSection0(resetEntry, 2 * 1024 * 1024, signal);
        resetTable = parseResetTable(resetBytes, contentEntry.length);
        totalUncompressed = resetTable.uncompressedLength;
      } else {
        const spanEntry = directory.byLowerPath.get("::dataspace/storage/mscompressed/spaninfo");
        if (!spanEntry || spanEntry.section !== 0 || spanEntry.length < 8) {
          throw new ViewerError("invalid-file", "Missing CHM ResetTable and SpanInfo.");
        }
        const spanBytes = await readSection0(spanEntry, 64, signal);
        const view = new DataView(spanBytes.buffer, spanBytes.byteOffset, spanBytes.byteLength);
        totalUncompressed = readUint64Checked(view, 0);
      }

      if (totalUncompressed > CHM_LIMITS.maxSectionBytes) {
        throw new ViewerError("resource-limit", "CHM compressed section exceeds 128 MiB limit.");
      }

      return { contentEntry, control, resetTable, totalUncompressed };
    })();

    try {
      return await lzxInfoPromise;
    } catch (error) {
      lzxInfoPromise = null;
      throw error;
    }
  }

  async function readResetInterval(intervalIndex: number, signal: AbortSignal): Promise<Uint8Array> {
    const cached = intervalCache.get(intervalIndex);
    if (cached) {
      intervalCache.delete(intervalIndex);
      intervalCache.set(intervalIndex, cached);
      return cached;
    }

    const info = await ensureLzxInfo(signal);
    const { contentEntry, control, resetTable, totalUncompressed } = info;
    const baseOffset = directory.contentOffset + contentEntry.offset;

    let decoded: Uint8Array;
    if (resetTable && resetTable.offsets.length > 0) {
      const startFrame = intervalIndex * control.resetFrames;
      if (startFrame >= resetTable.offsets.length) {
        throw new ViewerError("invalid-file", "CHM ResetTable frame index out of range.");
      }
      const compressedStart = resetTable.offsets[startFrame];
      const nextFrame = startFrame + control.resetFrames;
      const compressedEnd =
        nextFrame < resetTable.offsets.length
          ? resetTable.offsets[nextFrame]
          : resetTable.compressedLength || contentEntry.length;
      const uncompressedStart = startFrame * LZX_FRAME_SIZE;
      const uncompressedBytes = Math.min(control.resetInterval, totalUncompressed - uncompressedStart);
      if (uncompressedBytes <= 0) {
        throw new ViewerError("invalid-file", "CHM ResetTable interval is empty.");
      }
      const compressed = await sliceFile(file, baseOffset + compressedStart, baseOffset + compressedEnd, signal);
      decoded = decompressLzxStream(compressed, control, uncompressedBytes, signal);
    } else {
      if (intervalIndex !== 0) {
        throw new ViewerError("invalid-file", "CHM missing ResetTable for seek.");
      }
      if (totalUncompressed > CHM_LIMITS.maxResetIntervalBytes) {
        throw new ViewerError("resource-limit", "CHM unseekable compressed stream exceeds budget.");
      }
      const compressed = await sliceFile(file, baseOffset, baseOffset + contentEntry.length, signal);
      decoded = decompressLzxStream(compressed, control, totalUncompressed, signal);
    }

    if (intervalCache.size >= CHM_LIMITS.maxCachedIntervals) {
      const oldestKey = intervalCache.keys().next().value;
      if (oldestKey !== undefined) intervalCache.delete(oldestKey);
    }
    intervalCache.set(intervalIndex, decoded);
    return decoded;
  }

  return {
    async readEntry(entry, maxBytes, signal) {
      if (entry.length > maxBytes) {
        throw new ViewerError("resource-limit", "CHM entry exceeds read budget.");
      }
      if (entry.length === 0) return new Uint8Array(0);
      if (entry.section === 0) {
        return readSection0(entry, maxBytes, signal);
      }

      const info = await ensureLzxInfo(signal);
      if (entry.offset + entry.length > info.totalUncompressed) {
        throw new ViewerError("invalid-file", "CHM entry offset exceeds uncompressed section.");
      }

      const intervalBytes = info.resetTable ? info.control.resetInterval : info.totalUncompressed;
      const startInterval = Math.floor(entry.offset / intervalBytes);
      const endInterval = Math.floor((entry.offset + entry.length - 1) / intervalBytes);

      if (startInterval === endInterval) {
        const block = await readResetInterval(startInterval, signal);
        const relStart = entry.offset - startInterval * intervalBytes;
        return block.slice(relStart, relStart + entry.length);
      }

      const result = new Uint8Array(entry.length);
      let written = 0;
      for (let idx = startInterval; idx <= endInterval; idx += 1) {
        const block = await readResetInterval(idx, signal);
        const blockStart = idx * intervalBytes;
        const copyFrom = Math.max(0, entry.offset - blockStart);
        const copyTo = Math.min(block.length, entry.offset + entry.length - blockStart);
        result.set(block.subarray(copyFrom, copyTo), written);
        written += copyTo - copyFrom;
      }
      return result;
    },
    dispose() {
      intervalCache.clear();
    },
  };
}
