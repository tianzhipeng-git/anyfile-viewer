import { parseExifPayload, type ExifSummary } from "./exif";
import { ascii, readBoxes, u16be, u32be, u64be, type Box } from "./probe-format";

/** Item-level HEIF summary read from the `meta` box without decoding any image data. */
export interface HeifMetadata {
  readonly brands: readonly string[];
  readonly primaryCodec?: string;
  readonly width?: number;
  readonly height?: number;
  readonly bitDepth?: number;
  readonly rotation?: number;
  readonly mirrored: boolean;
  readonly colorProfile?: string;
  readonly hasAlpha: boolean;
  readonly hasDepth: boolean;
  readonly imageCount: number;
  readonly thumbnailCount: number;
  readonly itemCount: number;
  readonly exif?: ExifSummary;
}

interface Item { readonly id: number; readonly type: string }
interface Extent { readonly offset: number; readonly length: number }
interface Location { readonly method: number; readonly baseOffset: number; readonly extents: readonly Extent[] }

const MAX_ITEMS = 256;
const MAX_EXIF_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(["hvc1", "hev1", "av01", "grid", "iden", "iovl", "jpeg", "unci", "vvc1", "j2k1", "mski"]);

function fullBoxChildren(bytes: Uint8Array, box: Box, skip: number, budget: { count: number }) {
  return readBoxes(bytes, box.contentStart + skip, box.end, 2, budget) ?? [];
}

function readSized(bytes: Uint8Array, offset: number, size: number) {
  if (size === 0) return 0;
  if (size === 4) return u32be(bytes, offset);
  if (size === 8) return u64be(bytes, offset);
  return undefined;
}

function parseItems(bytes: Uint8Array, iinf: Box, budget: { count: number }): Item[] {
  const countBytes = bytes[iinf.contentStart] === 0 ? 2 : 4;
  const items: Item[] = [];
  for (const infe of fullBoxChildren(bytes, iinf, 4 + countBytes, budget)) {
    const version = bytes[infe.contentStart];
    if (infe.type !== "infe" || version < 2 || items.length >= MAX_ITEMS) continue;
    const id = version === 2 ? u16be(bytes, infe.contentStart + 4) : u32be(bytes, infe.contentStart + 4);
    const type = ascii(bytes, infe.contentStart + (version === 2 ? 8 : 10), 4);
    if (id !== undefined && type) items.push({ id, type });
  }
  return items;
}

function parseLocations(bytes: Uint8Array, iloc: Box) {
  const locations = new Map<number, Location>();
  const version = bytes[iloc.contentStart];
  let at = iloc.contentStart + 4;
  const offsetSize = bytes[at] >> 4;
  const lengthSize = bytes[at] & 15;
  const baseSize = bytes[at + 1] >> 4;
  const indexSize = version >= 1 ? bytes[at + 1] & 15 : 0;
  at += 2;
  const count = version < 2 ? u16be(bytes, at) : u32be(bytes, at);
  at += version < 2 ? 2 : 4;
  for (let index = 0; count !== undefined && index < Math.min(count, MAX_ITEMS); index++) {
    const id = version < 2 ? u16be(bytes, at) : u32be(bytes, at);
    at += version < 2 ? 2 : 4;
    const method = version >= 1 ? (u16be(bytes, at) ?? 0) & 15 : 0;
    at += (version >= 1 ? 2 : 0) + 2;
    const baseOffset = readSized(bytes, at, baseSize);
    at += baseSize;
    const extentCount = u16be(bytes, at);
    at += 2;
    if (id === undefined || baseOffset === undefined || extentCount === undefined || at > iloc.end) break;
    const extents: Extent[] = [];
    for (let extent = 0; extent < extentCount; extent++) {
      at += indexSize;
      const offset = readSized(bytes, at, offsetSize);
      const length = readSized(bytes, at + offsetSize, lengthSize);
      at += offsetSize + lengthSize;
      if (offset === undefined || length === undefined || at > iloc.end) return locations;
      extents.push({ offset, length });
    }
    locations.set(id, { method, baseOffset, extents });
  }
  return locations;
}

function parseReferences(bytes: Uint8Array, iref: Box, budget: { count: number }) {
  const refs: { readonly type: string; readonly from: number; readonly to: readonly number[] }[] = [];
  const wide = bytes[iref.contentStart] === 1;
  for (const child of fullBoxChildren(bytes, iref, 4, budget)) {
    let at = child.contentStart;
    const from = wide ? u32be(bytes, at) : u16be(bytes, at);
    at += wide ? 4 : 2;
    const count = u16be(bytes, at) ?? 0;
    at += 2;
    const to: number[] = [];
    for (let index = 0; index < Math.min(count, MAX_ITEMS); index++, at += wide ? 4 : 2) {
      const target = wide ? u32be(bytes, at) : u16be(bytes, at);
      if (target !== undefined) to.push(target);
    }
    if (from !== undefined) refs.push({ type: child.type, from, to });
  }
  return refs;
}

function parseProperties(bytes: Uint8Array, iprp: Box, budget: { count: number }) {
  const children = fullBoxChildren(bytes, iprp, 0, budget);
  const ipco = children.find((child) => child.type === "ipco");
  const properties = ipco ? readBoxes(bytes, ipco.contentStart, ipco.end, 3, budget) ?? [] : [];
  const associations = new Map<number, Box[]>();
  for (const ipma of children.filter((child) => child.type === "ipma")) {
    const version = bytes[ipma.contentStart];
    const wide = (bytes[ipma.contentStart + 3] & 1) !== 0;
    const count = u32be(bytes, ipma.contentStart + 4) ?? 0;
    let at = ipma.contentStart + 8;
    for (let entry = 0; entry < Math.min(count, MAX_ITEMS) && at < ipma.end; entry++) {
      const id = version < 1 ? u16be(bytes, at) : u32be(bytes, at);
      at += version < 1 ? 2 : 4;
      const n = bytes[at++] ?? 0;
      const boxes: Box[] = [];
      for (let index = 0; index < n; index++) {
        const raw = wide ? u16be(bytes, at) ?? 0 : bytes[at] ?? 0;
        at += wide ? 2 : 1;
        const property = properties[(raw & (wide ? 0x7fff : 0x7f)) - 1];
        if (property) boxes.push(property);
      }
      if (id !== undefined) associations.set(id, boxes);
    }
  }
  return associations;
}

function itemData(bytes: Uint8Array, location: Location | undefined, idat: Box | undefined) {
  if (!location) return undefined;
  const base = location.method === 1 ? idat?.contentStart : location.method === 0 ? 0 : undefined;
  if (base === undefined) return undefined;
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const extent of location.extents) {
    const start = base + location.baseOffset + extent.offset;
    const length = extent.length === 0 ? bytes.length - start : extent.length;
    total += length;
    if (start < 0 || length < 0 || start + length > bytes.length || total > MAX_EXIF_BYTES) return undefined;
    parts.push(bytes.subarray(start, start + length));
  }
  if (parts.length === 1) return parts[0];
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { joined.set(part, at); at += part.length; }
  return joined;
}

/** Returns `undefined` when the bytes are not a parseable HEIF container. */
export function readHeifMetadata(bytes: Uint8Array): HeifMetadata | undefined {
  const budget = { count: 0 };
  const top = readBoxes(bytes, 0, bytes.length, 0, budget);
  const ftyp = top?.find((box) => box.type === "ftyp");
  const meta = top?.find((box) => box.type === "meta");
  if (!top || !ftyp || !meta) return undefined;
  const brands: string[] = [];
  for (let at = ftyp.contentStart; at + 4 <= ftyp.end; at += 4) {
    const brand = ascii(bytes, at, 4);
    if (brand && at !== ftyp.contentStart + 4 && !brands.includes(brand)) brands.push(brand);
  }
  const children = fullBoxChildren(bytes, meta, 4, budget);
  const find = (type: string) => children.find((child) => child.type === type);
  const pitm = find("pitm");
  const primary = pitm ? (bytes[pitm.contentStart] === 0 ? u16be(bytes, pitm.contentStart + 4) : u32be(bytes, pitm.contentStart + 4)) : undefined;
  const iinf = find("iinf");
  const items = iinf ? parseItems(bytes, iinf, budget) : [];
  const iloc = find("iloc");
  const locations = iloc ? parseLocations(bytes, iloc) : new Map<number, Location>();
  const iref = find("iref");
  const refs = iref ? parseReferences(bytes, iref, budget) : [];
  const iprp = find("iprp");
  const props = iprp ? parseProperties(bytes, iprp, budget) : new Map<number, Box[]>();

  const tiles = new Set(refs.filter((ref) => ref.type === "dimg").flatMap((ref) => ref.to));
  const aux = refs.filter((ref) => ref.type === "auxl").map((ref) => ref.from);
  const thumbnails = new Set(refs.filter((ref) => ref.type === "thmb").map((ref) => ref.from));
  const auxKinds = aux.map((id) => {
    const auxC = props.get(id)?.find((box) => box.type === "auxC");
    return auxC ? new TextDecoder().decode(bytes.subarray(auxC.contentStart + 4, auxC.end)) : "";
  });
  const images = items.filter((item) => IMAGE_TYPES.has(item.type));
  const topLevel = images.filter((item) => !tiles.has(item.id) && !aux.includes(item.id) && !thumbnails.has(item.id));

  const primaryItem = items.find((item) => item.id === primary);
  const primaryProps = primary === undefined ? [] : props.get(primary) ?? [];
  const firstTile = refs.find((ref) => ref.type === "dimg" && ref.from === primary)?.to[0];
  const prop = (type: string) => primaryProps.find((box) => box.type === type)
    ?? (firstTile === undefined ? undefined : props.get(firstTile)?.find((box) => box.type === type));
  const ispe = primaryProps.find((box) => box.type === "ispe");
  const pixi = prop("pixi");
  const irot = primaryProps.find((box) => box.type === "irot");
  const colr = prop("colr");

  const exifItem = items.find((item) => item.type === "Exif"
    && refs.some((ref) => ref.type === "cdsc" && ref.from === item.id && (primary === undefined || ref.to.includes(primary))))
    ?? items.find((item) => item.type === "Exif");
  const exifBytes = exifItem ? itemData(bytes, locations.get(exifItem.id), find("idat")) : undefined;

  return {
    brands,
    ...(primaryItem ? { primaryCodec: primaryItem.type } : {}),
    ...(ispe ? { width: u32be(bytes, ispe.contentStart + 4), height: u32be(bytes, ispe.contentStart + 8) } : {}),
    ...(pixi && bytes[pixi.contentStart + 4] > 0 ? { bitDepth: bytes[pixi.contentStart + 5] } : {}),
    ...(irot ? { rotation: (bytes[irot.contentStart] & 3) * 90 } : {}),
    mirrored: primaryProps.some((box) => box.type === "imir"),
    ...(colr ? { colorProfile: ascii(bytes, colr.contentStart, 4) } : {}),
    hasAlpha: auxKinds.some((kind) => /alpha|hevc:2015:auxid:1\b/.test(kind)),
    hasDepth: auxKinds.some((kind) => /depth|hevc:2015:auxid:2\b/.test(kind)),
    imageCount: topLevel.length,
    thumbnailCount: thumbnails.size,
    itemCount: items.length,
    ...(exifBytes ? { exif: parseExifPayload(exifBytes) } : {}),
  };
}
