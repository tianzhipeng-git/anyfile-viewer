/**
 * Node Database layer of [MS-PST]: header, NBT/BBT B-tree pages, data blocks
 * (XBLOCK/XXBLOCK chains, permute decoding, 4K-page zlib blocks) and subnode
 * trees. Everything is read on demand through `Blob.slice`, so multi-GB
 * archives open without loading the whole file.
 */
import { parseHeader, u16, u32, u64, type PstFormat, type PstHeader } from "./header";
import { PST_LIMITS, PstError, invalid, throwIfAborted } from "./types";


/** A node addressed either from the NBT or from a parent's subnode tree. */
export interface PstNode {
  readonly nid: number;
  readonly bidData: number;
  readonly bidSub: number;
}

interface PageLayout {
  readonly size: number;
  readonly metaOffset: number;
  readonly wideCounts: boolean;
  readonly typeOffset: number;
}

const LAYOUTS: Record<PstFormat, PageLayout> = {
  ansi: { size: 512, metaOffset: 496, wideCounts: false, typeOffset: 500 },
  unicode: { size: 512, metaOffset: 488, wideCounts: false, typeOffset: 496 },
  unicode4k: { size: 4096, metaOffset: 4056, wideCounts: true, typeOffset: 4072 },
};

const PAGE_BBT = 0x80;
const PAGE_NBT = 0x81;

/** NDB_CRYPT_PERMUTE decode table ([MS-PST] 5.1, mpbbCrypt second 256 bytes). */
const PERMUTE_DECODE = hexBytes(
  "47f1b4e60b6a7248854e9eebe2f89453e0bba002e85a09abdbe3bac67cc310dd39059630f53760828cc9134a6b1df3fb8f2697ca911701c4322d6e3195ffd923" +
    "d1005e79dc443b1a28c5615720903d83b943be67d2464276c06d5b7eb20f16293ca903540dda5ddff6b7c762cd8d06d3695c86d614f7a56675acb1e94521700c" +
    "879f74a4224c6fbf1f56aa2eb3783350b0a392bccf191ca763cb1e4d3e4b1b9b4fe7f0eead3ab55904ea40552551e57a893868527bfc27aed7bdfa07f4cc8e5f" +
    "ef359c842b15d5773449b6120a7f7188fd9d18417d93d8582ccefe24afdeb836c8a180a69998a82f0e816573e4c2a28ad4e111d0088b2af2ed9a643fc16cf9ec",
);

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const clearLowBit = (bid: number) => bid - (bid % 2);
const isInternalBid = (bid: number) => Math.floor(bid / 2) % 2 === 1;

async function inflate(bytes: Uint8Array, expected: number): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length !== expected) invalid("Compressed block size mismatch.");
  return out;
}

interface Page {
  readonly bytes: Uint8Array;
  readonly count: number;
  readonly entrySize: number;
  readonly level: number;
}

/** Bounded insertion-ordered cache. */
class Cache<V> {
  private readonly map = new Map<number, V>();
  constructor(private readonly capacity: number) {}
  get(key: number) {
    return this.map.get(key);
  }
  set(key: number, value: V) {
    if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, value);
  }
}

export class NodeDatabase {
  private readonly layout: PageLayout;
  private readonly idSize: number;
  private readonly pages = new Cache<Page>(1024);
  private readonly blocks = new Cache<Uint8Array>(256);
  private readonly subnodeTrees = new Cache<Map<number, PstNode>>(64);

  constructor(
    private readonly file: Blob,
    readonly header: PstHeader,
    private readonly signal?: AbortSignal,
  ) {
    if (header.cryptMethod !== 0 && header.cryptMethod !== 1) {
      throw new PstError("unsupported", "High (cyclic) encryption is not supported.");
    }
    this.layout = LAYOUTS[header.format];
    this.idSize = header.format === "ansi" ? 4 : 8;
  }

  static async open(file: Blob, signal?: AbortSignal): Promise<NodeDatabase> {
    const header = parseHeader(await readRange(file, 0, 564, signal));
    if (!header) invalid("Not a PST/OST file.");
    return new NodeDatabase(file, header, signal);
  }

  private read(offset: number, length: number) {
    if (offset < 0 || offset + length > this.file.size) invalid("Reference beyond end of file.");
    return readRange(this.file, offset, length, this.signal);
  }

  private readId(bytes: Uint8Array, offset: number) {
    return this.idSize === 4 ? u32(bytes, offset) : u64(bytes, offset);
  }

  private async page(ib: number, type: number): Promise<Page> {
    const cached = this.pages.get(ib);
    if (cached) return cached;
    const { size, metaOffset, wideCounts, typeOffset } = this.layout;
    const bytes = await this.read(ib, size);
    if (bytes[typeOffset] !== type || bytes[typeOffset + 1] !== type) invalid("Unexpected B-tree page type.");
    const count = wideCounts ? u16(bytes, metaOffset) : bytes[metaOffset];
    const sizeOffset = metaOffset + (wideCounts ? 4 : 2);
    const page = { bytes, count, entrySize: bytes[sizeOffset], level: bytes[sizeOffset + 1] };
    if (page.entrySize === 0 || page.count * page.entrySize > metaOffset) invalid("Corrupt B-tree page.");
    this.pages.set(ib, page);
    return page;
  }

  /** Returns the leaf page and entry offset whose key equals `key`. */
  private async search(rootIb: number, type: number, key: number) {
    let ib = rootIb;
    for (let depth = 0; depth < PST_LIMITS.maxTreeDepth; depth++) {
      const page = await this.page(ib, type);
      if (page.level === 0) {
        for (let i = 0; i < page.count; i++) {
          const offset = i * page.entrySize;
          if (this.readId(page.bytes, offset) === key) return { bytes: page.bytes, offset };
        }
        return null;
      }
      let child = -1;
      for (let i = 0; i < page.count && this.readId(page.bytes, i * page.entrySize) <= key; i++) child = i;
      if (child < 0) return null;
      ib = this.readId(page.bytes, child * page.entrySize + this.idSize * 2);
    }
    invalid("B-tree too deep.");
  }

  async node(nid: number): Promise<PstNode | null> {
    const hit = await this.search(this.header.nbtRoot, PAGE_NBT, nid);
    if (!hit) return null;
    const { bytes, offset } = hit;
    return { nid, bidData: this.readId(bytes, offset + this.idSize), bidSub: this.readId(bytes, offset + this.idSize * 2) };
  }

  /** Reads one physical block, decoding permute encryption and 4K zlib compression. */
  private async block(bid: number): Promise<Uint8Array> {
    const key = clearLowBit(bid);
    const cached = this.blocks.get(key);
    if (cached) return cached;
    const hit = await this.search(this.header.bbtRoot, PAGE_BBT, key);
    if (!hit) invalid("Missing data block.");
    const { bytes, offset } = hit;
    const ib = this.readId(bytes, offset + this.idSize);
    const cb = u16(bytes, offset + this.idSize * 2);
    let data = await this.read(ib, cb);
    if (!isInternalBid(key) && this.header.cryptMethod === 1) data = data.map((byte) => PERMUTE_DECODE[byte]);
    if (this.header.format === "unicode4k") {
      const inflated = u16(bytes, offset + 18);
      if (inflated !== cb) data = await inflate(data, inflated);
    }
    this.blocks.set(key, data);
    return data;
  }

  /** Expands a data tree (plain block, XBLOCK or XXBLOCK) into its ordered data block ids. */
  async dataBlockIds(bid: number): Promise<number[]> {
    if (bid === 0) return [];
    if (!isInternalBid(bid)) return [bid];
    const block = await this.block(bid);
    if (block[0] !== 0x01 || (block[1] !== 1 && block[1] !== 2)) invalid("Corrupt XBLOCK.");
    const count = u16(block, 2);
    if (8 + count * this.idSize > block.length) invalid("Corrupt XBLOCK.");
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const child = this.readId(block, 8 + i * this.idSize);
      if (block[1] === 1) ids.push(child);
      else ids.push(...(await this.dataBlockIds(child)));
    }
    return ids;
  }

  /** Returns the total byte length of a data tree without reading its leaves. */
  async dataSize(bid: number): Promise<number> {
    if (bid === 0) return 0;
    if (!isInternalBid(bid)) return (await this.block(bid)).length;
    return u32(await this.block(bid), 4);
  }

  dataBlock(bid: number): Promise<Uint8Array> {
    return this.block(bid);
  }

  async readData(bid: number, limit: number = PST_LIMITS.maxNodeBytes): Promise<Uint8Array> {
    const size = await this.dataSize(bid);
    if (size > limit) throw new PstError("resource-limit", "Node data exceeds the size limit.");
    const out = new Uint8Array(size);
    let cursor = 0;
    for (const id of await this.dataBlockIds(bid)) {
      const block = await this.block(id);
      if (cursor + block.length > size) invalid("Data tree larger than declared.");
      out.set(block, cursor);
      cursor += block.length;
    }
    return cursor === size ? out : out.subarray(0, cursor);
  }

  /** Loads the subnode tree (SLBLOCK/SIBLOCK) under `node` into a nid map. */
  async subnodes(node: PstNode): Promise<Map<number, PstNode>> {
    const cached = this.subnodeTrees.get(node.bidSub);
    if (cached) return cached;
    const map = new Map<number, PstNode>();
    if (node.bidSub !== 0) await this.walkSubnodes(node.bidSub, map, 0);
    this.subnodeTrees.set(node.bidSub, map);
    return map;
  }

  private async walkSubnodes(bid: number, map: Map<number, PstNode>, depth: number) {
    if (depth > PST_LIMITS.maxTreeDepth) invalid("Subnode tree too deep.");
    const block = await this.block(bid);
    if (block[0] !== 0x02) invalid("Corrupt subnode block.");
    const level = block[1];
    const count = u16(block, 2);
    const start = this.idSize === 8 ? 8 : 4;
    const entrySize = this.idSize * (level === 0 ? 3 : 2);
    if (start + count * entrySize > block.length) invalid("Corrupt subnode block.");
    for (let i = 0; i < count; i++) {
      const offset = start + i * entrySize;
      const nid = u32(block, offset);
      if (level === 0) {
        if (map.size >= PST_LIMITS.maxSubnodes) throw new PstError("resource-limit", "Too many subnodes.");
        map.set(nid, { nid, bidData: this.readId(block, offset + this.idSize), bidSub: this.readId(block, offset + this.idSize * 2) });
      } else {
        await this.walkSubnodes(this.readId(block, offset + this.idSize), map, depth + 1);
      }
    }
  }
}

export async function readRange(file: Blob, offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal);
  const buffer = await file.slice(offset, offset + length).arrayBuffer();
  throwIfAborted(signal);
  return new Uint8Array(buffer);
}
