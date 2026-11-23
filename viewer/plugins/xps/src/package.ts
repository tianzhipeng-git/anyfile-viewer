import { BlobReader, BlobWriter, Uint8ArrayWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js/lib/zip-core-custom.js";

import { XPS_LIMITS } from "./limits";
import { descendantsNamed } from "./xml";

export class XpsLimitError extends Error {}
export class XpsFormatError extends Error {}

const SUPPORTED_METHODS = new Set([0, 8]);
const PIECE = /^(.*)\/\[(\d+)\](\.last)?\.piece$/;

export interface Relationship {
  readonly type: string;
  /** Resolved part name (no leading slash, no fragment). */
  readonly target: string;
}

/** OPC part names compare case-insensitively and may be percent-encoded. */
export function partKey(name: string) {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // Keep malformed escapes verbatim.
  }
  return decoded.replace(/^\/+/, "").toLowerCase();
}

/** Resolves a part URI relative to `base` (a part name). Strips any fragment. */
export function resolvePart(base: string, uri: string) {
  const target = uri.trim().split("#")[0] ?? "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined; // external (http:, file:…)
  const segments = target.startsWith("/") ? [] : base.replace(/^\/+/, "").split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

/** Part URI fragment (e.g. a TrueType collection face index or link target name). */
export function uriFragment(uri: string) {
  const index = uri.indexOf("#");
  return index < 0 ? undefined : uri.slice(index + 1);
}

export function decodeXmlText(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0x3c && bytes[1] === 0x00) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0x00 && bytes[1] === 0x3c) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Read-only view over the OPC/ZIP container, reassembling interleaved `[n].piece` parts. */
export class XpsPackage {
  private readonly parts = new Map<string, FileEntry[]>();
  private readonly relCache = new Map<string, Promise<Relationship[]>>();

  private constructor(
    private readonly reader: ZipReader<unknown>,
    private readonly signal: AbortSignal,
  ) {}

  static async open(file: Blob, signal: AbortSignal) {
    const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false, useCompressionStream: true });
    const pkg = new XpsPackage(reader, signal);
    try {
      const pieces = new Map<string, { index: number; last: boolean; entry: FileEntry }[]>();
      let count = 0;
      for await (const entry of reader.getEntriesGenerator()) {
        if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
        if (++count > XPS_LIMITS.entries) throw new XpsLimitError("Too many package entries.");
        if (!isFile(entry)) continue;
        const piece = PIECE.exec(entry.filename);
        if (piece) {
          const key = partKey(piece[1]!);
          const list = pieces.get(key) ?? [];
          list.push({ index: Number(piece[2]), last: !!piece[3], entry });
          pieces.set(key, list);
        } else {
          pkg.parts.set(partKey(entry.filename), [entry]);
        }
      }
      for (const [key, list] of pieces) {
        list.sort((a, b) => a.index - b.index);
        const complete = list.every((item, index) => item.index === index) && list.at(-1)?.last;
        if (complete && !pkg.parts.has(key)) pkg.parts.set(key, list.map((item) => item.entry));
      }
      return pkg;
    } catch (error) {
      await pkg.close();
      throw error;
    }
  }

  get names(): readonly string[] {
    return [...this.parts.keys()];
  }

  has(part: string) {
    return this.parts.has(partKey(part));
  }

  size(part: string) {
    return this.parts.get(partKey(part))?.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  }

  async bytes(part: string, limit: number): Promise<Uint8Array> {
    const entries = this.entries(part, limit);
    if (entries.length === 1) return entries[0]!.getData(new Uint8ArrayWriter(), { signal: this.signal });
    const chunks: Uint8Array[] = [];
    for (const entry of entries) chunks.push(await entry.getData(new Uint8ArrayWriter(), { signal: this.signal }));
    const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  async blob(part: string, limit: number): Promise<Blob> {
    const entries = this.entries(part, limit);
    const blobs: Blob[] = [];
    for (const entry of entries) blobs.push(await entry.getData(new BlobWriter(), { signal: this.signal }));
    return new Blob(blobs);
  }

  async text(part: string, limit = XPS_LIMITS.xmlBytes) {
    return decodeXmlText(await this.bytes(part, limit));
  }

  /** Relationships of `part` from its `_rels/<name>.rels` sibling (empty when absent). */
  relationships(part: string): Promise<Relationship[]> {
    const normalized = part.replace(/^\/+/, "");
    const cached = this.relCache.get(partKey(normalized));
    if (cached) return cached;
    const slash = normalized.lastIndexOf("/");
    const relsPart = `${normalized.slice(0, slash + 1)}_rels/${normalized.slice(slash + 1)}.rels`;
    const promise = this.readRelationships(normalized, relsPart);
    this.relCache.set(partKey(normalized), promise);
    return promise;
  }

  async close() {
    await this.reader.close().catch(() => undefined);
  }

  private async readRelationships(source: string, relsPart: string) {
    if (!this.has(relsPart)) return [];
    const doc = new DOMParser().parseFromString(await this.text(relsPart), "application/xml");
    const result: Relationship[] = [];
    for (const node of descendantsNamed(doc.documentElement, "Relationship")) {
      if (node.getAttribute("TargetMode") === "External") continue;
      const target = resolvePart(source, node.getAttribute("Target") ?? "");
      if (target) result.push({ type: node.getAttribute("Type") ?? "", target });
    }
    return result;
  }

  private entries(part: string, limit: number) {
    const entries = this.parts.get(partKey(part));
    if (!entries) throw new XpsFormatError(`Missing package part ${part}.`);
    let size = 0;
    for (const entry of entries) {
      if (entry.encrypted || !SUPPORTED_METHODS.has(entry.compressionMethod)) throw new XpsFormatError("Unsupported ZIP entry.");
      size += entry.uncompressedSize;
    }
    if (size > limit) throw new XpsLimitError("Package part exceeds the limit.");
    return entries;
  }
}

function isFile(entry: Entry): entry is FileEntry {
  return !entry.directory;
}
