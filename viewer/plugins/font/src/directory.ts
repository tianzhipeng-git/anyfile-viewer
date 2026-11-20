/**
 * Container-level font parsing shared by the bounded probe and the full metadata reader.
 * Table data is never copied here: callers slice what they need from the original bytes.
 */
export type FontContainer = "sfnt" | "woff" | "woff2";

export interface FontTable {
  readonly tag: string;
  /** Byte offset of the stored table in the file. */
  readonly offset: number;
  /** Bytes occupied in the file (compressed for WOFF). */
  readonly length: number;
  /** Uncompressed size of the table. */
  readonly origLength: number;
}

export interface FontDirectory {
  readonly container: FontContainer;
  readonly tables: readonly FontTable[];
}

export const MAX_TABLES = 512;

const SFNT_VERSIONS = new Set([0x00010000, 0x4f54544f, 0x74727565, 0x74797031]);
const WOFF_SIGNATURE = 0x774f4646;
const WOFF2_SIGNATURE = 0x774f4632;
const REQUIRED_TABLES = ["head", "maxp", "cmap"];

/** WOFF2 known table tags; index 63 means the tag follows literally. */
const WOFF2_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep",
  "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE",
  "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt",
  "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar",
  "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
] as const;

function tagAt(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.byteLength) return "";
  let tag = "";
  for (let index = 0; index < 4; index++) {
    const code = bytes[offset + index];
    if (code < 0x20 || code > 0x7e) return "";
    tag += String.fromCharCode(code);
  }
  return tag;
}

function hasRequired(tables: readonly FontTable[]) {
  return REQUIRED_TABLES.every(tag => tables.some(table => table.tag === tag));
}

/**
 * Validate a font header and its table directory. `bytes` may be a bounded prefix of the
 * file, while `fileSize` always describes the whole file so probes never trust the prefix.
 */
export function parseFontDirectory(bytes: Uint8Array, fileSize: number): FontDirectory | null {
  const end = Math.min(bytes.byteLength, fileSize);
  if (end < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0);
  if (SFNT_VERSIONS.has(signature)) return parseSfnt(bytes, view, end, fileSize);
  if (signature === WOFF_SIGNATURE) return parseWoff(bytes, view, end, fileSize);
  if (signature === WOFF2_SIGNATURE) return parseWoff2(bytes, view, end, fileSize);
  return null;
}

function parseSfnt(bytes: Uint8Array, view: DataView, end: number, fileSize: number): FontDirectory | null {
  if (end < 12) return null;
  const count = view.getUint16(4);
  if (count < 1 || count > MAX_TABLES || 12 + count * 16 > end) return null;
  const tables: FontTable[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const tag = tagAt(bytes, record);
    const offset = view.getUint32(record + 8), length = view.getUint32(record + 12);
    if (!tag || seen.has(tag)) return null;
    if (length > 0 && (offset < 12 || offset + length > fileSize)) return null;
    seen.add(tag);
    tables.push({ tag, offset, length, origLength: length });
  }
  return hasRequired(tables) ? { container: "sfnt", tables } : null;
}

function sectionInBounds(offset: number, size: number, start: number, fileSize: number) {
  return size === 0 || (offset >= start && offset + size <= fileSize);
}

function parseWoff(bytes: Uint8Array, view: DataView, end: number, fileSize: number): FontDirectory | null {
  if (end < 44) return null;
  const count = view.getUint16(12);
  if (view.getUint32(8) !== fileSize || count < 1 || count > MAX_TABLES || view.getUint16(14) !== 0) return null;
  const directoryEnd = 44 + count * 20;
  if (directoryEnd > end) return null;
  if (!sectionInBounds(view.getUint32(24), view.getUint32(28), directoryEnd, fileSize)) return null;
  if (!sectionInBounds(view.getUint32(36), view.getUint32(40), directoryEnd, fileSize)) return null;
  const tables: FontTable[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index++) {
    const record = 44 + index * 20;
    const tag = tagAt(bytes, record);
    const offset = view.getUint32(record + 4), length = view.getUint32(record + 8), origLength = view.getUint32(record + 12);
    if (!tag || seen.has(tag) || length > origLength) return null;
    if (length > 0 && (offset < directoryEnd || offset + length > fileSize)) return null;
    seen.add(tag);
    tables.push({ tag, offset, length, origLength });
  }
  return hasRequired(tables) ? { container: "woff", tables } : null;
}

function parseWoff2(bytes: Uint8Array, view: DataView, end: number, fileSize: number): FontDirectory | null {
  if (end < 48) return null;
  const count = view.getUint16(12);
  if (view.getUint32(8) !== fileSize || count < 1 || count > MAX_TABLES || view.getUint16(14) !== 0) return null;
  if (!sectionInBounds(view.getUint32(28), view.getUint32(32), 48, fileSize)) return null;
  if (!sectionInBounds(view.getUint32(40), view.getUint32(44), 48, fileSize)) return null;
  let offset = 48;
  const byte = () => {
    if (offset >= end) throw new RangeError("Truncated WOFF2 directory");
    return bytes[offset++];
  };
  const base128 = () => {
    let value = 0;
    for (let index = 0; index < 5; index++) {
      const current = byte();
      value = value * 128 + (current & 0x7f);
      if ((current & 0x80) === 0) return value;
    }
    throw new RangeError("Invalid WOFF2 base-128 value");
  };
  try {
    const tables: FontTable[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < count; index++) {
      const flags = byte(), tagIndex = flags & 0x3f;
      let tag = tagIndex === 63 ? "" : WOFF2_TAGS[tagIndex];
      if (tagIndex === 63) {
        if (offset + 4 > end) return null;
        tag = tagAt(bytes, offset);
        offset += 4;
      }
      const transform = flags >> 6;
      if (!tag || seen.has(tag)) return null;
      const origLength = base128();
      // Transformed glyf/loca carry an extra length; it can be 0 for an empty loca.
      if (tag === "glyf" || tag === "loca") {
        if (transform !== 3) base128();
      } else if (transform !== 0) return null;
      seen.add(tag);
      tables.push({ tag, offset: 48, length: origLength, origLength });
    }
    return hasRequired(tables) ? { container: "woff2", tables } : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
