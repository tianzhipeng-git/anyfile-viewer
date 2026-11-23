import { BlobReader, BlobWriter, Uint8ArrayWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js/lib/zip-core-custom.js";

/** Limits are shared by the outer package and a nested `Index.zip`. */
export const IWORK_LIMITS = {
  entries: 20_000,
  /** One compressed IWA stream, legacy XML file or nested Index.zip. */
  entryBytes: 128 * 1024 * 1024,
  /** Sum of decompressed IWA streams / legacy XML text. */
  expandedBytes: 256 * 1024 * 1024,
  /** Sum of thumbnails and previews turned into object URLs. */
  imageBytes: 64 * 1024 * 1024,
  slides: 5_000,
};

export class PackageLimitError extends Error {}
export class PackageEncryptedError extends Error {}

const SUPPORTED_METHODS = new Set([0, 8]);

/** Read-only view over the iWork ZIP container (and a nested `Index.zip`, if mounted). */
export class IworkPackage {
  private readonly readers: ZipReader<unknown>[] = [];
  private readonly entries = new Map<string, FileEntry>();

  private constructor(private readonly signal: AbortSignal) {}

  static async open(file: Blob, signal: AbortSignal) {
    const pkg = new IworkPackage(signal);
    try {
      await pkg.mount(file, "");
      return pkg;
    } catch (error) {
      await pkg.close();
      throw error;
    }
  }

  get names(): ReadonlySet<string> {
    return new Set(this.entries.keys());
  }

  /** Mounts a nested ZIP (the `Index.zip` of a package bundle) under `prefix`. */
  async mountNested(path: string, prefix: string) {
    await this.mount(await this.blob(path, IWORK_LIMITS.entryBytes), prefix);
  }

  async bytes(path: string, limit: number) {
    const entry = this.entry(path, limit);
    return entry.getData(new Uint8ArrayWriter(), { signal: this.signal });
  }

  async blob(path: string, limit: number, type = "application/octet-stream") {
    const entry = this.entry(path, limit);
    return entry.getData(new BlobWriter(type), { signal: this.signal });
  }

  size(path: string) {
    return this.entries.get(path)?.uncompressedSize;
  }

  async close() {
    await Promise.all(this.readers.splice(0).map((reader) => reader.close().catch(() => undefined)));
  }

  private entry(path: string, limit: number) {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`Missing package entry ${path}.`);
    if (entry.encrypted || !SUPPORTED_METHODS.has(entry.compressionMethod)) throw new PackageEncryptedError("Encrypted entry.");
    if (entry.uncompressedSize > limit) throw new PackageLimitError("Package entry exceeds the limit.");
    return entry;
  }

  private async mount(blob: Blob, prefix: string) {
    const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false, useCompressionStream: true });
    this.readers.push(reader);
    for await (const entry of reader.getEntriesGenerator()) {
      if (this.signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
      if (this.entries.size >= IWORK_LIMITS.entries) throw new PackageLimitError("Too many package entries.");
      if (isFile(entry)) this.entries.set((prefix + entry.filename).normalize("NFC"), entry);
    }
  }
}

function isFile(entry: Entry): entry is FileEntry {
  return !entry.directory;
}
