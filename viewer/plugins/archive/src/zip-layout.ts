import { ViewerError } from "@anyfile/viewer-protocol";
import { readUint64, view } from "./binary";
import type { RangeReader } from "./range-reader";

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const MAX_COMMENT_LENGTH = 0xffff;
const MAX_RECORDS = 100_000;

export type Region = {
  readonly start: number;
  readonly bytes: Uint8Array;
};

export type ZipDirectory = {
  readonly directoryOffset: number;
  readonly directoryLength: number;
  readonly entryCount: number;
  readonly eocd: Region;
  readonly extraRegions: readonly Region[];
  readonly comment: Uint8Array;
  readonly zip64: boolean;
  readonly split: boolean;
};

async function locateEocd(reader: RangeReader): Promise<Region> {
  if (reader.size < 22) throw new ViewerError("invalid-file", "ZIP EOCD 已截断。");
  const directOffset = reader.size - 22;
  const directSignature = await reader.read(directOffset, 4, "trailer");
  if (view(directSignature).getUint32(0, true) === EOCD_SIGNATURE) {
    const bytes = await reader.read(directOffset, 22, "trailer");
    if (view(bytes).getUint16(20, true) === 0) return { start: directOffset, bytes };
  }

  const minimum = Math.max(0, reader.size - 22 - MAX_COMMENT_LENGTH);
  for (let offset = reader.size - 23; offset >= minimum; offset -= 1) {
    reader.throwIfAborted();
    const signature = await reader.read(offset, 4, "trailer");
    if (view(signature).getUint32(0, true) !== EOCD_SIGNATURE) continue;
    const fixed = await reader.read(offset, 22, "trailer");
    const length = view(fixed).getUint16(20, true);
    if (offset + 22 + length !== reader.size) continue;
    return { start: offset, bytes: await reader.read(offset, 22 + length, "trailer") };
  }
  throw new ViewerError("invalid-file", "找不到 ZIP 中央目录尾记录。");
}

export async function readDirectoryLayout(reader: RangeReader): Promise<ZipDirectory> {
  const eocd = await locateEocd(reader);
  const data = view(eocd.bytes);
  let directoryLength = data.getUint32(12, true);
  let directoryOffset = data.getUint32(16, true);
  let entryCount = data.getUint16(10, true);
  const disk = data.getUint16(4, true);
  const directoryDisk = data.getUint16(6, true);
  const entriesOnDisk = data.getUint16(8, true);
  let split = disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount;
  const extraRegions: Region[] = [];
  let zip64 = false;

  const requiresZip64 = directoryLength === 0xffffffff || directoryOffset === 0xffffffff ||
    entryCount === 0xffff || directoryDisk === 0xffff;
  if (requiresZip64) {
    zip64 = true;
    if (eocd.start < 20) throw new ViewerError("invalid-file", "ZIP64 locator 已截断。");
    const locator: Region = { start: eocd.start - 20, bytes: await reader.read(eocd.start - 20, 20, "trailer") };
    extraRegions.push(locator);
    const locatorView = view(locator.bytes);
    if (locatorView.getUint32(0, true) !== ZIP64_LOCATOR_SIGNATURE) {
      throw new ViewerError("invalid-file", "找不到 ZIP64 locator。");
    }
    const zip64Offset = readUint64(locatorView, 8);
    const fixed = await reader.read(zip64Offset, 56, "trailer");
    const fixedView = view(fixed);
    if (fixedView.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
      throw new ViewerError("invalid-file", "ZIP64 EOCD 签名无效。");
    }
    const recordLength = readUint64(fixedView, 4) + 12;
    if (recordLength < 56 || recordLength > 64 * 1024 * 1024) {
      throw new ViewerError("resource-limit", "ZIP64 EOCD 超过安全上限。");
    }
    const record = recordLength === 56 ? fixed : await reader.read(zip64Offset, recordLength, "trailer");
    extraRegions.push({ start: zip64Offset, bytes: record });
    const recordView = view(record);
    split ||= recordView.getUint32(16, true) !== 0 || recordView.getUint32(20, true) !== 0 ||
      readUint64(recordView, 24) !== readUint64(recordView, 32);
    entryCount = readUint64(recordView, 32);
    directoryLength = readUint64(recordView, 40);
    directoryOffset = readUint64(recordView, 48);
  }

  if (entryCount > MAX_RECORDS) throw new ViewerError("resource-limit", "ZIP 条目超过 10 万条上限。");
  if (directoryLength > 64 * 1024 * 1024) throw new ViewerError("resource-limit", "ZIP 中央目录超过 64 MiB 上限。");
  if (!Number.isSafeInteger(directoryOffset + directoryLength) || directoryOffset + directoryLength > reader.size) {
    throw new ViewerError("invalid-file", "ZIP 中央目录偏移超出文件范围。");
  }
  return {
    directoryOffset,
    directoryLength,
    entryCount,
    eocd,
    extraRegions,
    comment: eocd.bytes.subarray(22),
    zip64,
    split,
  };
}

