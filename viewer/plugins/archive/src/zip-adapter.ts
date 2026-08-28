import {
  ERR_ENCRYPTED_CENTRAL_DIRECTORY,
  ERR_SPLIT_ZIP_FILE,
  Reader,
  ZipReader,
  type Entry,
} from "@zip.js/zip.js/lib/zip-core-custom.js";
import { ViewerError } from "@anyfile/viewer-protocol";

import { dangerousPath, formatBytes, hex, readUint64, text, view } from "./binary";
import type { RangeReader } from "./range-reader";
import type { ArchiveEntry, ArchiveMetadata, IdentifiedFormat, MetadataField } from "./types";

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const MAX_COMMENT_LENGTH = 0xffff;
const MAX_RECORDS = 100_000;
const MAX_PATH_BYTES = 16 * 1024;
const MAX_TOTAL_PATH_BYTES = 32 * 1024 * 1024;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

type Region = {
  readonly start: number;
  readonly bytes: Uint8Array;
};

type ZipDirectory = {
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

async function readDirectoryLayout(reader: RangeReader): Promise<ZipDirectory> {
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

class MetadataOnlyZipReader extends Reader<undefined> {
  constructor(size: number, private readonly regions: readonly Region[]) {
    super(undefined);
    this.size = size;
  }

  override async readUint8Array(offset: number, length: number): Promise<Uint8Array> {
    const safeLength = Math.max(0, Math.min(length, this.size - offset));
    const result = new Uint8Array(safeLength);
    const requestedEnd = offset + safeLength;
    for (const region of this.regions) {
      const regionEnd = region.start + region.bytes.length;
      const start = Math.max(offset, region.start);
      const end = Math.min(requestedEnd, regionEnd);
      if (start < end) {
        result.set(region.bytes.subarray(start - region.start, end - region.start), start - offset);
      }
    }
    return result;
  }
}

const METHODS: Readonly<Record<number, string>> = {
  0: "Stored", 1: "Shrunk", 6: "Imploded", 8: "Deflate", 9: "Deflate64",
  12: "Bzip2", 14: "LZMA", 93: "Zstandard", 95: "XZ", 98: "PPMd", 99: "AES",
};

function decodeZipText(value: Uint8Array, encoding: string): string | undefined {
  if (encoding.toLowerCase() !== "cp437") return undefined;
  try {
    return utf8Decoder.decode(value);
  } catch {
    return undefined;
  }
}

function mapEntry(entry: Entry): ArchiveEntry {
  const pathBytes = new TextEncoder().encode(entry.filename).byteLength;
  if (!entry.filename || pathBytes > MAX_PATH_BYTES) {
    throw new ViewerError("resource-limit", "ZIP 路径为空或超过 16 KiB 上限。");
  }
  return {
    path: entry.filename,
    type: entry.directory ? "目录" : entry.symlink ? "符号链接" : "文件",
    size: entry.uncompressedSize,
    compressedSize: entry.compressedSize,
    modified: entry.lastModDate,
    method: METHODS[entry.compressionMethod] ?? `方法 ${entry.compressionMethod}`,
    checksum: entry.crc32 === undefined ? undefined : hex(entry.crc32),
    permissions: entry.unixMode === undefined ? undefined : `0${(entry.unixMode & 0xfff).toString(8).padStart(3, "0")}`,
    comment: entry.comment || undefined,
    encrypted: entry.encrypted,
    dangerousPath: dangerousPath(entry.filename),
  };
}

function unsupportedZip(format: IdentifiedFormat, layout: ZipDirectory, reason: string): ArchiveMetadata {
  return {
    format: layout.zip64 ? "ZIP64" : "ZIP",
    kind: "archive",
    detectedBy: format.magicMatched ? `扩展名 ${format.extension} 与 ZIP 标识一致` : `按 ZIP 尾部目录识别`,
    fields: [
      { label: "中央目录偏移", value: `${formatBytes(layout.directoryOffset)} 字节` },
      { label: "中央目录大小", value: `${formatBytes(layout.directoryLength)} 字节` },
      { label: "声明条目数", value: formatBytes(layout.entryCount) },
    ],
    limitation: reason,
  };
}

export async function parseZip(
  rangeReader: RangeReader,
  format: IdentifiedFormat,
  signal: AbortSignal,
): Promise<ArchiveMetadata> {
  const layout = await readDirectoryLayout(rangeReader);
  if (layout.split) return unsupportedZip(format, layout, "这是分卷 ZIP；当前查看器不拼接或读取依赖外部分卷的目录。");
  const directory: Region = {
    start: layout.directoryOffset,
    bytes: await rangeReader.read(layout.directoryOffset, layout.directoryLength, "directory"),
  };
  const reader = new MetadataOnlyZipReader(rangeReader.size, [directory, ...layout.extraRegions, layout.eocd]);
  const zipReader = new ZipReader(reader, {
    useWebWorkers: false,
    useCompressionStream: false,
    strictness: "balanced",
    decodeText: decodeZipText,
  });
  try {
    const rawEntries: Entry[] = [];
    for await (const entry of zipReader.getEntriesGenerator({ filenameValidation: "tolerant" })) {
      if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
      rawEntries.push(entry);
    }
    const entries = rawEntries.map(mapEntry);
    const totalPathBytes = entries.reduce((total, entry) => total + new TextEncoder().encode(entry.path).byteLength, 0);
    if (totalPathBytes > MAX_TOTAL_PATH_BYTES) {
      throw new ViewerError("resource-limit", "ZIP 路径文本累计超过 32 MiB 上限。");
    }
    const fields: MetadataField[] = [
      { label: "格式变体", value: entries.some((entry, index) => rawEntries[index].zip64) || layout.zip64 ? "ZIP64" : "ZIP" },
      { label: "中央目录偏移", value: `${formatBytes(layout.directoryOffset)} 字节` },
      { label: "中央目录大小", value: `${formatBytes(layout.directoryLength)} 字节` },
      { label: "条目数量", value: formatBytes(entries.length) },
      { label: "归档注释", value: layout.comment.length ? text(layout.comment) : "—" },
      { label: "解析警告", value: zipReader.warnings?.length ? zipReader.warnings.map((warning) => warning.reason).join("；") : "无" },
    ];
    return {
      format: layout.zip64 ? "ZIP64" : "ZIP",
      kind: "archive",
      detectedBy: format.magicMatched ? `扩展名 ${format.extension} 与 ZIP 标识一致` : `按 ZIP 尾部目录识别`,
      fields,
      entries,
    };
  } catch (error) {
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    if (error instanceof Error && error.message === ERR_ENCRYPTED_CENTRAL_DIRECTORY) {
      return unsupportedZip(format, layout, "ZIP 中央目录已加密，需要密码才能读取；当前查看器不请求密码。");
    }
    if (error instanceof Error && error.message === ERR_SPLIT_ZIP_FILE) {
      return unsupportedZip(format, layout, "这是分卷 ZIP；当前查看器不拼接外部分卷。");
    }
    throw new ViewerError("invalid-file", "ZIP 中央目录已损坏或截断。", { cause: error });
  } finally {
    await zipReader.close();
  }
}
