import { ViewerError } from "@anyfile/viewer-protocol";

import { crc32, dangerousPath, formatBytes, hex, text, view } from "../binary";
import type { RangeReader } from "../range-reader";
import type { ArchiveEntry, ArchiveMetadata, IdentifiedFormat, MetadataField } from "../types";

const RAR4_SIGNATURE = Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00);
const RAR5_SIGNATURE = Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00);
const MAX_SFX_BYTES = 1024 * 1024;
const MAX_HEADER_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS = 100_000;
const MAX_PATH_BYTES = 16 * 1024;
const MAX_TOTAL_PATH_BYTES = 32 * 1024 * 1024;

type Signature = { readonly offset: number; readonly version: 4 | 5; readonly length: number };

function checkedAdd(...values: readonly number[]): number {
  const result = values.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(result)) throw new ViewerError("resource-limit", "RAR 元数据偏移超出浏览器安全范围。");
  return result;
}

function matches(bytes: Uint8Array, offset: number, signature: Uint8Array): boolean {
  if (offset + signature.length > bytes.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

async function findSignature(reader: RangeReader): Promise<Signature> {
  const prefixLength = Math.min(reader.size, RAR5_SIGNATURE.length);
  const filePrefix = await reader.read(0, prefixLength, "header");
  if (matches(filePrefix, 0, RAR5_SIGNATURE)) return { offset: 0, version: 5, length: 8 };
  if (matches(filePrefix, 0, RAR4_SIGNATURE)) return { offset: 0, version: 4, length: 7 };
  const scanLength = Math.min(reader.size, MAX_SFX_BYTES + RAR5_SIGNATURE.length);
  const chunkSize = 64 * 1024;
  let offset = 0;
  let prefix = new Uint8Array();
  while (offset < scanLength) {
    reader.throwIfAborted();
    const length = Math.min(chunkSize, scanLength - offset);
    const chunk = await reader.read(offset, length, "header");
    const bytes = new Uint8Array(prefix.length + chunk.length);
    bytes.set(prefix);
    bytes.set(chunk, prefix.length);
    const base = offset - prefix.length;
    for (let index = 0; index < bytes.length; index += 1) {
      if (matches(bytes, index, RAR5_SIGNATURE)) return { offset: base + index, version: 5, length: 8 };
      if (matches(bytes, index, RAR4_SIGNATURE)) return { offset: base + index, version: 4, length: 7 };
    }
    prefix = bytes.slice(Math.max(0, bytes.length - (RAR5_SIGNATURE.length - 1)));
    offset += length;
  }
  throw new ViewerError("invalid-file", "文件中未找到有效的 RAR 签名。");
}

function readVint(bytes: Uint8Array, state: { offset: number }, limit = bytes.length): number {
  let result = 0;
  let scale = 1;
  for (let count = 0; count < 10 && state.offset < limit; count += 1) {
    const byte = bytes[state.offset++];
    result += (byte & 0x7f) * scale;
    if (!Number.isSafeInteger(result)) throw new ViewerError("resource-limit", "RAR 变长整数超出浏览器安全范围。");
    if ((byte & 0x80) === 0) return result;
    scale *= 128;
  }
  throw new ViewerError("invalid-file", "RAR 头部包含无效的变长整数。");
}

function addEntry(entries: ArchiveEntry[], entry: ArchiveEntry, totalPathBytes: { value: number }): void {
  if (entries.length >= MAX_RECORDS) throw new ViewerError("resource-limit", "RAR 条目超过 10 万条上限。");
  const pathBytes = new TextEncoder().encode(entry.path).byteLength;
  if (!entry.path || pathBytes > MAX_PATH_BYTES) {
    throw new ViewerError("resource-limit", "RAR 路径为空或超过 16 KiB 上限。");
  }
  totalPathBytes.value += pathBytes;
  if (totalPathBytes.value > MAX_TOTAL_PATH_BYTES) {
    throw new ViewerError("resource-limit", "RAR 路径文本累计超过 32 MiB 上限。");
  }
  entries.push(entry);
}

function methodName(method: number): string {
  return ["存储", "最快", "较快", "标准", "较好", "最好"][method] ?? `未知 (${method})`;
}

function detectedBy(format: IdentifiedFormat, signature: Signature): string {
  if (signature.offset > 0) return `扩展名 ${format.extension} 与 SFX 内 RAR${signature.version} 签名`;
  return `扩展名 ${format.extension} 与 RAR${signature.version} 签名`;
}

type Rar5Block = {
  readonly bytes: Uint8Array;
  readonly type: number;
  readonly flags: number;
  readonly dataSize: number;
  readonly extraStart: number;
  readonly state: { offset: number };
};

async function readRar5Block(reader: RangeReader, offset: number): Promise<Rar5Block> {
  const available = reader.size - offset;
  if (available < 6) throw new ViewerError("invalid-file", "RAR5 头部已截断。");
  const prefix = await reader.read(offset, Math.min(7, available), "directory");
  const sizeState = { offset: 4 };
  const headerSize = readVint(prefix, sizeState);
  if (headerSize > MAX_HEADER_BYTES) throw new ViewerError("resource-limit", "RAR5 单个头部超过 2 MiB 上限。");
  const blockLength = checkedAdd(4, sizeState.offset - 4, headerSize);
  if (blockLength > available) throw new ViewerError("invalid-file", "RAR5 头部已截断。");
  const bytes = await reader.read(offset, blockLength, "directory");
  if (crc32(bytes.subarray(4)) !== view(bytes).getUint32(0, true)) {
    throw new ViewerError("invalid-file", "RAR5 头部校验和无效。");
  }
  const state = { offset: sizeState.offset };
  const type = readVint(bytes, state);
  const flags = readVint(bytes, state);
  const extraSize = flags & 1 ? readVint(bytes, state) : 0;
  const dataSize = flags & 2 ? readVint(bytes, state) : 0;
  if (extraSize > bytes.length - state.offset) throw new ViewerError("invalid-file", "RAR5 extra area 已截断。");
  return { bytes, type, flags, dataSize, extraStart: bytes.length - extraSize, state };
}

function readRar5Extras(block: Rar5Block): { encrypted: boolean; type?: string; linkTarget?: string } {
  let encrypted = false;
  let type: string | undefined;
  let linkTarget: string | undefined;
  const state = { offset: block.extraStart };
  while (state.offset < block.bytes.length) {
    const recordSize = readVint(block.bytes, state);
    const recordEnd = checkedAdd(state.offset, recordSize);
    if (recordSize === 0 || recordEnd > block.bytes.length) {
      throw new ViewerError("invalid-file", "RAR5 extra record 已截断。");
    }
    const recordType = readVint(block.bytes, state, recordEnd);
    if (recordType === 1) encrypted = true;
    if (recordType === 5) {
      const redirectionType = readVint(block.bytes, state, recordEnd);
      readVint(block.bytes, state, recordEnd);
      const nameLength = readVint(block.bytes, state, recordEnd);
      if (nameLength > recordEnd - state.offset) throw new ViewerError("invalid-file", "RAR5 重定向路径已截断。");
      linkTarget = text(block.bytes.subarray(state.offset, state.offset + nameLength));
      type = ["Unix 符号链接", "Windows 符号链接", "Junction", "硬链接", "文件副本"][redirectionType]
        ?? `重定向 (${redirectionType})`;
    }
    state.offset = recordEnd;
  }
  return { encrypted, type, linkTarget };
}

async function parseRar5(reader: RangeReader, format: IdentifiedFormat, signature: Signature): Promise<ArchiveMetadata> {
  const entries: ArchiveEntry[] = [];
  const totalPathBytes = { value: 0 };
  let offset = signature.offset + signature.length;
  let archiveFlags = 0;
  let volumeNumber: number | undefined;
  let sawMain = false;
  let sawEnd = false;
  let headersEncrypted = false;

  while (offset < reader.size) {
    reader.throwIfAborted();
    const block = await readRar5Block(reader, offset);
    if (block.type === 4) {
      headersEncrypted = true;
      break;
    }
    if (block.type === 1) {
      archiveFlags = readVint(block.bytes, block.state, block.extraStart);
      if (archiveFlags & 2) volumeNumber = readVint(block.bytes, block.state, block.extraStart);
      sawMain = true;
    } else if (block.type === 2 || block.type === 3) {
      const fileFlags = readVint(block.bytes, block.state, block.extraStart);
      const unpackedSize = readVint(block.bytes, block.state, block.extraStart);
      const attributes = readVint(block.bytes, block.state, block.extraStart);
      const modifiedSeconds = fileFlags & 2 ? view(block.bytes).getUint32(block.state.offset, true) : undefined;
      if (modifiedSeconds !== undefined) block.state.offset += 4;
      const checksum = fileFlags & 4 ? view(block.bytes).getUint32(block.state.offset, true) : undefined;
      if (checksum !== undefined) block.state.offset += 4;
      const compression = readVint(block.bytes, block.state, block.extraStart);
      const host = readVint(block.bytes, block.state, block.extraStart);
      const nameLength = readVint(block.bytes, block.state, block.extraStart);
      if (nameLength > block.extraStart - block.state.offset) throw new ViewerError("invalid-file", "RAR5 文件名已截断。");
      const path = text(block.bytes.subarray(block.state.offset, block.state.offset + nameLength)).replaceAll("\\", "/");
      const extra = readRar5Extras(block);
      if (block.type === 2) {
        const directory = Boolean(fileFlags & 1);
        addEntry(entries, {
          path,
          type: extra.type ?? (directory ? "目录" : "文件"),
          size: fileFlags & 8 ? undefined : unpackedSize,
          compressedSize: block.dataSize,
          modified: modifiedSeconds === undefined ? undefined : new Date(modifiedSeconds * 1000),
          method: methodName((compression >> 7) & 7),
          checksum: checksum === undefined ? undefined : hex(checksum),
          permissions: host === 1 ? `0${(attributes & 0xfff).toString(8).padStart(3, "0")}` : undefined,
          linkTarget: extra.linkTarget,
          encrypted: extra.encrypted,
          dangerousPath: dangerousPath(path),
        }, totalPathBytes);
      }
    } else if (block.type === 5) {
      sawEnd = true;
    }
    const nextOffset = checkedAdd(offset, block.bytes.length, block.dataSize);
    if (nextOffset <= offset || nextOffset > reader.size) throw new ViewerError("invalid-file", "RAR5 数据范围超出文件末尾。");
    offset = nextOffset;
    if (sawEnd) break;
  }

  if (!headersEncrypted && !sawMain) throw new ViewerError("invalid-file", "RAR5 缺少主归档头。");
  const fields: MetadataField[] = [
    { label: "RAR 版本", value: "RAR 5.x" },
    { label: "条目数量", value: formatBytes(entries.length) },
    { label: "归档模式", value: archiveFlags & 4 ? "Solid" : "普通" },
    { label: "分卷", value: archiveFlags & 1 ? `是${volumeNumber === undefined ? "" : `（卷 ${volumeNumber}）`}` : "否" },
    { label: "恢复记录", value: archiveFlags & 8 ? "有" : "无" },
    { label: "目录读取方式", value: "顺序读取 RAR 头部，按 data size 跳过压缩数据" },
  ];
  const limitations = [
    headersEncrypted && "RAR 文件头已加密；未提供密码时无法读取条目目录。",
    archiveFlags & 1 && "这是分卷 RAR；当前仅展示所选卷中可读取的头部，不自动查找或拼接其他卷。",
  ].filter(Boolean).join(" ");
  return {
    format: "RAR 5.x",
    kind: "archive",
    detectedBy: detectedBy(format, signature),
    fields,
    entries: headersEncrypted ? undefined : entries,
    limitation: limitations || undefined,
  };
}

function decodeRar4Name(bytes: Uint8Array, unicode: boolean): string {
  if (!unicode) return text(bytes).replaceAll("\\", "/");
  const separator = bytes.indexOf(0);
  if (separator === -1 || separator + 1 >= bytes.length) return text(bytes).replaceAll("\\", "/");
  const ansi = bytes.subarray(0, separator);
  const encoded = bytes.subarray(separator + 1);
  const chars: number[] = [];
  let offset = 1;
  let flags = 0;
  let flagBits = 0;
  const highByte = encoded[0];
  while (offset < encoded.length && chars.length < ansi.length) {
    if (flagBits === 0) {
      flags = encoded[offset++];
      flagBits = 8;
    }
    const mode = flags >> 6;
    flags = (flags << 2) & 0xff;
    flagBits -= 2;
    if (mode === 0) chars.push(encoded[offset++]);
    else if (mode === 1) chars.push(encoded[offset++] | (highByte << 8));
    else if (mode === 2) {
      if (offset + 1 >= encoded.length) break;
      chars.push(encoded[offset] | (encoded[offset + 1] << 8));
      offset += 2;
    } else {
      if (offset >= encoded.length) break;
      const length = encoded[offset++];
      const correction = length & 0x80 ? encoded[offset++] : 0;
      const count = (length & 0x7f) + 2;
      for (let index = 0; index < count && chars.length < ansi.length; index += 1) {
        chars.push(ansi[chars.length] + (correction << 8));
      }
    }
  }
  const decoded = chars.length ? String.fromCharCode(...chars) : text(ansi);
  return decoded.replaceAll("\\", "/");
}

function dosDate(value: number): Date | undefined {
  if (value === 0) return undefined;
  const year = 1980 + (value >>> 25);
  const month = (value >>> 21) & 0x0f;
  const day = (value >>> 16) & 0x1f;
  const hour = (value >>> 11) & 0x1f;
  const minute = (value >>> 5) & 0x3f;
  const second = (value & 0x1f) * 2;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return undefined;
  return new Date(year, month - 1, day, hour, minute, second);
}

async function parseRar4(reader: RangeReader, format: IdentifiedFormat, signature: Signature): Promise<ArchiveMetadata> {
  const entries: ArchiveEntry[] = [];
  const totalPathBytes = { value: 0 };
  let offset = signature.offset + signature.length;
  let mainFlags = 0;
  let sawMain = false;
  let sawEnd = false;

  while (offset < reader.size) {
    reader.throwIfAborted();
    if (reader.size - offset < 7) throw new ViewerError("invalid-file", "RAR4 头部已截断。");
    const common = await reader.read(offset, 7, "directory");
    const commonView = view(common);
    const type = common[2];
    const flags = commonView.getUint16(3, true);
    const headerSize = commonView.getUint16(5, true);
    if (headerSize < 7 || headerSize > reader.size - offset) throw new ViewerError("invalid-file", "RAR4 头部大小无效。");
    const header = await reader.read(offset, headerSize, "directory");
    if ((crc32(header.subarray(2)) & 0xffff) !== view(header).getUint16(0, true)) {
      throw new ViewerError("invalid-file", "RAR4 头部校验和无效。");
    }
    let dataSize = flags & 0x8000 && header.length >= 11 ? view(header).getUint32(7, true) : 0;
    if (type === 0x73) {
      if (headerSize < 13) throw new ViewerError("invalid-file", "RAR4 主归档头已截断。");
      mainFlags = flags;
      sawMain = true;
      if (mainFlags & 0x0080) break;
    } else if (type === 0x74) {
      if (headerSize < 32) throw new ViewerError("invalid-file", "RAR4 文件头已截断。");
      const data = view(header);
      let packedSize = data.getUint32(7, true);
      let unpackedSize = data.getUint32(11, true);
      let nameOffset = 32;
      if (flags & 0x0100) {
        if (headerSize < 40) throw new ViewerError("invalid-file", "RAR4 大文件头已截断。");
        packedSize = checkedAdd(packedSize, data.getUint32(32, true) * 0x1_0000_0000);
        unpackedSize = checkedAdd(unpackedSize, data.getUint32(36, true) * 0x1_0000_0000);
        nameOffset = 40;
      }
      dataSize = packedSize;
      const nameSize = data.getUint16(26, true);
      if (nameSize > headerSize - nameOffset) throw new ViewerError("invalid-file", "RAR4 文件名已截断。");
      const path = decodeRar4Name(header.subarray(nameOffset, nameOffset + nameSize), Boolean(flags & 0x0200));
      const directory = (flags & 0x00e0) === 0x00e0;
      const host = header[15];
      const attributes = data.getUint32(28, true);
      addEntry(entries, {
        path,
        type: directory ? "目录" : "文件",
        size: unpackedSize,
        compressedSize: packedSize,
        modified: dosDate(data.getUint32(20, true)),
        method: methodName(header[25] - 0x30),
        checksum: hex(data.getUint32(16, true)),
        permissions: host === 3 ? `0${(attributes & 0xfff).toString(8).padStart(3, "0")}` : undefined,
        encrypted: Boolean(flags & 0x0004),
        dangerousPath: dangerousPath(path),
      }, totalPathBytes);
    } else if (type === 0x7b) {
      sawEnd = true;
    }
    const nextOffset = checkedAdd(offset, headerSize, dataSize);
    if (nextOffset <= offset || nextOffset > reader.size) throw new ViewerError("invalid-file", "RAR4 数据范围超出文件末尾。");
    offset = nextOffset;
    if (sawEnd) break;
  }

  if (!sawMain) throw new ViewerError("invalid-file", "RAR4 缺少主归档头。");
  const headersEncrypted = Boolean(mainFlags & 0x0080);
  const fields: MetadataField[] = [
    { label: "RAR 版本", value: "RAR 4.x" },
    { label: "条目数量", value: formatBytes(entries.length) },
    { label: "归档模式", value: mainFlags & 0x0008 ? "Solid" : "普通" },
    { label: "分卷", value: mainFlags & 0x0001 ? "是" : "否" },
    { label: "恢复记录", value: mainFlags & 0x0040 ? "有" : "无" },
    { label: "目录读取方式", value: "顺序读取 RAR 头部，按 packed size 跳过压缩数据" },
  ];
  const limitations = [
    headersEncrypted && "RAR 文件头已加密；未提供密码时无法读取条目目录。",
    mainFlags & 0x0001 && "这是分卷 RAR；当前仅展示所选卷中可读取的头部，不自动查找或拼接其他卷。",
  ].filter(Boolean).join(" ");
  return {
    format: "RAR 4.x",
    kind: "archive",
    detectedBy: detectedBy(format, signature),
    fields,
    entries: headersEncrypted ? undefined : entries,
    limitation: limitations || undefined,
  };
}

export async function parseRar(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  const signature = await findSignature(reader);
  return signature.version === 5
    ? parseRar5(reader, format, signature)
    : parseRar4(reader, format, signature);
}
