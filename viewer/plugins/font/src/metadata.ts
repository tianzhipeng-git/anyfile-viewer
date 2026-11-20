import { parseFontDirectory, type FontDirectory, type FontTable } from "./directory";

export interface FontInfo {
  readonly metadata: FontMetadata;
  readonly tables: readonly FontTable[];
}

export interface FontMetadata {
  readonly family?: string;
  readonly subfamily?: string;
  readonly fullName?: string;
  readonly version?: string;
  readonly unitsPerEm?: number;
  readonly glyphs?: number;
  readonly weight?: number;
  readonly italic?: boolean;
}

/** Decompressing a table only pays off for the handful of tables shown in the UI. */
const METADATA_TABLES = ["name", "head", "maxp", "OS/2"];
const MAX_TABLE_BYTES = 1024 * 1024;
const MAX_NAME_CHARS = 200;

const utf16 = new TextDecoder("utf-16be");
const macRoman = new TextDecoder("macintosh");

const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME_CHARS);

async function inflate(bytes: Uint8Array) {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function tableBytes(bytes: Uint8Array, directory: FontDirectory, tag: string) {
  const table = directory.tables.find(item => item.tag === tag);
  // WOFF2 tables are Brotli-compressed with per-table transforms; the table directory is all we report.
  if (!table || directory.container === "woff2" || table.origLength > MAX_TABLE_BYTES) return null;
  const stored = bytes.subarray(table.offset, table.offset + table.length);
  if (table.length === table.origLength) return stored;
  try {
    const data = await inflate(stored);
    return data.byteLength === table.origLength ? data : null;
  } catch { return null; }
}

function readNames(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(2), storage = view.getUint16(4);
  if (view.getUint16(0) > 1 || count < 1 || count > 4096 || 6 + count * 12 > bytes.byteLength) return new Map<number, string>();
  const best = new Map<number, { rank: number; value: string }>();
  for (let index = 0; index < count; index++) {
    const record = 6 + index * 12;
    const platform = view.getUint16(record), encoding = view.getUint16(record + 2), nameId = view.getUint16(record + 6);
    const length = view.getUint16(record + 8), start = storage + view.getUint16(record + 10);
    if (length === 0 || length > 512 || start + length > bytes.byteLength) continue;
    const decoder = platform === 3 && (encoding === 0 || encoding === 1) ? utf16 : platform === 0 ? utf16 : platform === 1 && encoding === 0 ? macRoman : null;
    if (!decoder) continue;
    const value = clean(decoder.decode(bytes.subarray(start, start + length)));
    if (!value) continue;
    const rank = platform === 3 && encoding === 1 ? 3 : platform === 0 ? 2 : platform === 3 ? 1 : 0;
    const current = best.get(nameId);
    if (!current || rank > current.rank) best.set(nameId, { rank, value });
  }
  return new Map([...best].map(([nameId, item]) => [nameId, item.value]));
}

function readHead(bytes: Uint8Array) {
  if (bytes.byteLength < 54) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x5f0f3cf5) return undefined;
  const unitsPerEm = view.getUint16(18);
  return {
    unitsPerEm: unitsPerEm >= 16 && unitsPerEm <= 16384 ? unitsPerEm : undefined,
    italic: (view.getUint16(44) & 2) === 2,
  };
}

function readMaxp(bytes: Uint8Array) {
  if (bytes.byteLength < 6) return undefined;
  const glyphs = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(4);
  return glyphs > 0 ? glyphs : undefined;
}

function readOs2(bytes: Uint8Array) {
  if (bytes.byteLength < 64) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const weight = view.getUint16(4);
  return { weight: weight >= 1 && weight <= 1000 ? weight : undefined, italic: (view.getUint16(62) & 1) === 1 };
}

/**
 * Read the display metadata of a font that already passed `parseFontDirectory`.
 * Missing or unreadable tables degrade to partial metadata instead of failing the open.
 */
export async function readFont(bytes: Uint8Array, fileSize: number): Promise<FontInfo> {
  const directory = parseFontDirectory(bytes, fileSize);
  if (!directory) throw new Error("Invalid font directory");
  const [name, head, maxp, os2] = await Promise.all(METADATA_TABLES.map(tag => tableBytes(bytes, directory, tag)));
  const names = name ? readNames(name) : new Map<number, string>();
  const headInfo = head ? readHead(head) : undefined;
  const os2Info = os2 ? readOs2(os2) : undefined;
  return {
    tables: directory.tables,
    metadata: {
      family: names.get(16) ?? names.get(1),
      subfamily: names.get(17) ?? names.get(2),
      fullName: names.get(4),
      version: names.get(5),
      unitsPerEm: headInfo?.unitsPerEm,
      glyphs: maxp ? readMaxp(maxp) : undefined,
      weight: os2Info?.weight,
      italic: os2Info?.italic ?? headInfo?.italic,
    },
  };
}

export { parseFontDirectory };
export type { FontDirectory, FontTable };
