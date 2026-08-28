import { ViewerError } from "@anyfile/viewer-protocol";

import { ascii, crc32, formatBytes, hex, readUint64, readVarint, text, view } from "../binary";
import type { RangeReader } from "../range-reader";
import type { ArchiveMetadata, IdentifiedFormat, MetadataField } from "../types";

const COMPOUND_LIMITATION = "未扫描内部归档，因为取得其目录需要解码普通文件条目数据流。";

function detectedBy(format: IdentifiedFormat) {
  return format.magicMatched ? `扩展名 ${format.extension} 与文件标识一致` : `文件标识与扩展名 ${format.extension} 不一致，按实际标识解析`;
}

function wrapper(
  format: IdentifiedFormat,
  name: string,
  fields: readonly MetadataField[],
  limitation?: string,
): ArchiveMetadata {
  return {
    format: name,
    kind: "wrapper",
    detectedBy: detectedBy(format),
    fields,
    limitation: format.compoundTar ? COMPOUND_LIMITATION : limitation,
  };
}

async function readNullTerminated(reader: RangeReader, offset: number) {
  const bytes: number[] = [];
  while (bytes.length <= 16 * 1024) {
    const byte = (await reader.read(offset + bytes.length, 1, "header"))[0];
    if (byte === 0) return { value: text(Uint8Array.from(bytes)), length: bytes.length + 1 };
    bytes.push(byte);
  }
  throw new ViewerError("resource-limit", "gzip 头部文本超过 16 KiB 上限。");
}

async function parseGzip(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  if (reader.size < 18) throw new ViewerError("invalid-file", "gzip 文件头或尾部已截断。");
  const header = await reader.read(0, 10, "header");
  const data = view(header);
  if (header[0] !== 0x1f || header[1] !== 0x8b || header[2] !== 8 || (header[3] & 0xe0)) {
    throw new ViewerError("invalid-file", "文件不是有效的 gzip 包装流。");
  }
  const flags = header[3];
  let offset = 10;
  const fields: MetadataField[] = [
    { label: "压缩方法", value: "DEFLATE (8)" },
    { label: "标志", value: hex(flags, 2) },
    { label: "修改时间", value: data.getUint32(4, true) ? new Date(data.getUint32(4, true) * 1000).toISOString() : "未设置" },
    { label: "额外标志", value: hex(header[8], 2) },
    { label: "操作系统", value: String(header[9]) },
  ];
  if (flags & 4) {
    const lengthBytes = await reader.read(offset, 2, "header");
    const length = view(lengthBytes).getUint16(0, true);
    offset += 2;
    await reader.read(offset, length, "header");
    offset += length;
    fields.push({ label: "额外字段", value: `${formatBytes(length)} 字节` });
  }
  if (flags & 8) {
    const value = await readNullTerminated(reader, offset);
    offset += value.length;
    fields.push({ label: "原始文件名", value: value.value || "—" });
  }
  if (flags & 16) {
    const value = await readNullTerminated(reader, offset);
    offset += value.length;
    fields.push({ label: "注释", value: value.value || "—" });
  }
  if (flags & 2) {
    const headerCrc = await reader.read(offset, 2, "header");
    offset += 2;
    fields.push({ label: "头部 CRC16", value: hex(view(headerCrc).getUint16(0, true), 4) });
  }
  if (offset > reader.size - 8) throw new ViewerError("invalid-file", "gzip 头部与尾部重叠。");
  const trailer = view(await reader.read(reader.size - 8, 8, "trailer"));
  fields.push(
    { label: "数据 CRC32", value: hex(trailer.getUint32(0, true)) },
    { label: "原始大小（模 2³²）", value: `${formatBytes(trailer.getUint32(4, true))} 字节` },
  );
  return wrapper(format, "gzip", fields);
}

async function parseXz(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  if (reader.size < 24) throw new ViewerError("invalid-file", "XZ stream header/footer 已截断。");
  const header = await reader.read(0, 12, "header");
  const footer = await reader.read(reader.size - 12, 12, "trailer");
  if (ascii(header.subarray(0, 6)) !== "\xfd7zXZ\0" || ascii(footer.subarray(10)) !== "YZ") {
    throw new ViewerError("invalid-file", "文件不是有效的 XZ stream。");
  }
  const headerView = view(header);
  const footerView = view(footer);
  if (crc32(header.subarray(6, 8)) !== headerView.getUint32(8, true) ||
      crc32(footer.subarray(4, 10)) !== footerView.getUint32(0, true) ||
      header[6] !== footer[8] || header[7] !== footer[9] || header[6] !== 0 || (header[7] & 0xf0)) {
    throw new ViewerError("invalid-file", "XZ stream flags 或 CRC 无效。");
  }
  const indexSize = (footerView.getUint32(4, true) + 1) * 4;
  if (indexSize > 64 * 1024 * 1024 || indexSize > reader.size - 24) {
    throw new ViewerError("resource-limit", "XZ index 超过 64 MiB 安全上限。");
  }
  const index = await reader.read(reader.size - 12 - indexSize, indexSize, "index");
  if (index[0] !== 0 || crc32(index.subarray(0, -4)) !== view(index).getUint32(index.length - 4, true)) {
    throw new ViewerError("invalid-file", "XZ index 已损坏。");
  }
  const state = { offset: 1 };
  const records = readVarint(index, state);
  if (records > 100_000) throw new ViewerError("resource-limit", "XZ block 数量超过 10 万条上限。");
  let unpadded = 0;
  let uncompressed = 0;
  for (let indexRecord = 0; indexRecord < records; indexRecord += 1) {
    unpadded += readVarint(index, state);
    uncompressed += readVarint(index, state);
  }
  for (let cursor = state.offset; cursor < index.length - 4; cursor += 1) {
    if (index[cursor] !== 0) throw new ViewerError("invalid-file", "XZ index padding 无效。");
  }
  const checkNames: Readonly<Record<number, string>> = { 0: "无", 1: "CRC32", 4: "CRC64", 10: "SHA-256" };
  return wrapper(format, "XZ", [
    { label: "Stream flags", value: hex((header[6] << 8) | header[7], 4) },
    { label: "完整性校验", value: checkNames[header[7] & 0x0f] ?? `未知 (${header[7] & 0x0f})` },
    { label: "Index 大小", value: `${formatBytes(indexSize)} 字节` },
    { label: "Block 数量", value: formatBytes(records) },
    { label: "Block 未填充总大小", value: `${formatBytes(unpadded)} 字节` },
    { label: "原始总大小", value: `${formatBytes(uncompressed)} 字节` },
  ]);
}

async function parseZstd(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  if (reader.size < 6) throw new ViewerError("invalid-file", "Zstandard frame header 已截断。");
  const fixed = await reader.read(0, 5, "header");
  if (view(fixed).getUint32(0, true) !== 0xfd2fb528) {
    throw new ViewerError("invalid-file", "文件不是有效的 Zstandard frame。");
  }
  const descriptor = fixed[4];
  if (descriptor & 8) throw new ViewerError("invalid-file", "Zstandard frame descriptor 包含保留位。");
  const singleSegment = Boolean(descriptor & 0x20);
  const dictionaryFlag = descriptor & 3;
  const dictionarySize = [0, 1, 2, 4][dictionaryFlag];
  const contentFlag = descriptor >>> 6;
  const contentSizeLength = contentFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][contentFlag];
  const optionalLength = (singleSegment ? 0 : 1) + dictionarySize + contentSizeLength;
  const optional = optionalLength ? await reader.read(5, optionalLength, "header") : new Uint8Array();
  const optionalView = view(optional);
  let cursor = 0;
  let windowSize: number | undefined;
  if (!singleSegment) {
    const descriptorByte = optional[cursor++];
    const exponent = descriptorByte >>> 3;
    const base = 2 ** (10 + exponent);
    windowSize = base + (base / 8) * (descriptorByte & 7);
  }
  let dictionaryId: number | undefined;
  if (dictionarySize) {
    dictionaryId = dictionarySize === 1 ? optionalView.getUint8(cursor)
      : dictionarySize === 2 ? optionalView.getUint16(cursor, true)
      : optionalView.getUint32(cursor, true);
    cursor += dictionarySize;
  }
  let contentSize: number | undefined;
  if (contentSizeLength) {
    contentSize = contentSizeLength === 1 ? optionalView.getUint8(cursor)
      : contentSizeLength === 2 ? optionalView.getUint16(cursor, true) + 256
      : contentSizeLength === 4 ? optionalView.getUint32(cursor, true)
      : readUint64(optionalView, cursor);
  }
  return wrapper(format, "Zstandard frame", [
    { label: "Frame header descriptor", value: hex(descriptor, 2) },
    { label: "单段模式", value: singleSegment ? "是" : "否" },
    { label: "内容大小", value: contentSize === undefined ? "未提供" : `${formatBytes(contentSize)} 字节` },
    { label: "窗口大小", value: windowSize === undefined ? "等于内容大小" : `${formatBytes(windowSize)} 字节` },
    { label: "Dictionary ID", value: dictionaryId === undefined ? "未提供" : String(dictionaryId) },
    { label: "内容校验和", value: descriptor & 4 ? "有" : "无" },
  ]);
}

async function parseBzip2(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  const header = await reader.read(0, 4, "header");
  if (ascii(header.subarray(0, 3)) !== "BZh" || header[3] < 0x31 || header[3] > 0x39) {
    throw new ViewerError("invalid-file", "文件不是有效的 bzip2 stream。");
  }
  return wrapper(format, "bzip2", [
    { label: "签名", value: ascii(header) },
    { label: "块大小参数", value: `${header[3] - 0x30} × 100,000 字节` },
  ]);
}

async function parseLz4(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  if (reader.size < 7) throw new ViewerError("invalid-file", "LZ4 frame descriptor 已截断。");
  const fixed = await reader.read(0, 6, "header");
  if (view(fixed).getUint32(0, true) !== 0x184d2204 || (fixed[4] & 0xc0) !== 0x40 || (fixed[4] & 2)) {
    throw new ViewerError("invalid-file", "文件不是有效的 LZ4 frame。");
  }
  const flg = fixed[4];
  const bd = fixed[5];
  const optionalLength = (flg & 8 ? 8 : 0) + (flg & 1 ? 4 : 0) + 1;
  const optional = await reader.read(6, optionalLength, "header");
  const optionalView = view(optional);
  let cursor = 0;
  let contentSize: number | undefined;
  if (flg & 8) {
    contentSize = readUint64(optionalView, cursor);
    cursor += 8;
  }
  let dictionaryId: number | undefined;
  if (flg & 1) dictionaryId = optionalView.getUint32(cursor, true);
  const maximumBlock = [undefined, undefined, undefined, undefined, "64 KiB", "256 KiB", "1 MiB", "4 MiB"][bd >>> 4];
  if (!maximumBlock || (bd & 0x8f)) throw new ViewerError("invalid-file", "LZ4 frame block descriptor 无效。");
  return wrapper(format, "LZ4 frame", [
    { label: "Frame flags", value: hex(flg, 2) },
    { label: "最大块大小", value: maximumBlock },
    { label: "块独立", value: flg & 0x20 ? "是" : "否" },
    { label: "块校验和", value: flg & 0x10 ? "有" : "无" },
    { label: "内容大小", value: contentSize === undefined ? "未提供" : `${formatBytes(contentSize)} 字节` },
    { label: "Dictionary ID", value: dictionaryId === undefined ? "未提供" : String(dictionaryId) },
    { label: "内容校验和", value: flg & 4 ? "有" : "无" },
  ]);
}

async function parseZlib(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  if (reader.size < 6) throw new ViewerError("invalid-file", "zlib header/trailer 已截断。");
  const header = await reader.read(0, 2, "header");
  const cmf = header[0];
  const flg = header[1];
  if ((cmf & 0x0f) !== 8 || (cmf >>> 4) > 7 || ((cmf << 8) + flg) % 31 !== 0) {
    throw new ViewerError("invalid-file", "文件不是有效的 zlib stream。");
  }
  const hasDictionary = Boolean(flg & 0x20);
  const fields: MetadataField[] = [
    { label: "CMF / FLG", value: `${hex(cmf, 2)} / ${hex(flg, 2)}` },
    { label: "压缩方法", value: "DEFLATE (8)" },
    { label: "窗口大小", value: `${1 << ((cmf >>> 4) + 8)} 字节` },
    { label: "压缩级别提示", value: ["最快", "快速", "默认", "最大压缩"][flg >>> 6] },
    { label: "预设字典", value: hasDictionary ? "是" : "否" },
  ];
  const headerLength = hasDictionary ? 6 : 2;
  if (reader.size < headerLength + 4) throw new ViewerError("invalid-file", "zlib header 与 trailer 重叠。");
  if (hasDictionary) {
    const dictionary = view(await reader.read(2, 4, "header")).getUint32(0, false);
    fields.push({ label: "Dictionary ID (Adler-32)", value: hex(dictionary) });
  }
  const adler = view(await reader.read(reader.size - 4, 4, "trailer")).getUint32(0, false);
  fields.push({ label: "数据 Adler-32", value: hex(adler) });
  return wrapper(format, "zlib", fields);
}

export async function parseWrapper(reader: RangeReader, format: IdentifiedFormat): Promise<ArchiveMetadata> {
  switch (format.id) {
    case "gzip": return parseGzip(reader, format);
    case "xz": return parseXz(reader, format);
    case "zstd": return parseZstd(reader, format);
    case "bzip2": return parseBzip2(reader, format);
    case "lz4": return parseLz4(reader, format);
    case "zlib": return parseZlib(reader, format);
    case "deflate":
    case "brotli":
      return {
        format: format.id === "deflate" ? "raw DEFLATE" : "Brotli 裸流",
        kind: "bare",
        detectedBy: `仅由后缀 ${format.extension} 推断`,
        fields: [{ label: "文件大小", value: `${formatBytes(reader.size)} 字节` }],
        limitation: "该裸流没有可独立读取的标准容器元数据；未进行全量解码验证。",
      };
    default:
      throw new ViewerError("invalid-file", "不是受支持的压缩包装格式。");
  }
}
