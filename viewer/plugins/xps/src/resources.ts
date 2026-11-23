import { FontFormatError, deobfuscateFont, parseTrueType, type GlyphOutlineFont } from "./font";
import { XPS_LIMITS } from "./limits";
import type { XpsPackage } from "./package";

export interface XpsImage {
  readonly source: CanvasImageSource;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Size in XPS units (1/96 inch) derived from the image resolution; Viewbox uses this space. */
  readonly width: number;
  readonly height: number;
  close(): void;
}

interface CacheEntry<T> {
  readonly promise: Promise<T | null>;
  cost: number;
  value?: T | null;
  users: number;
}

function sniffImage(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 0x2a)) return "image/tiff";
  return undefined; // JPEG XR (HD Photo) and unknown formats are skipped.
}

/** Dots per inch from a JFIF APP0 or PNG pHYs header; 96 when absent. */
export function imageDpi(bytes: Uint8Array, type: string): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/jpeg" && bytes.length > 18 && bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 10)) === "JFIF") {
    const unit = bytes[13];
    const x = view.getUint16(14);
    const y = view.getUint16(16);
    if (x > 0 && y > 0 && unit === 1) return [x, y];
    if (x > 0 && y > 0 && unit === 2) return [x * 2.54, y * 2.54];
  }
  if (type === "image/png") {
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = view.getUint32(offset);
      const chunk = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (chunk === "pHYs" && length === 9 && bytes[offset + 16] === 1) {
        const x = view.getUint32(offset + 8) * 0.0254;
        const y = view.getUint32(offset + 12) * 0.0254;
        if (x > 0 && y > 0) return [x, y];
      }
      if (chunk === "IDAT" || chunk === "IEND") break;
      offset += 12 + length;
    }
  }
  return [96, 96];
}

async function decodeImage(bytes: Uint8Array, signal: AbortSignal): Promise<XpsImage | null> {
  const type = sniffImage(bytes);
  if (!type || typeof createImageBitmap === "undefined") return null;
  let bitmap: ImageBitmap;
  if (type === "image/tiff") {
    const { decodeTiff } = await import("@anyfile/general-raster-viewer/tiff");
    const raster = await decodeTiff(new File([bytes as Uint8Array<ArrayBuffer>], "image.tif"), 0, signal);
    bitmap = await createImageBitmap(new ImageData(raster.rgba as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height));
  } else {
    bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  }
  if (bitmap.width * bitmap.height > XPS_LIMITS.imagePixels) {
    bitmap.close();
    return null;
  }
  const [dpiX, dpiY] = imageDpi(bytes, type);
  return {
    source: bitmap,
    pixelWidth: bitmap.width,
    pixelHeight: bitmap.height,
    width: (bitmap.width * 96) / dpiX,
    height: (bitmap.height * 96) / dpiY,
    close: () => bitmap.close(),
  };
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Reference-counted, budgeted caches for decoded fonts and images shared across pages. */
export class XpsResources {
  private readonly fonts = new Map<string, CacheEntry<GlyphOutlineFont>>();
  private readonly images = new Map<string, CacheEntry<XpsImage>>();
  private disposed = false;

  constructor(
    private readonly pkg: XpsPackage,
    private readonly signal: AbortSignal,
  ) {}

  /** Loads (or reuses) the parts and pins them until the returned release function runs. */
  async acquire(fontParts: Iterable<string>, imageParts: Iterable<string>) {
    const fontEntries = [...new Set(fontParts)].map((part) => [part, this.entry(this.fonts, part, () => this.loadFont(part))] as const);
    const imageEntries = [...new Set(imageParts)].map((part) => [part, this.entry(this.images, part, () => this.loadImage(part))] as const);
    for (const [, entry] of [...fontEntries, ...imageEntries]) entry.users += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const [, entry] of [...fontEntries, ...imageEntries]) entry.users -= 1;
      this.evict();
    };
    try {
      const fonts = new Map<string, GlyphOutlineFont | null>();
      const images = new Map<string, XpsImage | null>();
      for (const [part, entry] of fontEntries) fonts.set(part, await entry.promise);
      for (const [part, entry] of imageEntries) images.set(part, await entry.promise);
      return { fonts, images, release };
    } catch (error) {
      release();
      throw error;
    }
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.images.values()) entry.value?.close();
    this.images.clear();
    this.fonts.clear();
  }

  private entry<T>(cache: Map<string, CacheEntry<T>>, part: string, load: () => Promise<{ value: T | null; cost: number }>) {
    const existing = cache.get(part);
    if (existing) {
      cache.delete(part);
      cache.set(part, existing); // most recently used last
      return existing;
    }
    const entry: CacheEntry<T> = {
      cost: 0,
      users: 0,
      promise: load().then(
        ({ value, cost }) => {
          entry.value = value;
          entry.cost = cost;
          if (this.disposed && value && "close" in (value as object)) (value as unknown as XpsImage).close();
          return value;
        },
        (error: unknown) => {
          cache.delete(part);
          if (isAbort(error)) throw error;
          return null; // A broken resource only blanks the elements that use it.
        },
      ),
    };
    cache.set(part, entry);
    return entry;
  }

  /** `key` is `part#face` (see `XpsNode.font`). */
  private async loadFont(key: string) {
    const hash = key.lastIndexOf("#");
    const part = key.slice(0, hash);
    try {
      let bytes = await this.pkg.bytes(part, XPS_LIMITS.fontBytes);
      if (part.toLowerCase().endsWith(".odttf")) bytes = deobfuscateFont(bytes, part);
      return { value: parseTrueType(bytes, Number(key.slice(hash + 1))), cost: bytes.length };
    } catch (error) {
      if (error instanceof FontFormatError) return { value: null, cost: 0 };
      throw error;
    }
  }

  private async loadImage(part: string) {
    const bytes = await this.pkg.bytes(part, XPS_LIMITS.imageBytes);
    const value = await decodeImage(bytes, this.signal);
    return { value, cost: value ? value.pixelWidth * value.pixelHeight : 0 };
  }

  private evict() {
    trim(this.fonts, XPS_LIMITS.fontCacheBytes);
    trim(this.images, XPS_LIMITS.imageCachePixels, (image) => image.close());
  }
}

function trim<T>(cache: Map<string, CacheEntry<T>>, budget: number, close?: (value: T) => void) {
  let total = 0;
  for (const entry of cache.values()) total += entry.cost;
  for (const [part, entry] of cache) {
    if (total <= budget) return;
    if (entry.users > 0 || entry.value === undefined) continue;
    cache.delete(part);
    total -= entry.cost;
    if (entry.value) close?.(entry.value);
  }
}
