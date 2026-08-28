export type ModernFormat = "JXL" | "HEIC";

const JXL_CONTAINER_SIGNATURE = [0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10];
const MAX_BOXES = 2048;
const MAX_DEPTH = 8;
const MAX_ITEMS = 256;
const MAX_DERIVED_DEPTH = 8;

interface Box {
  readonly type: string;
  readonly contentStart: number;
  readonly end: number;
  readonly partial?: boolean;
}

interface HeifItems {
  primary?: number;
  readonly types: Map<number, string>;
  readonly derived: Map<number, number[]>;
  readonly propertyTypes: string[];
  readonly associations: Map<number, number[]>;
}

function parseIprp(bytes: Uint8Array, box: Box, items: HeifItems, budget: { count: number }) {
  const children = readBoxes(bytes, box.contentStart, box.end, 2, budget);
  if (!children) return false;
  const ipco = children.find((child) => child.type === "ipco");
  if (!ipco) return false;
  const properties = readBoxes(bytes, ipco.contentStart, ipco.end, 3, budget);
  if (!properties) return false;
  items.propertyTypes.push(...properties.map((property) => property.type));
  for (const ipma of children.filter((child) => child.type === "ipma")) {
    if (ipma.end - ipma.contentStart < 8) return false;
    const version = bytes[ipma.contentStart];
    const flags = ((bytes[ipma.contentStart + 1] << 16) | (bytes[ipma.contentStart + 2] << 8) | bytes[ipma.contentStart + 3]) >>> 0;
    const wideAssociations = (flags & 1) !== 0;
    const count = u32be(bytes, ipma.contentStart + 4);
    if (count === undefined || count > MAX_ITEMS) return false;
    let offset = ipma.contentStart + 8;
    for (let entry = 0; entry < count; entry++) {
      const itemId = version < 1 ? u16be(bytes, offset) : u32be(bytes, offset);
      offset += version < 1 ? 2 : 4;
      if (itemId === undefined || offset >= ipma.end) return false;
      const associationCount = bytes[offset++];
      if (associationCount > MAX_ITEMS) return false;
      const indexes: number[] = [];
      for (let index = 0; index < associationCount; index++) {
        const association = wideAssociations ? u16be(bytes, offset) : bytes[offset];
        if (association === undefined) return false;
        offset += wideAssociations ? 2 : 1;
        const propertyIndex = association & (wideAssociations ? 0x7fff : 0x7f);
        if (propertyIndex > items.propertyTypes.length) return false;
        if (propertyIndex !== 0) indexes.push(propertyIndex);
      }
      items.associations.set(itemId, indexes);
    }
    if (offset !== ipma.end) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || length < 0 || offset + length > bytes.length) return undefined;
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16be(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) return undefined;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function u64be(bytes: Uint8Array, offset: number) {
  const high = u32be(bytes, offset);
  const low = u32be(bytes, offset + 4);
  if (high === undefined || low === undefined) return undefined;
  const value = high * 0x1_0000_0000 + low;
  return Number.isSafeInteger(value) ? value : undefined;
}

function readBoxes(bytes: Uint8Array, start: number, end: number, depth: number, budget: { count: number }, fileSize = bytes.length) {
  if (depth > MAX_DEPTH || start < 0 || end > bytes.length || start > end) return undefined;
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (++budget.count > MAX_BOXES || end - offset < 8) return undefined;
    const size32 = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (size32 === undefined || type === undefined) return undefined;
    const headerSize = size32 === 1 ? 16 : 8;
    const size = size32 === 0 ? (depth === 0 ? fileSize : end) - offset : size32 === 1 ? u64be(bytes, offset + 8) : size32;
    if (size === undefined || size < headerSize || !Number.isSafeInteger(offset + size) || offset + size > fileSize) return undefined;
    if (offset + size > end) {
      if (depth === 0 && (size32 === 0 || type === "mdat")) {
        boxes.push({ type, contentStart: offset + headerSize, end, partial: true });
        offset = end;
        break;
      }
      return undefined;
    }
    boxes.push({ type, contentStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  return offset === end ? boxes : undefined;
}

function parseInfe(bytes: Uint8Array, box: Box, items: HeifItems) {
  if (box.end - box.contentStart < 4) return false;
  const version = bytes[box.contentStart];
  const minimumContentSize = version === 2 ? 12 : version === 3 ? 14 : 4;
  if (box.end - box.contentStart < minimumContentSize) return false;
  let id: number | undefined;
  let typeOffset: number;
  if (version === 2) {
    id = u16be(bytes, box.contentStart + 4);
    typeOffset = box.contentStart + 8;
  } else if (version === 3) {
    id = u32be(bytes, box.contentStart + 4);
    typeOffset = box.contentStart + 10;
  } else {
    return true;
  }
  const type = ascii(bytes, typeOffset, 4);
  if (id === undefined || !type || items.types.size >= MAX_ITEMS) return false;
  items.types.set(id, type);
  return true;
}

function parseIinf(bytes: Uint8Array, box: Box, items: HeifItems, budget: { count: number }) {
  if (box.end - box.contentStart < 4) return false;
  const version = bytes[box.contentStart];
  const countBytes = version === 0 ? 2 : 4;
  if (box.end - box.contentStart < 4 + countBytes) return false;
  const count = countBytes === 2 ? u16be(bytes, box.contentStart + 4) : u32be(bytes, box.contentStart + 4);
  if (count === undefined || count > MAX_ITEMS) return false;
  const children = readBoxes(bytes, box.contentStart + 4 + countBytes, box.end, 2, budget);
  if (!children || children.length !== count) return false;
  return children.every((child) => child.type !== "infe" || parseInfe(bytes, child, items));
}

function parseIref(bytes: Uint8Array, box: Box, items: HeifItems, budget: { count: number }) {
  if (box.end - box.contentStart < 4) return false;
  const version = bytes[box.contentStart];
  if (version !== 0 && version !== 1) return false;
  const children = readBoxes(bytes, box.contentStart + 4, box.end, 2, budget);
  if (!children) return false;
  for (const child of children) {
    if (child.type !== "dimg") continue;
    let offset = child.contentStart;
    const from = version === 0 ? u16be(bytes, offset) : u32be(bytes, offset);
    offset += version === 0 ? 2 : 4;
    const count = u16be(bytes, offset);
    offset += 2;
    if (from === undefined || count === undefined || count > MAX_ITEMS) return false;
    const targets: number[] = [];
    for (let index = 0; index < count; index++) {
      const target = version === 0 ? u16be(bytes, offset) : u32be(bytes, offset);
      if (target === undefined) return false;
      targets.push(target);
      offset += version === 0 ? 2 : 4;
    }
    if (offset !== child.end) return false;
    items.derived.set(from, targets);
  }
  return true;
}

function inspectHeif(bytes: Uint8Array, fileSize: number) {
  const budget = { count: 0 };
  const top = readBoxes(bytes, 0, bytes.length, 0, budget, fileSize);
  if (!top) return undefined;
  const ftyp = top.find((box) => box.type === "ftyp");
  if (!ftyp || ftyp.partial || ftyp.end - ftyp.contentStart < 8 || (ftyp.end - ftyp.contentStart) % 4 !== 0) return undefined;
  const brands: string[] = [];
  for (let offset = ftyp.contentStart; offset + 4 <= ftyp.end; offset += 4) {
    if (offset === ftyp.contentStart + 4) continue;
    const brand = ascii(bytes, offset, 4);
    if (!brand) return undefined;
    brands.push(brand);
  }
  if (brands.includes("avif") || brands.includes("avis")) return undefined;
  const meta = top.find((box) => box.type === "meta");
  if (!meta) {
    const hasHevcBrand = brands.some((brand) => brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx");
    return hasHevcBrand && top.some((box) => box.type === "mdat" && box.partial) ? "HEIC" : undefined;
  }
  if (meta.end - meta.contentStart < 4) return undefined;
  const children = readBoxes(bytes, meta.contentStart + 4, meta.end, 1, budget);
  if (!children) return undefined;
  const items: HeifItems = { types: new Map(), derived: new Map(), propertyTypes: [], associations: new Map() };
  for (const child of children) {
    if (child.type === "pitm") {
      if (child.end - child.contentStart < 4) return undefined;
      const version = bytes[child.contentStart];
      const minimumContentSize = version === 0 ? 6 : version === 1 ? 8 : Number.POSITIVE_INFINITY;
      if (child.end - child.contentStart < minimumContentSize) return undefined;
      items.primary = version === 0 ? u16be(bytes, child.contentStart + 4) : version === 1 ? u32be(bytes, child.contentStart + 4) : undefined;
      if (items.primary === undefined) return undefined;
    } else if (child.type === "iinf" && !parseIinf(bytes, child, items, budget)) {
      return undefined;
    } else if (child.type === "iref" && !parseIref(bytes, child, items, budget)) {
      return undefined;
    } else if (child.type === "iprp" && !parseIprp(bytes, child, items, budget)) {
      return undefined;
    }
  }
  if (items.primary === undefined) return undefined;
  const visiting = new Set<number>();
  let codecVisits = 0;
  const codecOf = (id: number, depth: number): "hevc" | "av1" | undefined => {
    if (++codecVisits > MAX_BOXES || depth > MAX_DERIVED_DEPTH || visiting.has(id)) return undefined;
    const type = items.types.get(id);
    const properties = items.associations.get(id)?.map((index) => items.propertyTypes[index - 1]) ?? [];
    if (type === "hvc1" || type === "hev1") return properties.includes("hvcC") ? "hevc" : undefined;
    if (type === "av01") return properties.includes("av1C") ? "av1" : undefined;
    if (type !== "grid" && type !== "iden" && type !== "iovl") return undefined;
    const targets = items.derived.get(id);
    if (!targets?.length) return undefined;
    visiting.add(id);
    const codecs = targets.map((target) => codecOf(target, depth + 1));
    visiting.delete(id);
    return codecs.every((codec) => codec === "hevc") ? "hevc" : codecs.every((codec) => codec === "av1") ? "av1" : undefined;
  };
  return codecOf(items.primary, 0) === "hevc" ? "HEIC" : undefined;
}

export function inspectModernHeader(bytes: Uint8Array, fileSize = bytes.length): ModernFormat | undefined {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0x0a) return "JXL";
  if (bytes.length >= JXL_CONTAINER_SIGNATURE.length && JXL_CONTAINER_SIGNATURE.every((value, index) => bytes[index] === value)) return "JXL";
  return inspectHeif(bytes, fileSize);
}
