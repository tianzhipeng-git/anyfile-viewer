import { BlobReader, Uint8ArrayWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js/lib/zip-core-custom.js";

import { OFD_LIMITS } from "./limits";

export class OfdLimitError extends Error {}
export class OfdFormatError extends Error {}

const SUPPORTED_METHODS = new Set([0, 8]);

/** Package paths compare case-insensitively (producers disagree on `Tpls` vs `TPLS`). */
function key(path: string) {
  return path.replace(/^\/+/, "").toLowerCase();
}

/** Directory of a package path, with trailing slash (empty for the root). */
export function dirOf(path: string) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
}

/** Joins an `ST_Loc` onto a base directory: absolute when it starts with `/`, else relative. */
export function joinLoc(baseDir: string, loc: string) {
  const target = loc.trim().replace(/\\/g, "/");
  const segments = target.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  for (const segment of target.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

/** Read-only view over the OFD ZIP container. */
export class OfdPackage {
  private readonly entries = new Map<string, FileEntry>();

  private constructor(
    private readonly reader: ZipReader<unknown>,
    private readonly signal: AbortSignal,
  ) {}

  static async open(file: Blob, signal: AbortSignal) {
    const reader = new ZipReader(new BlobReader(file), {
      useWebWorkers: false,
      useCompressionStream: true,
      // Invoice generators write slightly irregular archives; tolerate them like desktop readers do.
      strictness: "tolerant",
    });
    const pkg = new OfdPackage(reader, signal);
    try {
      let count = 0;
      for await (const entry of reader.getEntriesGenerator()) {
        if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
        if (++count > OFD_LIMITS.entries) throw new OfdLimitError("Too many package entries.");
        if (isFile(entry)) pkg.entries.set(key(entry.filename), entry);
      }
      return pkg;
    } catch (error) {
      await pkg.close();
      throw error;
    }
  }

  has(path: string) {
    return this.entries.has(key(path));
  }

  /**
   * Resolves a location written in `baseDir`. Non-conforming producers write package-root
   * relative paths without the leading slash, so the root is tried as a fallback.
   */
  resolve(baseDir: string, loc: string | null | undefined): string | undefined {
    if (!loc?.trim()) return undefined;
    const relative = joinLoc(baseDir, loc);
    if (this.has(relative)) return relative;
    const rooted = joinLoc("", loc);
    return this.has(rooted) ? rooted : undefined;
  }

  async bytes(path: string, limit: number): Promise<Uint8Array> {
    const entry = this.entries.get(key(path));
    if (!entry) throw new OfdFormatError(`Missing package part ${path}.`);
    if (entry.encrypted || !SUPPORTED_METHODS.has(entry.compressionMethod)) throw new OfdFormatError("Unsupported ZIP entry.");
    if (entry.uncompressedSize > limit) throw new OfdLimitError("Package part exceeds the limit.");
    return entry.getData(new Uint8ArrayWriter(), { signal: this.signal });
  }

  async text(path: string) {
    const bytes = await this.bytes(path, OFD_LIMITS.xmlBytes);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async close() {
    await this.reader.close().catch(() => undefined);
  }
}

function isFile(entry: Entry): entry is FileEntry {
  return !entry.directory;
}
