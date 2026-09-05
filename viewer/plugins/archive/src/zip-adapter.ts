import {
  ERR_ENCRYPTED_CENTRAL_DIRECTORY,
  ERR_SPLIT_ZIP_FILE,
  Reader,
  ZipReader,
  type Entry,
} from "@zip.js/zip.js/lib/zip-core-custom.js";
import { ViewerError } from "@anyfile/viewer-protocol";

import { dangerousPath, formatBytes, hex, text, view } from "./binary";
import type { RangeReader } from "./range-reader";
import type { ArchiveEntry, ArchiveMetadata, IdentifiedFormat, MetadataField } from "./types";

import { readDirectoryLayout, type Region, type ZipDirectory } from "./zip-layout";
const MAX_PATH_BYTES = 16 * 1024;
const MAX_TOTAL_PATH_BYTES = 32 * 1024 * 1024;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

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
    suspiciousCompression: entry.uncompressedSize > 1024 * 1024 &&
      entry.uncompressedSize > Math.max(1, entry.compressedSize) * 1_000,
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
  const directoryOffset = layout.directoryOffset + format.containerOffset;
  if (!Number.isSafeInteger(directoryOffset) || directoryOffset + layout.directoryLength > rangeReader.size) {
    throw new ViewerError("invalid-file", "ZIP 中央目录偏移超出文件范围。");
  }
  if (layout.split) return unsupportedZip(format, layout, "这是分卷 ZIP；当前查看器不拼接或读取依赖外部分卷的目录。");
  const directory: Region = {
    start: directoryOffset,
    bytes: await rangeReader.read(directoryOffset, layout.directoryLength, "directory"),
  };
  let eocd = layout.eocd;
  if (format.containerOffset) {
    if (layout.zip64) throw new ViewerError("invalid-file", "暂不支持 ZIP64 JMOD。");
    const bytes = layout.eocd.bytes.slice();
    const offset = view(bytes).getUint32(16, true) + format.containerOffset;
    view(bytes).setUint32(16, offset, true);
    eocd = { ...layout.eocd, bytes };
  }
  const reader = new MetadataOnlyZipReader(rangeReader.size, [directory, ...layout.extraRegions, eocd]);
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
      { label: "中央目录偏移", value: `${formatBytes(directoryOffset)} 字节` },
      { label: "中央目录大小", value: `${formatBytes(layout.directoryLength)} 字节` },
      { label: "条目数量", value: formatBytes(entries.length) },
      { label: "归档注释", value: layout.comment.length ? text(layout.comment) : "—" },
      { label: "解析警告", value: zipReader.warnings?.length ? zipReader.warnings.map((warning) => warning.reason).join("；") : "无" },
    ];
    return {
      format: format.id === "jmod" ? "JMOD / ZIP" : layout.zip64 ? "ZIP64" : "ZIP",
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
