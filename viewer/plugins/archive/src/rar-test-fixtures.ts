import { crc32 } from "./binary";
import { concatenate } from "./test-fixtures";

const encoder = new TextEncoder();

function uint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function vint(value: number): Uint8Array {
  const bytes: number[] = [];
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return Uint8Array.from(bytes);
}

function rar5Block(
  type: number,
  flags: number,
  specific: Uint8Array,
  data: Uint8Array = new Uint8Array(),
  extra: Uint8Array = new Uint8Array(),
): Uint8Array {
  const body = concatenate(
    vint(type),
    vint(flags),
    flags & 1 ? vint(extra.length) : new Uint8Array(),
    flags & 2 ? vint(data.length) : new Uint8Array(),
    specific,
    extra,
  );
  const size = vint(body.length);
  const checksum = uint32(crc32(concatenate(size, body)));
  return concatenate(checksum, size, body, data);
}

export function rar5Fixture(options: { sfx?: boolean; volume?: boolean } = {}) {
  const signature = Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00);
  const prefix = options.sfx ? new Uint8Array(257).fill(0x90) : new Uint8Array();
  const archiveFlags = options.volume ? 3 : 4;
  const main = rar5Block(1, 0, concatenate(vint(archiveFlags), options.volume ? vint(2) : new Uint8Array()));
  const payload = encoder.encode("RAR5 payload must stay unread");
  const name = encoder.encode("资料/说明.txt");
  const encryptionExtra = concatenate(vint(1), vint(1));
  const fileSpecific = concatenate(
    vint(6),
    vint(123),
    vint(0o100644),
    uint32(1_700_000_000),
    uint32(0x12345678),
    vint(3 << 7),
    vint(1),
    vint(name.length),
    name,
  );
  const file = rar5Block(2, 3, fileSpecific, payload, encryptionExtra);
  const unsafeName = encoder.encode("../unsafe.txt");
  const unsafeSpecific = concatenate(vint(0), vint(0), vint(0), vint(0), vint(0), vint(unsafeName.length), unsafeName);
  const unsafe = rar5Block(2, 0, unsafeSpecific);
  const end = rar5Block(5, 0, vint(0));
  const bytes = concatenate(prefix, signature, main, file, unsafe, end);
  const payloadStart = prefix.length + signature.length + main.length + file.length - payload.length;
  return { bytes, payload: { start: payloadStart, end: payloadStart + payload.length } };
}

export function encryptedHeadersRar5Fixture(): Uint8Array {
  const signature = Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00);
  const encryption = rar5Block(4, 0, concatenate(vint(0), vint(0), Uint8Array.of(15), new Uint8Array(16)));
  return concatenate(signature, encryption, new Uint8Array(16));
}

function rar4Header(type: number, flags: number, body: Uint8Array): Uint8Array {
  const header = concatenate(new Uint8Array(2), Uint8Array.of(type), uint16(flags), uint16(7 + body.length), body);
  new DataView(header.buffer).setUint16(0, crc32(header.subarray(2)) & 0xffff, true);
  return header;
}

export function rar4Fixture() {
  const signature = Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00);
  const main = rar4Header(0x73, 0, new Uint8Array(6));
  const payload = encoder.encode("RAR4 payload must stay unread");
  const name = encoder.encode("folder/legacy.txt");
  const fileBody = concatenate(
    uint32(payload.length),
    uint32(321),
    Uint8Array.of(3),
    uint32(0x87654321),
    uint32(0x579fbf7d),
    Uint8Array.of(29, 0x33),
    uint16(name.length),
    uint32(0o100644),
    name,
  );
  const file = rar4Header(0x74, 0x8000, fileBody);
  const end = rar4Header(0x7b, 0, new Uint8Array());
  const bytes = concatenate(signature, main, file, payload, end);
  const payloadStart = signature.length + main.length + file.length;
  return { bytes, payload: { start: payloadStart, end: payloadStart + payload.length } };
}
