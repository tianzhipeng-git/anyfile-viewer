import { ViewerError } from "@anyfile/viewer-protocol";

import { dangerousPath, formatBytes, text } from "../binary";
import type { ReadPurpose } from "../types";
import type { ArchiveEntry, ArchiveMetadata, IdentifiedFormat, MetadataField } from "../types";

const BLOCK_SIZE = 512;
const MAX_RECORDS = 100_000;
const MAX_PATH_BYTES = 16 * 1024;
const MAX_TOTAL_PATH_BYTES = 32 * 1024 * 1024;

function cleanText(bytes: Uint8Array): string {
  const zero = bytes.indexOf(0);
  return text(zero === -1 ? bytes : bytes.subarray(0, zero)).trimEnd();
}

function parseNumber(bytes: Uint8Array, label: string, allowNegative = false): number {
  if (bytes[0] & 0x80) {
    const negative = Boolean(bytes[0] & 0x40);
    let value = negative ? ~bytes[0] & 0x3f : bytes[0] & 0x3f;
    for (const byte of bytes.subarray(1)) {
      value = value * 256 + (negative ? byte ^ 0xff : byte);
      if (!Number.isSafeInteger(value)) throw new ViewerError("resource-limit", `TAR ${label} 超出安全范围。`);
    }
    if (!negative) return value;
    if (!allowNegative) throw new ViewerError("invalid-file", `TAR ${label} 使用了负数。`);
    return -(value + 1);
  }
  const value = cleanText(bytes).trim();
  if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) throw new ViewerError("invalid-file", `TAR ${label} 不是有效八进制数。`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) throw new ViewerError("resource-limit", `TAR ${label} 超出安全范围。`);
  return parsed;
}

function isZeroBlock(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0);
}

function verifyChecksum(header: Uint8Array): void {
  const expected = parseNumber(header.subarray(148, 156), "校验和");
  let unsigned = 0;
  let signed = 0;
  for (let index = 0; index < header.length; index += 1) {
    const value = index >= 148 && index < 156 ? 32 : header[index];
    unsigned += value;
    signed += value > 127 ? value - 256 : value;
  }
  if (expected !== unsigned && expected !== signed) {
    throw new ViewerError("invalid-file", "TAR 头部校验和无效。");
  }
}

function parsePax(data: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) throw new ViewerError("invalid-file", "PAX 记录缺少长度字段。");
    const lengthText = text(data.subarray(offset, space));
    if (!/^[1-9][0-9]*$/.test(lengthText)) throw new ViewerError("invalid-file", "PAX 记录长度无效。");
    const length = Number(lengthText);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > data.length || data[end - 1] !== 0x0a) {
      throw new ViewerError("invalid-file", "PAX 记录已截断。");
    }
    const record = text(data.subarray(space + 1, end - 1));
    const equals = record.indexOf("=");
    if (equals <= 0) throw new ViewerError("invalid-file", "PAX 记录缺少键值分隔符。");
    result[record.slice(0, equals)] = record.slice(equals + 1);
    offset = end;
  }
  return result;
}

function typeName(type: string, path: string): string {
  switch (type) {
    case "": case "0": case "7": return path.endsWith("/") ? "目录" : "文件";
    case "1": return "硬链接";
    case "2": return "符号链接";
    case "3": return "字符设备";
    case "4": return "块设备";
    case "5": return "目录";
    case "6": return "FIFO";
    case "S": return "GNU 稀疏文件";
    default: return `其他 (${type})`;
  }
}

function parsePaxNumber(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isSafeInteger(Math.trunc(parsed))) {
    throw new ViewerError("invalid-file", `PAX ${label} 无效。`);
  }
  return parsed;
}

export type TarReader = {
  readonly size: number;
  read(start: number, length: number, purpose: ReadPurpose): Promise<Uint8Array>;
  throwIfAborted(): void;
};

export async function parseTar(reader: TarReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  if (reader.size < BLOCK_SIZE) throw new ViewerError("invalid-file", "TAR 头部已截断。");
  const entries: ArchiveEntry[] = [];
  const fields: MetadataField[] = [];
  let offset = 0;
  let totalPathBytes = 0;
  let globalPax: Record<string, string> = {};
  let localPax: Record<string, string> = {};
  let longName: string | undefined;
  let longLink: string | undefined;
  let flavor = "ustar";
  let sawEndOfArchive = false;

  while (offset + BLOCK_SIZE <= reader.size) {
    reader.throwIfAborted();
    const header = await reader.read(offset, BLOCK_SIZE, "directory");
    if (isZeroBlock(header)) {
      sawEndOfArchive = true;
      break;
    }
    verifyChecksum(header);
    const magic = cleanText(header.subarray(257, 263));
    if (!magic.startsWith("ustar")) throw new ViewerError("invalid-file", "仅支持 ustar、PAX 与 GNU TAR 头部。");
    if (header[257] === 0x75 && header[262] === 0x20) flavor = "GNU TAR";

    const rawSize = parseNumber(header.subarray(124, 136), "条目大小");
    const paddedSize = Math.ceil(rawSize / BLOCK_SIZE) * BLOCK_SIZE;
    const dataOffset = offset + BLOCK_SIZE;
    const nextOffset = dataOffset + paddedSize;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > reader.size) {
      throw new ViewerError("invalid-file", "TAR 条目数据范围超出文件末尾。");
    }
    const type = String.fromCharCode(header[156] || 0);
    if (["x", "g", "L", "K"].includes(type)) {
      if (rawSize > 64 * 1024 * 1024) throw new ViewerError("resource-limit", "TAR 元数据记录超过 64 MiB 上限。");
      const metadata = await reader.read(dataOffset, rawSize, "directory");
      if (type === "x") localPax = parsePax(metadata);
      if (type === "g") globalPax = { ...globalPax, ...parsePax(metadata) };
      if (type === "L") longName = cleanText(metadata);
      if (type === "K") longLink = cleanText(metadata);
      offset = nextOffset;
      continue;
    }

    if (entries.length >= MAX_RECORDS) throw new ViewerError("resource-limit", "TAR 条目超过 10 万条上限。");
    const pax = { ...globalPax, ...localPax };
    const prefix = cleanText(header.subarray(345, 500));
    const headerName = cleanText(header.subarray(0, 100));
    const path = pax.path ?? longName ?? (prefix ? `${prefix}/${headerName}` : headerName);
    const linkTarget = pax.linkpath ?? longLink ?? (cleanText(header.subarray(157, 257)) || undefined);
    const pathBytes = new TextEncoder().encode(path).byteLength;
    totalPathBytes += pathBytes;
    if (!path || pathBytes > MAX_PATH_BYTES) throw new ViewerError("resource-limit", "TAR 路径为空或超过 16 KiB 上限。");
    if (totalPathBytes > MAX_TOTAL_PATH_BYTES) throw new ViewerError("resource-limit", "TAR 路径文本累计超过 32 MiB 上限。");
    const size = parsePaxNumber(pax.size, rawSize, "size");
    const modifiedSeconds = pax.mtime === undefined ? parseNumber(header.subarray(136, 148), "修改时间", true) : Number(pax.mtime);
    if (!Number.isFinite(modifiedSeconds)) throw new ViewerError("invalid-file", "PAX mtime 无效。");
    const entryType = typeName(type, path);
    entries.push({
      path,
      type: entryType,
      size: entryType === "目录" ? 0 : size,
      modified: new Date(modifiedSeconds * 1000),
      method: "未压缩",
      checksum: String(parseNumber(header.subarray(148, 156), "校验和")),
      permissions: `0${parseNumber(header.subarray(100, 108), "权限").toString(8).padStart(3, "0")}`,
      linkTarget,
      dangerousPath: dangerousPath(path),
    });
    localPax = {};
    longName = undefined;
    longLink = undefined;
    offset = nextOffset;
  }

  if (!sawEndOfArchive && offset < reader.size) throw new ViewerError("invalid-file", "TAR 头部已截断。");
  if (entries.length === 0 && !sawEndOfArchive) throw new ViewerError("invalid-file", "TAR 中没有有效头部。");
  fields.push(
    { label: "TAR 变体", value: flavor },
    { label: "条目数量", value: formatBytes(entries.length) },
    { label: "目录读取方式", value: "逐个读取 512 字节头部，按记录大小跳过文件体" },
  );
  return {
    format: "TAR",
    kind: "archive",
    detectedBy: `扩展名 ${format.extension} 与 ustar/GNU 头部`,
    fields,
    entries,
  };
}
