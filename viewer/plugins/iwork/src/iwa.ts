/** Apple iWork Archive (.iwa): Snappy-framed protobuf object streams. */

export class IwaFormatError extends Error {}
export class IwaLimitError extends Error {}

export type IwaMessage = { readonly type: number; readonly data: Uint8Array };
export type IwaObject = { readonly id: number; readonly messages: readonly IwaMessage[] };
export type ProtoFields = Map<number, (number | Uint8Array)[]>;

function fail(message: string): never {
  throw new IwaFormatError(message);
}

function readVarint(bytes: Uint8Array, position: { offset: number }) {
  let value = 0;
  let scale = 1;
  for (let index = 0; index < 10; index += 1) {
    if (position.offset >= bytes.length) fail("Truncated varint.");
    const byte = bytes[position.offset++]!;
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) return value;
    scale *= 128;
  }
  return fail("Varint is too long.");
}

/** Decodes one raw Snappy block, refusing output beyond `maxBytes`. */
export function decompressSnappy(input: Uint8Array, maxBytes: number) {
  const position = { offset: 0 };
  const length = readVarint(input, position);
  if (length > maxBytes) throw new IwaLimitError("Snappy block exceeds the output limit.");
  const output = new Uint8Array(length);
  let written = 0;
  let offset = position.offset;
  while (offset < input.length) {
    const tag = input[offset++]!;
    const kind = tag & 3;
    if (kind === 0) {
      let size = tag >>> 2;
      if (size >= 60) {
        const extra = size - 59;
        if (offset + extra > input.length) fail("Truncated Snappy literal.");
        size = 0;
        for (let index = 0; index < extra; index += 1) size += input[offset + index]! * 2 ** (8 * index);
        offset += extra;
      }
      size += 1;
      if (offset + size > input.length || written + size > length) fail("Invalid Snappy literal.");
      output.set(input.subarray(offset, offset + size), written);
      offset += size;
      written += size;
      continue;
    }
    let size: number;
    let distance: number;
    if (kind === 1) {
      if (offset >= input.length) fail("Truncated Snappy copy.");
      size = ((tag >>> 2) & 7) + 4;
      distance = ((tag >>> 5) << 8) | input[offset++]!;
    } else {
      const width = kind === 2 ? 2 : 4;
      if (offset + width > input.length) fail("Truncated Snappy copy.");
      size = (tag >>> 2) + 1;
      distance = 0;
      for (let index = 0; index < width; index += 1) distance += input[offset + index]! * 2 ** (8 * index);
      offset += width;
    }
    if (distance === 0 || distance > written || written + size > length) fail("Invalid Snappy copy.");
    for (let index = 0; index < size; index += 1, written += 1) output[written] = output[written - distance]!;
  }
  if (written !== length) fail("Snappy block length mismatch.");
  return output;
}

/** Removes the IWA chunk framing (type 0, uint24 length, raw Snappy block). */
export function decodeIwaStream(bytes: Uint8Array, maxBytes: number) {
  const blocks: Uint8Array[] = [];
  let total = 0;
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length || bytes[offset] !== 0) fail("Invalid IWA chunk header.");
    const size = bytes[offset + 1]! | (bytes[offset + 2]! << 8) | (bytes[offset + 3]! << 16);
    offset += 4;
    if (offset + size > bytes.length) fail("Truncated IWA chunk.");
    const block = decompressSnappy(bytes.subarray(offset, offset + size), maxBytes - total);
    blocks.push(block);
    total += block.length;
    offset += size;
  }
  if (blocks.length === 1) return blocks[0]!;
  const output = new Uint8Array(total);
  let written = 0;
  for (const block of blocks) {
    output.set(block, written);
    written += block.length;
  }
  return output;
}

/** Minimal schema-less protobuf decoder: varints and length-delimited payloads only. */
export function readProto(bytes: Uint8Array): ProtoFields {
  const fields: ProtoFields = new Map();
  const position = { offset: 0 };
  while (position.offset < bytes.length) {
    const key = readVarint(bytes, position);
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (field === 0) fail("Invalid protobuf field.");
    let value: number | Uint8Array | undefined;
    if (wire === 0) value = readVarint(bytes, position);
    else if (wire === 2) {
      const size = readVarint(bytes, position);
      if (position.offset + size > bytes.length) fail("Truncated protobuf field.");
      value = bytes.subarray(position.offset, position.offset + size);
      position.offset += size;
    } else if (wire === 1 || wire === 5) {
      position.offset += wire === 1 ? 8 : 4;
      if (position.offset > bytes.length) fail("Truncated protobuf field.");
    } else fail("Unsupported protobuf wire type.");
    if (value === undefined) continue;
    const values = fields.get(field);
    if (values) values.push(value);
    else fields.set(field, [value]);
  }
  return fields;
}

export function protoNumber(fields: ProtoFields, field: number) {
  const value = fields.get(field)?.[0];
  return typeof value === "number" ? value : undefined;
}

export function protoMessages(fields: ProtoFields, field: number) {
  return (fields.get(field) ?? []).filter((value): value is Uint8Array => value instanceof Uint8Array);
}

/** Parses a decompressed IWA stream into archive objects and their typed messages. */
export function readIwaObjects(stream: Uint8Array) {
  const objects: IwaObject[] = [];
  const position = { offset: 0 };
  while (position.offset < stream.length) {
    const infoLength = readVarint(stream, position);
    if (position.offset + infoLength > stream.length) fail("Truncated IWA archive info.");
    const info = readProto(stream.subarray(position.offset, position.offset + infoLength));
    position.offset += infoLength;
    const id = protoNumber(info, 1);
    if (id === undefined) fail("IWA archive has no identifier.");
    const messages: IwaMessage[] = [];
    for (const raw of protoMessages(info, 2)) {
      const messageInfo = readProto(raw);
      const type = protoNumber(messageInfo, 1) ?? 0;
      const length = protoNumber(messageInfo, 3) ?? 0;
      if (position.offset + length > stream.length) fail("Truncated IWA message.");
      messages.push({ type, data: stream.subarray(position.offset, position.offset + length) });
      position.offset += length;
    }
    objects.push({ id, messages });
  }
  return objects;
}
