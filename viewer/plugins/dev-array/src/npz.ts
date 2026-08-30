import { ViewerError } from "@anyfile/viewer-protocol";

import { FileByteSource, type ArrayByteSource } from "./source";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_COMMENT_BYTES = 0xffff;
const MAX_DIRECTORY_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const MAX_PATH_BYTES = 16 * 1024;
const MAX_TOTAL_PATH_BYTES = 32 * 1024 * 1024;
const MAX_ARRAY_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1_000;

export type NpzEntry = {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly flags: number;
  readonly localHeaderOffset: number;
  readonly crc32: number;
};

function invalid(message: string): never {
  throw new ViewerError("invalid-file", `NPZ ${message}。`);
}

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export async function readNpzEntries(file: File, signal: AbortSignal): Promise<readonly NpzEntry[]> {
  const source = new FileByteSource(file, signal);
  if (file.size < 22) invalid("ZIP 尾记录已截断");
  const tailLength = Math.min(file.size, 22 + MAX_COMMENT_BYTES);
  const tailStart = file.size - tailLength;
  const tail = await source.read(tailStart, tailLength);
  let eocd = -1;
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (view(tail).getUint32(offset, true) === EOCD_SIGNATURE &&
        offset + 22 + view(tail).getUint16(offset + 20, true) === tail.length) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) invalid("找不到 ZIP 中央目录尾记录");
  const tailView = view(tail);
  const entryCount = tailView.getUint16(eocd + 10, true);
  const directoryLength = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || directoryLength === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new ViewerError("resource-limit", "NPZ 暂不支持 ZIP64 目录。");
  }
  if (entryCount > MAX_ENTRIES) throw new ViewerError("resource-limit", "NPZ 条目超过 1 万条上限。");
  if (directoryLength > MAX_DIRECTORY_BYTES) throw new ViewerError("resource-limit", "NPZ 中央目录超过 32 MiB 上限。");
  if (!Number.isSafeInteger(directoryOffset + directoryLength) || directoryOffset + directoryLength > tailStart + eocd) {
    invalid("中央目录范围无效");
  }
  const directory = await source.read(directoryOffset, directoryLength);
  const entries: NpzEntry[] = [];
  let totalPathBytes = 0;
  let offset = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directory.length || view(directory).getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      invalid("中央目录条目已损坏或截断");
    }
    const data = view(directory);
    const flags = data.getUint16(offset + 8, true);
    const compressionMethod = data.getUint16(offset + 10, true);
    const crc32 = data.getUint32(offset + 16, true);
    const compressedSize = data.getUint32(offset + 20, true);
    const uncompressedSize = data.getUint32(offset + 24, true);
    const nameLength = data.getUint16(offset + 28, true);
    const extraLength = data.getUint16(offset + 30, true);
    const commentLength = data.getUint16(offset + 32, true);
    const localHeaderOffset = data.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || nameLength > MAX_PATH_BYTES || next > directory.length) invalid("条目路径或记录范围无效");
    const nameBytes = directory.subarray(offset + 46, offset + 46 + nameLength);
    totalPathBytes += nameLength;
    if (totalPathBytes > MAX_TOTAL_PATH_BYTES) throw new ViewerError("resource-limit", "NPZ 路径文本累计超过 32 MiB 上限。");
    let name: string;
    try {
      name = new TextDecoder(flags & 0x800 ? "utf-8" : "latin1", { fatal: true }).decode(nameBytes);
    } catch {
      invalid("条目路径编码无效");
    }
    if (name.toLowerCase().endsWith(".npy") && !name.endsWith("/")) {
      entries.push({ name, compressedSize, uncompressedSize, compressionMethod, flags, localHeaderOffset, crc32 });
    }
    offset = next;
  }
  if (offset !== directory.length) invalid("中央目录长度与条目不一致");
  return entries;
}

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

class CompressedEntrySource implements ArrayByteSource {
  readonly size: number;

  constructor(
    private readonly file: File,
    private readonly start: number,
    private readonly compressedSize: number,
    uncompressedSize: number,
    private readonly signal: AbortSignal,
  ) {
    this.size = uncompressedSize;
  }

  async read(start: number, length: number): Promise<Uint8Array> {
    const end = start + length;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 ||
        !Number.isSafeInteger(end) || end > this.size) invalid("数组条目读取范围无效");
    if (length === 0) return new Uint8Array();
    if (this.signal.aborted) throw abortError();
    if (typeof DecompressionStream === "undefined") {
      throw new ViewerError("unsupported-environment", "当前浏览器不支持 NPZ DEFLATE 流式解压。");
    }
    const stream = this.file.slice(this.start, this.start + this.compressedSize).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const result = new Uint8Array(length);
    let outputOffset = 0;
    let produced = 0;
    const abort = () => { void reader.cancel().catch(() => undefined); };
    this.signal.addEventListener("abort", abort, { once: true });
    try {
      while (outputOffset < length) {
        if (this.signal.aborted) throw abortError();
        const chunk = await reader.read();
        if (chunk.done) invalid("DEFLATE 条目已截断");
        const chunkStart = produced;
        produced += chunk.value.byteLength;
        if (produced > this.size) invalid("DEFLATE 输出超过条目声明大小");
        const copyStart = Math.max(start, chunkStart);
        const copyEnd = Math.min(end, produced);
        if (copyStart < copyEnd) {
          result.set(chunk.value.subarray(copyStart - chunkStart, copyEnd - chunkStart), copyStart - start);
          outputOffset += copyEnd - copyStart;
        }
      }
      return result;
    } catch (error) {
      if (this.signal.aborted) throw abortError();
      if (error instanceof ViewerError) throw error;
      throw new ViewerError("invalid-file", "NPZ DEFLATE 条目已损坏。", { cause: error });
    } finally {
      this.signal.removeEventListener("abort", abort);
      await reader.cancel().catch(() => undefined);
    }
  }
}

export async function openNpzEntry(
  file: File,
  entry: NpzEntry,
  signal: AbortSignal,
): Promise<ArrayByteSource> {
  if (entry.flags & 1) invalid("数组条目已加密");
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) invalid(`压缩方法 ${entry.compressionMethod} 不受支持`);
  if (entry.uncompressedSize > MAX_ARRAY_BYTES) throw new ViewerError("resource-limit", "NPZ 数组条目超过 2 GiB 上限。");
  if (entry.uncompressedSize > Math.max(1024 * 1024, entry.compressedSize * MAX_COMPRESSION_RATIO)) {
    throw new ViewerError("resource-limit", "NPZ 数组条目的压缩比超过 1000:1 安全上限。");
  }
  const source = new FileByteSource(file, signal);
  const header = await source.read(entry.localHeaderOffset, 30);
  const data = view(header);
  if (data.getUint32(0, true) !== LOCAL_SIGNATURE) invalid("本地文件头签名无效");
  const nameLength = data.getUint16(26, true);
  const extraLength = data.getUint16(28, true);
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  if (!Number.isSafeInteger(dataOffset + entry.compressedSize) || dataOffset + entry.compressedSize > file.size) {
    invalid("数组条目数据范围超出文件末尾");
  }
  if (entry.compressionMethod === 0) {
    const fileSource = new FileByteSource(file, signal);
    return {
      size: entry.uncompressedSize,
      read(start, length) {
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 ||
            !Number.isSafeInteger(start + length) || start + length > entry.uncompressedSize) {
          invalid("数组条目读取范围无效");
        }
        return fileSource.read(dataOffset + start, length);
      },
    };
  }
  return new CompressedEntrySource(file, dataOffset, entry.compressedSize, entry.uncompressedSize, signal);
}
