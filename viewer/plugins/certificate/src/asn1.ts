/** Minimal DER reader: single-byte tags, definite lengths, bounded node budget. */

const MAX_NODES = 4096;
const MAX_LENGTH_OCTETS = 3;

export class Asn1Error extends Error {}

export interface DerNode {
  readonly tag: number;
  readonly constructed: boolean;
  readonly start: number;
  readonly contentStart: number;
  readonly length: number;
  readonly end: number;
}

export interface DerBudget {
  nodes: number;
}

export function createBudget(): DerBudget {
  return { nodes: MAX_NODES };
}

export function readNodeHeader(bytes: Uint8Array, offset: number, limit: number, budget?: DerBudget): DerNode {
  if (offset < 0 || offset + 2 > limit) throw new Asn1Error("Truncated DER element.");
  if (budget) {
    budget.nodes -= 1;
    if (budget.nodes < 0) throw new Asn1Error("Too many DER elements.");
  }
  const tag = bytes[offset]!;
  if ((tag & 0x1f) === 0x1f) throw new Asn1Error("Unsupported high-tag-number DER element.");
  const first = bytes[offset + 1]!;
  let length = first;
  let header = 2;
  if (first === 0x80) throw new Asn1Error("Indefinite DER length is not allowed.");
  if (first > 0x80) {
    const octets = first & 0x7f;
    if (octets === 0 || octets > MAX_LENGTH_OCTETS || offset + 2 + octets > limit) {
      throw new Asn1Error("Unsupported DER length.");
    }
    length = 0;
    for (let i = 0; i < octets; i += 1) length = length * 256 + bytes[offset + 2 + i]!;
    header += octets;
  }
  return { tag, constructed: (tag & 0x20) !== 0, start: offset, contentStart: offset + header, length, end: offset + header + length };
}

export function readNode(bytes: Uint8Array, offset: number, limit: number, budget?: DerBudget): DerNode {
  const node = readNodeHeader(bytes, offset, limit, budget);
  if (node.end > limit) throw new Asn1Error("DER element exceeds its container.");
  return node;
}

export function childNodes(bytes: Uint8Array, node: DerNode, budget = createBudget()): DerNode[] {
  if (!node.constructed) return [];
  const children: DerNode[] = [];
  let offset = node.contentStart;
  while (offset < node.end) {
    const child = readNode(bytes, offset, node.end, budget);
    children.push(child);
    offset = child.end;
  }
  return children;
}

export function child(bytes: Uint8Array, node: DerNode, index: number, budget?: DerBudget): DerNode | undefined {
  let offset = node.contentStart;
  let position = 0;
  const limit = node.end;
  while (offset < limit) {
    const current = readNode(bytes, offset, limit, budget);
    if (position === index) return current;
    position += 1;
    offset = current.end;
  }
  return undefined;
}

export function content(bytes: Uint8Array, node: DerNode): Uint8Array {
  return bytes.subarray(node.contentStart, node.end);
}

export function readOid(bytes: Uint8Array, node: DerNode): string {
  const raw = content(bytes, node);
  if (raw.length === 0 || raw.length > 64) throw new Asn1Error("Invalid OBJECT IDENTIFIER.");
  const first = raw[0]!;
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  let shifted = false;
  for (let i = 1; i < raw.length; i += 1) {
    const byte = raw[i]!;
    value = value * 128 + (byte & 0x7f);
    shifted = (byte & 0x80) !== 0;
    if (!shifted) {
      parts.push(value);
      value = 0;
    }
  }
  if (shifted) throw new Asn1Error("Truncated OBJECT IDENTIFIER.");
  return parts.join(".");
}

/** Returns the unsigned integer bytes without the sign octet. */
export function unsignedBytes(bytes: Uint8Array, node: DerNode): Uint8Array {
  const raw = content(bytes, node);
  let offset = 0;
  while (offset < raw.length - 1 && raw[offset] === 0) offset += 1;
  return raw.subarray(offset);
}

export function readBoolean(bytes: Uint8Array, node: DerNode): boolean {
  const raw = content(bytes, node);
  return raw.length > 0 && raw[0] !== 0;
}

export function readBitString(bytes: Uint8Array, node: DerNode): Uint8Array {
  const raw = content(bytes, node);
  if (raw.length === 0) throw new Asn1Error("Empty BIT STRING.");
  const unused = raw[0]!;
  if (unused > 7 || (raw.length === 1 && unused !== 0)) throw new Asn1Error("Invalid BIT STRING padding.");
  return raw.subarray(1);
}

export function readString(bytes: Uint8Array, node: DerNode): string {
  const raw = content(bytes, node);
  if (node.tag === 0x1e) {
    let text = "";
    for (let i = 0; i + 1 < raw.length; i += 2) {
      text += String.fromCharCode((raw[i]! << 8) | raw[i + 1]!);
    }
    return text;
  }
  if (node.tag === 0x1c) {
    let text = "";
    for (let i = 0; i + 3 < raw.length; i += 4) {
      text += String.fromCodePoint(
        (raw[i]! << 24) | (raw[i + 1]! << 16) | (raw[i + 2]! << 8) | raw[i + 3]!,
      );
    }
    return text;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return Array.from(raw, (byte) => String.fromCharCode(byte)).join("");
  }
}

export function hex(value: Uint8Array, separator = ":"): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(separator);
}

function parseDigits(text: string, start: number, count: number): number | undefined {
  const slice = text.slice(start, start + count);
  if (slice.length !== count || !/^\d+$/.test(slice)) return undefined;
  return Number(slice);
}

/** Certificates use UTCTime (tag 0x17) and GeneralizedTime (tag 0x18) in Zulu time. */
export function readTime(bytes: Uint8Array, node: DerNode): Date | undefined {
  const text = Array.from(content(bytes, node), (byte) => String.fromCharCode(byte)).join("");
  const generalized = node.tag === 0x18;
  const yearOffset = generalized ? 4 : 2;
  if (text.length < yearOffset + 10) return undefined;
  let year = parseDigits(text, 0, yearOffset);
  const month = parseDigits(text, yearOffset, 2);
  const day = parseDigits(text, yearOffset + 2, 2);
  const hour = parseDigits(text, yearOffset + 4, 2);
  const minute = parseDigits(text, yearOffset + 6, 2);
  const second = parseDigits(text, yearOffset + 8, 2);
  if (year === undefined || month === undefined || day === undefined || hour === undefined
    || minute === undefined || second === undefined) return undefined;
  if (!generalized) year += year >= 50 ? 1900 : 2000;
  const millis = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(millis)) return undefined;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
