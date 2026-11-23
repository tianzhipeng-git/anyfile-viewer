/**
 * Lists, Tables and Properties layer of [MS-PST]: heap-on-node (HN), BTree-on-heap
 * (BTH), property contexts (PC) and table contexts (TC). Table rows are read
 * block by block so huge folders can be paged without decoding every row.
 */
import { u16, u32 } from "./header";
import { NodeDatabase, type PstNode } from "./ndb";
import { PST_LIMITS, PstError, invalid } from "./types";

export type PropValue = string | number | boolean | Date | Uint8Array | null;

export const PT = {
  int16: 0x0002,
  int32: 0x0003,
  float: 0x0004,
  double: 0x0005,
  currency: 0x0006,
  appTime: 0x0007,
  error: 0x000a,
  boolean: 0x000b,
  object: 0x000d,
  int64: 0x0014,
  string8: 0x001e,
  string: 0x001f,
  time: 0x0040,
  guid: 0x0048,
  binary: 0x0102,
} as const;

const utf16 = new TextDecoder("utf-16le");
let ansiDecoder: TextDecoder | undefined;

export function decodeString8(bytes: Uint8Array): string {
  ansiDecoder ??= new TextDecoder("windows-1252");
  return ansiDecoder.decode(bytes).replace(/\0+$/, "");
}

const FILETIME_EPOCH_MS = 11_644_473_600_000;

function fileTime(bytes: Uint8Array, offset: number): Date | null {
  const ticks = u32(bytes, offset) + u32(bytes, offset + 4) * 0x1_0000_0000;
  if (ticks === 0) return null;
  const date = new Date(ticks / 10_000 - FILETIME_EPOCH_MS);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Size of a fixed-width property type, or 0 for variable-size types. */
function fixedSize(type: number): number {
  switch (type) {
    case PT.int16: return 2;
    case PT.int32: case PT.float: case PT.error: return 4;
    case PT.boolean: return 1;
    case PT.double: case PT.currency: case PT.appTime: case PT.int64: case PT.time: return 8;
    default: return 0;
  }
}

function decodeFixed(type: number, bytes: Uint8Array, offset: number): PropValue {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
  switch (type) {
    case PT.int16: return view.getInt16(0, true);
    case PT.int32: case PT.error: return view.getInt32(0, true);
    case PT.float: return view.getFloat32(0, true);
    case PT.boolean: return bytes[offset] !== 0;
    case PT.double: case PT.appTime: return view.getFloat64(0, true);
    case PT.int64: case PT.currency: return Number(view.getBigInt64(0, true));
    case PT.time: return fileTime(bytes, offset);
    default: return null;
  }
}

function decodeVariable(type: number, bytes: Uint8Array): PropValue {
  if (type === PT.string) return utf16.decode(bytes).replace(/\0+$/, "");
  if (type === PT.string8) return decodeString8(bytes);
  if (type === PT.binary || type === PT.guid) return bytes;
  if (fixedSize(type) > 0 && bytes.length >= fixedSize(type)) return decodeFixed(type, bytes, 0);
  return null;
}

/** Heap-on-node over the data blocks of a node; heap pages load lazily. */
export class Heap {
  private constructor(
    private readonly ndb: NodeDatabase,
    readonly node: PstNode,
    private readonly blockIds: readonly number[],
    readonly clientSig: number,
    readonly userRoot: number,
  ) {}

  static async open(ndb: NodeDatabase, node: PstNode): Promise<Heap> {
    const ids = await ndb.dataBlockIds(node.bidData);
    if (ids.length === 0) invalid("Empty heap.");
    const first = await ndb.dataBlock(ids[0]);
    if (first.length < 12 || first[2] !== 0xec) invalid("Bad heap signature.");
    return new Heap(ndb, node, ids, first[3], u32(first, 4));
  }

  async get(hid: number): Promise<Uint8Array> {
    if (hid === 0) return new Uint8Array(0);
    if ((hid & 0x1f) !== 0) invalid("Not a heap id.");
    const index = (hid >>> 5) & 0x7ff;
    const blockIndex = hid >>> 16;
    if (blockIndex >= this.blockIds.length) invalid("Heap id out of range.");
    const block = await this.ndb.dataBlock(this.blockIds[blockIndex]);
    const map = u16(block, 0);
    if (map + 4 > block.length || index === 0 || index > u16(block, map)) invalid("Heap id out of range.");
    const start = u16(block, map + 4 + (index - 1) * 2);
    const end = u16(block, map + 4 + index * 2);
    if (start > end || end > block.length) invalid("Corrupt heap allocation.");
    return block.subarray(start, end);
  }

  /** Resolves an HNID: a heap id, or a subnode whose data holds the value. */
  async hnid(hnid: number, limit?: number): Promise<Uint8Array> {
    if ((hnid & 0x1f) === 0) return this.get(hnid);
    const sub = (await this.ndb.subnodes(this.node)).get(hnid);
    if (!sub) invalid("Missing subnode.");
    return this.ndb.readData(sub.bidData, limit);
  }
}

/** Reads every record of a BTH rooted at `hidHeader`. */
async function bthRecords(heap: Heap, hidHeader: number) {
  const header = await heap.get(hidHeader);
  if (header.length < 8 || header[0] !== 0xb5) invalid("Bad BTH header.");
  const keySize = header[1];
  const dataSize = header[2];
  const records: { key: Uint8Array; data: Uint8Array }[] = [];
  const walk = async (hid: number, level: number) => {
    if (hid === 0) return;
    const bytes = await heap.get(hid);
    const size = keySize + (level > 0 ? 4 : dataSize);
    for (let offset = 0; offset + size <= bytes.length; offset += size) {
      if (level > 0) await walk(u32(bytes, offset + keySize), level - 1);
      else records.push({ key: bytes.subarray(offset, offset + keySize), data: bytes.subarray(offset + keySize, offset + size) });
    }
  };
  if (header[3] > PST_LIMITS.maxTreeDepth) invalid("BTH too deep.");
  await walk(u32(header, 4), header[3]);
  return records;
}

/** Property context: a node's property bag (folders, messages, attachments, store). */
export class PropertyContext {
  private constructor(
    readonly heap: Heap,
    private readonly props: Map<number, { type: number; value: Uint8Array }>,
  ) {}

  static async open(ndb: NodeDatabase, node: PstNode): Promise<PropertyContext> {
    const heap = await Heap.open(ndb, node);
    if (heap.clientSig !== 0xbc) invalid("Not a property context.");
    const props = new Map<number, { type: number; value: Uint8Array }>();
    for (const { key, data } of await bthRecords(heap, heap.userRoot)) {
      if (key.length === 2 && data.length === 6) props.set(u16(key, 0), { type: u16(data, 0), value: data.subarray(2) });
    }
    return new PropertyContext(heap, props);
  }

  has(id: number) {
    return this.props.has(id);
  }

  type(id: number) {
    return this.props.get(id)?.type;
  }

  async get(id: number, limit?: number): Promise<PropValue> {
    const prop = this.props.get(id);
    if (!prop) return null;
    const size = fixedSize(prop.type);
    if (size > 0 && size <= 4) return decodeFixed(prop.type, prop.value, 0);
    if (prop.type === PT.object) return u32(prop.value, 0);
    if ((prop.type & 0x1000) !== 0) return null;
    return decodeVariable(prop.type, await this.heap.hnid(u32(prop.value, 0), limit));
  }

  async string(id: number): Promise<string> {
    const value = await this.get(id);
    return typeof value === "string" ? value : "";
  }

  /** Byte length of a variable property without reading it (subnode-backed values). */
  async byteLength(id: number): Promise<number | null> {
    const prop = this.props.get(id);
    if (!prop || fixedSize(prop.type) > 0) return null;
    const hnid = u32(prop.value, 0);
    if ((hnid & 0x1f) === 0) return (await this.heap.get(hnid)).length;
    return null;
  }
}

interface Column {
  readonly type: number;
  readonly offset: number;
  readonly size: number;
  readonly bit: number;
}

export type TableRow = ReadonlyMap<number, PropValue>;

/** Table context: hierarchy, contents, recipient and attachment tables. */
export class TableContext {
  private constructor(
    private readonly ndb: NodeDatabase,
    private readonly heap: Heap,
    private readonly columns: Map<number, Column>,
    private readonly rowSize: number,
    private readonly cebOffset: number,
    private readonly source: { heapRows: Uint8Array } | { blockIds: number[]; rowsPerBlock: number },
    readonly rowCount: number,
    private readonly structuralHids: ReadonlySet<number> = new Set(),
  ) {}

  static async open(ndb: NodeDatabase, node: PstNode): Promise<TableContext> {
    const heap = await Heap.open(ndb, node);
    if (heap.clientSig !== 0x7c) invalid("Not a table context.");
    const info = await heap.get(heap.userRoot);
    if (info.length < 22 || info[0] !== 0x7c) invalid("Bad table header.");
    const columnCount = info[1];
    if (22 + columnCount * 8 > info.length) invalid("Bad table header.");
    const cebOffset = u16(info, 6);
    const rowSize = u16(info, 8);
    const columns = new Map<number, Column>();
    for (let i = 0; i < columnCount; i++) {
      const at = 22 + i * 8;
      const column = { type: u16(info, at), offset: u16(info, at + 4), size: info[at + 6], bit: info[at + 7] };
      if (column.offset + column.size > rowSize) invalid("Column outside row.");
      columns.set(u16(info, at + 2), column);
    }
    if (rowSize === 0) invalid("Empty table row.");
    const rowsHnid = u32(info, 14);
    const structural = new Set([heap.userRoot, u32(info, 10), rowsHnid]);
    const make = (source: TableContext["source"], rowCount: number) =>
      new TableContext(ndb, heap, columns, rowSize, cebOffset, source, rowCount, structural);
    if (rowsHnid === 0) return make({ heapRows: new Uint8Array(0) }, 0);
    if ((rowsHnid & 0x1f) === 0) {
      const heapRows = await heap.get(rowsHnid);
      return make({ heapRows }, Math.floor(heapRows.length / rowSize));
    }
    const sub = (await ndb.subnodes(node)).get(rowsHnid);
    if (!sub) invalid("Missing table row subnode.");
    const blockIds = await ndb.dataBlockIds(sub.bidData);
    if (blockIds.length === 0) return make({ heapRows: new Uint8Array(0) }, 0);
    const rowsPerBlock = Math.floor((await ndb.dataBlock(blockIds[0])).length / rowSize);
    if (rowsPerBlock === 0) invalid("Row larger than block.");
    const last = await ndb.dataBlock(blockIds[blockIds.length - 1]);
    return make({ blockIds, rowsPerBlock }, (blockIds.length - 1) * rowsPerBlock + Math.floor(last.length / rowSize));
  }

  hasColumn(id: number) {
    return this.columns.has(id);
  }

  private async rowBytes(index: number): Promise<Uint8Array> {
    if ("heapRows" in this.source) return this.source.heapRows.subarray(index * this.rowSize, (index + 1) * this.rowSize);
    const { blockIds, rowsPerBlock } = this.source;
    const block = await this.ndb.dataBlock(blockIds[Math.floor(index / rowsPerBlock)]);
    const at = (index % rowsPerBlock) * this.rowSize;
    if (at + this.rowSize > block.length) invalid("Row outside block.");
    return block.subarray(at, at + this.rowSize);
  }

  /** Reads `count` rows from `start`, decoding only the requested property ids. */
  async rows(start: number, count: number, ids: readonly number[]): Promise<TableRow[]> {
    const end = Math.min(this.rowCount, start + count);
    const out: TableRow[] = [];
    for (let index = start; index < end; index++) {
      const bytes = await this.rowBytes(index);
      const row = new Map<number, PropValue>();
      row.set(0x67f2, u32(bytes, 0));
      const unusable = this.unusableHnids(bytes);
      for (const id of ids) {
        const column = this.columns.get(id);
        if (column && this.present(column, bytes)) row.set(id, await this.cell(column, bytes, unusable));
      }
      out.push(row);
    }
    return out;
  }

  private present(column: Column, bytes: Uint8Array) {
    return (bytes[this.cebOffset + (column.bit >> 3)] & (0x80 >> (column.bit & 7))) !== 0;
  }

  /**
   * OST contents tables leave uncached string cells pointing at table structures
   * or at another column's value; such references are never decoded.
   */
  private unusableHnids(bytes: Uint8Array): Set<number> {
    const unusable = new Set(this.structuralHids);
    const seen = new Set<number>();
    for (const column of this.columns.values()) {
      if (fixedSize(column.type) > 0 || column.size !== 4 || !this.present(column, bytes)) continue;
      const hnid = u32(bytes, column.offset);
      if (hnid === 0) continue;
      if (seen.has(hnid)) unusable.add(hnid);
      seen.add(hnid);
    }
    return unusable;
  }

  private async cell(column: Column, bytes: Uint8Array, unusable: ReadonlySet<number>): Promise<PropValue> {
    const size = fixedSize(column.type);
    if (size > 0 && size <= column.size) return decodeFixed(column.type, bytes, column.offset);
    if ((column.type & 0x1000) !== 0 || column.size !== 4) return null;
    const hnid = u32(bytes, column.offset);
    if (unusable.has(hnid)) return null;
    try {
      return decodeVariable(column.type, await this.heap.hnid(hnid));
    } catch (error) {
      if (error instanceof PstError && error.code === "invalid-file") return null;
      throw error;
    }
  }
}
