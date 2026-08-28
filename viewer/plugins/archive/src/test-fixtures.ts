import { zipSync } from "fflate";

import { crc32 } from "./binary";

export function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function zipFixture(count = 2): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "../unsafe.txt": new TextEncoder().encode("ordinary payload must stay unread"),
    "资料/说明.txt": new TextEncoder().encode("unicode payload"),
  };
  for (let index = 2; index < count; index += 1) files[`folder/file-${index}.txt`] = new Uint8Array();
  return zipSync(files, { level: 0, comment: "archive comment" });
}

function centralOffsets(bytes: Uint8Array): number[] {
  const result: number[] = [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    if (data.getUint32(offset, true) === 0x02014b50) result.push(offset);
  }
  return result;
}

export function duplicateZipFixture(): Uint8Array {
  const bytes = zipSync({ "same-a.txt": new Uint8Array(), "same-b.txt": new Uint8Array() }, { level: 0 });
  const offsets = centralOffsets(bytes);
  bytes.set(new TextEncoder().encode("same-a.txt"), offsets[1] + 46);
  return bytes;
}

export function encryptedEntryZipFixture(): Uint8Array {
  const bytes = zipFixture();
  const offset = centralOffsets(bytes)[0];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  data.setUint16(offset + 8, data.getUint16(offset + 8, true) | 1, true);
  return bytes;
}

export function cp437ZipFixture(): Uint8Array {
  const filename = Uint8Array.of(0x82, 0x2e, 0x74, 0x78, 0x74);
  const local = new Uint8Array(30 + filename.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(26, filename.length, true);
  local.set(filename, 30);
  const central = new Uint8Array(46 + filename.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(28, filename.length, true);
  central.set(filename, 46);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);
  return concatenate(local, central, eocd);
}

export function zipPayloadRanges(bytes: Uint8Array): readonly { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length && data.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = data.getUint32(offset + 18, true);
    const dataStart = offset + 30 + data.getUint16(offset + 26, true) + data.getUint16(offset + 28, true);
    ranges.push({ start: dataStart, end: dataStart + compressedSize });
    offset = dataStart + compressedSize;
  }
  return ranges;
}

function writeOctal(target: Uint8Array, offset: number, length: number, value: number) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  target.set(new TextEncoder().encode(encoded), offset);
  target[offset + length - 1] = 0;
}

function writeTarChecksum(header: Uint8Array) {
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((total, byte) => total + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, "0");
  header.set(new TextEncoder().encode(checksumText), 148);
  header[154] = 0;
  header[155] = 0x20;
}

function tarHeader(name: string, size: number, type = "0", link = "", gnu = false): Uint8Array {
  const header = new Uint8Array(512);
  const encoder = new TextEncoder();
  header.set(encoder.encode(name).subarray(0, 100), 0);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 501);
  writeOctal(header, 116, 8, 20);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 1_700_000_000);
  header[156] = type.charCodeAt(0);
  header.set(encoder.encode(link).subarray(0, 100), 157);
  header.set(encoder.encode(gnu ? "ustar " : "ustar\0"), 257);
  header.set(encoder.encode(gnu ? " \0" : "00"), 263);
  header.set(encoder.encode("owner"), 265);
  header.set(encoder.encode("group"), 297);
  writeTarChecksum(header);
  return header;
}

function padded(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(Math.ceil(data.length / 512) * 512);
  result.set(data);
  return result;
}

function paxRecord(key: string, value: string): Uint8Array {
  const encoder = new TextEncoder();
  let length = encoder.encode(`0 ${key}=${value}\n`).length;
  while (encoder.encode(`${length} ${key}=${value}\n`).length !== length) {
    length = encoder.encode(`${length} ${key}=${value}\n`).length;
  }
  return encoder.encode(`${length} ${key}=${value}\n`);
}

export function tarFixture() {
  const payload = new TextEncoder().encode("ordinary tar payload");
  const pax = paxRecord("path", "folder/来自-pax.txt");
  const parts = [
    tarHeader("PaxHeader", pax.length, "x"), padded(pax),
    tarHeader("ignored.txt", payload.length), padded(payload),
    tarHeader("shortcut", 0, "2", "folder/来自-pax.txt"),
    new Uint8Array(1024),
  ];
  const bytes = concatenate(...parts);
  const payloadStart = 512 + padded(pax).length + 512;
  return { bytes, payload: { start: payloadStart, end: payloadStart + payload.length } };
}

export function gnuTarFixture(): Uint8Array {
  const longPath = `${"long-directory/".repeat(9)}file.txt`;
  const longName = concatenate(new TextEncoder().encode(longPath), Uint8Array.of(0));
  return concatenate(
    tarHeader("././@LongLink", longName.length, "L", "", true), padded(longName),
    tarHeader("placeholder", 0, "0", "", true),
    tarHeader("sparse.bin", 0, "S", "", true),
    new Uint8Array(1024),
  );
}

export function negativeMtimeTarFixture(): Uint8Array {
  const header = tarHeader("pre-epoch.txt", 0, "0", "", true);
  header.fill(0xff, 136, 148);
  writeTarChecksum(header);
  return concatenate(header, new Uint8Array(1024));
}

export function invalidSizeTarFixture(): Uint8Array {
  const header = tarHeader("invalid-size.txt", 0);
  header.fill(0, 124, 136);
  header.set(new TextEncoder().encode("00000000009\0"), 124);
  writeTarChecksum(header);
  return concatenate(header, new Uint8Array(1024));
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

export function zip64Fixture(): Uint8Array {
  const record = new Uint8Array(56);
  const recordView = new DataView(record.buffer);
  recordView.setUint32(0, 0x06064b50, true);
  recordView.setBigUint64(4, BigInt(44), true);
  recordView.setUint16(12, 45, true);
  recordView.setUint16(14, 45, true);
  const locator = new Uint8Array(20);
  const locatorView = new DataView(locator.buffer);
  locatorView.setUint32(0, 0x07064b50, true);
  locatorView.setBigUint64(8, BigInt(0), true);
  locatorView.setUint32(16, 1, true);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 0xffff, true);
  eocdView.setUint16(10, 0xffff, true);
  eocdView.setUint32(12, 0xffffffff, true);
  eocdView.setUint32(16, 0xffffffff, true);
  return concatenate(record, locator, eocd);
}

export const wrapperFixtures: Readonly<Record<string, Uint8Array>> = (() => {
  const gzipHeader = Uint8Array.of(0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3);
  const gzipTrailer = concatenate(uint32(0x12345678), uint32(42));
  const gzipOptionsHeader = concatenate(
    Uint8Array.of(0x1f, 0x8b, 8, 0x18, 0, 0, 0, 0, 0, 3),
    new TextEncoder().encode("original.tar\0comment\0"),
  );

  const xzFlags = Uint8Array.of(0, 1);
  const xzHeader = concatenate(Uint8Array.of(0xfd, 0x37, 0x7a, 0x58, 0x5a, 0), xzFlags, uint32(crc32(xzFlags)));
  const indexBody = Uint8Array.of(0, 1, 1, 3);
  const xzIndex = concatenate(indexBody, uint32(crc32(indexBody)));
  const footerFields = concatenate(uint32(xzIndex.length / 4 - 1), xzFlags, Uint8Array.of(0x59, 0x5a));
  const xzFooter = concatenate(uint32(crc32(footerFields.subarray(0, 6))), footerFields);

  const zstd = Uint8Array.of(0x28, 0xb5, 0x2f, 0xfd, 0x24, 42, 0);
  const bzip2 = Uint8Array.of(0x42, 0x5a, 0x68, 0x39, 0);
  const lz4 = concatenate(Uint8Array.of(0x04, 0x22, 0x4d, 0x18, 0x68, 0x70),
    Uint8Array.of(42, 0, 0, 0, 0, 0, 0, 0, 0));
  const zlib = concatenate(Uint8Array.of(0x78, 0x9c, 0), Uint8Array.of(0x12, 0x34, 0x56, 0x78));
  const zlibDictionary = concatenate(
    Uint8Array.of(0x78, 0x20, 0x11, 0x22, 0x33, 0x44, 0),
    Uint8Array.of(0x12, 0x34, 0x56, 0x78),
  );
  return {
    "sample.gz": concatenate(gzipHeader, Uint8Array.of(1, 2, 3), gzipTrailer),
    "options.gz": concatenate(gzipOptionsHeader, Uint8Array.of(1, 2, 3), gzipTrailer),
    "sample.xz": concatenate(xzHeader, Uint8Array.of(1, 2, 3), xzIndex, xzFooter),
    "sample.zst": zstd,
    "sample.bz2": bzip2,
    "sample.lz4": lz4,
    "sample.zlib": zlib,
    "dictionary.zlib": zlibDictionary,
    "sample.deflate": Uint8Array.of(1, 2, 3),
    "sample.br": Uint8Array.of(1, 2, 3),
  };
})();
