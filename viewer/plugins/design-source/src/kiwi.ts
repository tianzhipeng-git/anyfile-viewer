// Pure-TypeScript, CSP-safe (no eval / new Function) Kiwi binary schema & message decoder.
// Matches Evan Wallace's Kiwi wire format used by Figma .fig files.

export type KiwiFieldKind = "ENUM" | "STRUCT" | "MESSAGE";

export type KiwiField = {
  readonly name: string;
  readonly typeId: number;
  readonly isArray: boolean;
  readonly value: number;
};

export type KiwiDefinition = {
  readonly name: string;
  readonly kind: KiwiFieldKind;
  readonly fields: readonly KiwiField[];
  readonly enumByValue?: ReadonlyMap<number, string>;
  readonly fieldByTag?: ReadonlyMap<number, KiwiField>;
};

export type KiwiSchema = {
  readonly definitions: readonly KiwiDefinition[];
  readonly byName: ReadonlyMap<string, KiwiDefinition>;
};

const MAX_DEFINITIONS = 4096;
const MAX_FIELDS = 4096;
const MAX_ARRAY_LENGTH = 500_000;
const MAX_DEPTH = 64;

const floatInt32 = new Int32Array(1);
const float32 = new Float32Array(floatInt32.buffer);

export class KiwiByteBuffer {
  private index = 0;
  private readonly textDecoder = new TextDecoder();

  constructor(private readonly data: Uint8Array) {}

  get offset(): number {
    return this.index;
  }

  get length(): number {
    return this.data.length;
  }

  readByte(): number {
    if (this.index >= this.data.length) {
      throw new Error("Unexpected end of Kiwi buffer");
    }
    return this.data[this.index++]!;
  }

  readByteArray(): Uint8Array {
    const length = this.readVarUint();
    if (length > this.data.length - this.index) {
      throw new Error("Kiwi byte array exceeds remaining buffer");
    }
    const slice = this.data.subarray(this.index, this.index + length);
    this.index += length;
    return slice;
  }

  readVarFloat(): number {
    const first = this.readByte();
    if (first === 0) return 0;
    if (this.index + 3 > this.data.length) {
      throw new Error("Unexpected end of Kiwi float");
    }
    let bits =
      first |
      (this.data[this.index]! << 8) |
      (this.data[this.index + 1]! << 16) |
      (this.data[this.index + 2]! << 24);
    this.index += 3;
    // Kiwi rotates the exponent into the lowest byte so 0.0 encodes as a single 0x00 byte.
    bits = (bits << 23) | (bits >>> 9);
    floatInt32[0] = bits;
    return float32[0]!;
  }

  readVarUint(): number {
    let value = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = this.readByte();
      value |= (byte & 0x7f) << shift;
      shift += 7;
    } while ((byte & 0x80) !== 0 && shift < 35);
    return value >>> 0;
  }

  readVarInt(): number {
    const value = this.readVarUint();
    return (value & 1) !== 0 ? ~(value >>> 1) : value >>> 1;
  }

  readVarUint64(): bigint {
    let value = BigInt(0);
    let shift = BigInt(0);
    const step = BigInt(7);
    const highShift = BigInt(56);
    let byte = 0;
    let count = 0;
    do {
      byte = this.readByte();
      if (count === 8) {
        value |= BigInt(byte) << highShift;
        break;
      }
      value |= BigInt(byte & 0x7f) << shift;
      shift += step;
      count += 1;
    } while ((byte & 0x80) !== 0 && count < 9);
    return value;
  }

  readVarInt64(): bigint {
    const value = this.readVarUint64();
    const one = BigInt(1);
    return (value & one) !== BigInt(0) ? ~(value >> one) : value >> one;
  }

  readString(): string {
    const start = this.index;
    while (this.index < this.data.length && this.data[this.index] !== 0) {
      this.index += 1;
    }
    if (this.index >= this.data.length) {
      throw new Error("Unterminated Kiwi string");
    }
    const str = this.textDecoder.decode(this.data.subarray(start, this.index));
    this.index += 1; // consume null terminator
    return str;
  }
}

export function decodeBinarySchema(bytes: Uint8Array): KiwiSchema {
  const bb = new KiwiByteBuffer(bytes);
  const definitionCount = bb.readVarUint();
  if (definitionCount > MAX_DEFINITIONS) {
    throw new Error("Kiwi schema exceeds definition limit");
  }

  const definitions: KiwiDefinition[] = [];
  const byName = new Map<string, KiwiDefinition>();

  for (let i = 0; i < definitionCount; i += 1) {
    const name = bb.readString();
    const kindByte = bb.readByte();
    const kind: KiwiFieldKind =
      kindByte === 0 ? "ENUM" : kindByte === 1 ? "STRUCT" : kindByte === 2 ? "MESSAGE" : (() => {
        throw new Error(`Unknown Kiwi definition kind: ${kindByte}`);
      })();
    const fieldCount = bb.readVarUint();
    if (fieldCount > MAX_FIELDS) {
      throw new Error("Kiwi definition exceeds field limit");
    }

    const fields: KiwiField[] = [];
    const enumByValue = kind === "ENUM" ? new Map<number, string>() : undefined;
    const fieldByTag = kind === "MESSAGE" ? new Map<number, KiwiField>() : undefined;

    for (let j = 0; j < fieldCount; j += 1) {
      const fieldName = bb.readString();
      const typeId = bb.readVarInt();
      const isArray = (bb.readByte() & 1) !== 0;
      const value = bb.readVarUint();
      const field: KiwiField = { name: fieldName, typeId, isArray, value };
      fields.push(field);
      if (enumByValue) enumByValue.set(value, fieldName);
      if (fieldByTag) fieldByTag.set(value, field);
    }

    const def: KiwiDefinition = { name, kind, fields, enumByValue, fieldByTag };
    definitions.push(def);
    byName.set(name, def);
  }

  return { definitions, byName };
}

function decodeValue(
  bb: KiwiByteBuffer,
  schema: KiwiSchema,
  typeId: number,
  depth: number,
): unknown {
  if (depth > MAX_DEPTH) {
    throw new Error("Kiwi nesting depth limit exceeded");
  }
  switch (typeId) {
    case -1:
      return bb.readByte() !== 0;
    case -2:
      return bb.readByte();
    case -3:
      return bb.readVarInt();
    case -4:
      return bb.readVarUint();
    case -5:
      return bb.readVarFloat();
    case -6:
      return bb.readString();
    case -7: {
      const val = bb.readVarInt64();
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
      return val >= minSafe && val <= maxSafe ? Number(val) : val.toString();
    }
    case -8: {
      const val = bb.readVarUint64();
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      return val <= maxSafe ? Number(val) : val.toString();
    }
    default: {
      const def = schema.definitions[typeId];
      if (!def) {
        throw new Error(`Invalid Kiwi type id: ${typeId}`);
      }
      return decodeDefinition(bb, schema, def, depth + 1);
    }
  }
}

function decodeFieldValue(
  bb: KiwiByteBuffer,
  schema: KiwiSchema,
  field: KiwiField,
  depth: number,
): unknown {
  if (!field.isArray) {
    return decodeValue(bb, schema, field.typeId, depth);
  }
  if (field.typeId === -2) {
    return bb.readByteArray();
  }
  const length = bb.readVarUint();
  if (length > MAX_ARRAY_LENGTH) {
    throw new Error("Kiwi array length limit exceeded");
  }
  const items = new Array<unknown>(length);
  for (let i = 0; i < length; i += 1) {
    items[i] = decodeValue(bb, schema, field.typeId, depth);
  }
  return items;
}

function decodeDefinition(
  bb: KiwiByteBuffer,
  schema: KiwiSchema,
  def: KiwiDefinition,
  depth: number,
): unknown {
  if (def.kind === "ENUM") {
    const raw = bb.readVarUint();
    return def.enumByValue?.get(raw) ?? raw;
  }

  if (def.kind === "STRUCT") {
    const obj: Record<string, unknown> = {};
    for (const field of def.fields) {
      obj[field.name] = decodeFieldValue(bb, schema, field, depth);
    }
    return obj;
  }

  // MESSAGE: repeated (tag: varuint) followed by field value, terminated by tag 0.
  const obj: Record<string, unknown> = {};
  while (true) {
    const tag = bb.readVarUint();
    if (tag === 0) break;
    const field = def.fieldByTag?.get(tag);
    if (!field) {
      throw new Error(`Unknown field tag ${tag} in Kiwi message ${def.name}`);
    }
    obj[field.name] = decodeFieldValue(bb, schema, field, depth);
  }
  return obj;
}

export function decodeKiwiMessage(
  schema: KiwiSchema,
  messageName: string,
  bytes: Uint8Array,
): Record<string, unknown> {
  const def = schema.byName.get(messageName);
  if (!def) {
    throw new Error(`Kiwi root message "${messageName}" not found in schema`);
  }
  const bb = new KiwiByteBuffer(bytes);
  const decoded = decodeDefinition(bb, schema, def, 0);
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Decoded Kiwi root is not an object");
  }
  return decoded as Record<string, unknown>;
}
