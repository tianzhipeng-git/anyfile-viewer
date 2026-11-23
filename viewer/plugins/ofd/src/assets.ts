import {
  FontFormatError,
  SharedResourceCache,
  parseTrueType,
  type GlyphOutlineFont,
} from "@anyfile/viewer-rendering/fixed-layout";

import { OFD_LIMITS } from "./limits";
import { OfdFormatError, type OfdPackage } from "./package";
import { extractSealPicture, sniffImage } from "./seal";

export interface OfdImage {
  readonly source: CanvasImageSource;
  readonly pixels: number;
  close(): void;
}

/** Rasterises a nested seal OFD; absent inside a nested document (no deeper recursion). */
export type SealDocumentRenderer = (bytes: Uint8Array) => Promise<OfdImage | null>;

export interface PageAssets {
  readonly fonts: ReadonlyMap<string, GlyphOutlineFont | null>;
  readonly images: ReadonlyMap<string, OfdImage | null>;
  readonly seals: ReadonlyMap<string, OfdImage | null>;
  release(): void;
}

export async function decodeImage(bytes: Uint8Array): Promise<OfdImage | null> {
  const type = sniffImage(bytes);
  if (!type || typeof createImageBitmap === "undefined") return null; // JBIG2 and others are skipped
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  if (bitmap.width * bitmap.height > OFD_LIMITS.imagePixels) {
    bitmap.close();
    return null;
  }
  return { source: bitmap, pixels: bitmap.width * bitmap.height, close: () => bitmap.close() };
}

const closeImage = (image: OfdImage) => image.close();

/** Budgeted, reference-counted fonts, images and seal pictures shared across pages. */
export class OfdAssets {
  private readonly fonts: SharedResourceCache<GlyphOutlineFont>;
  private readonly images: SharedResourceCache<OfdImage>;
  private readonly seals: SharedResourceCache<OfdImage>;

  constructor(
    private readonly pkg: OfdPackage,
    private readonly renderSealDocument?: SealDocumentRenderer,
  ) {
    this.fonts = new SharedResourceCache(OFD_LIMITS.fontCacheBytes, (part) => this.loadFont(part));
    this.images = new SharedResourceCache(OFD_LIMITS.imageCachePixels, (part) => this.loadImage(part), closeImage);
    this.seals = new SharedResourceCache(OFD_LIMITS.imageCachePixels, (key) => this.loadSeal(key), closeImage);
  }

  /** Loads (or reuses) a page's resources and pins them until `release()`. */
  async acquire(page: { fonts: Iterable<string>; images: Iterable<string>; seals: Iterable<string> }): Promise<PageAssets> {
    const acquired: { release(): void }[] = [];
    try {
      const fonts = await this.fonts.acquire(page.fonts);
      acquired.push(fonts);
      const images = await this.images.acquire(page.images);
      acquired.push(images);
      const seals = await this.seals.acquire(page.seals);
      acquired.push(seals);
      return {
        fonts: fonts.values,
        images: images.values,
        seals: seals.values,
        release: () => acquired.forEach((item) => item.release()),
      };
    } catch (error) {
      acquired.forEach((item) => item.release());
      throw error;
    }
  }

  dispose() {
    this.fonts.dispose();
    this.images.dispose();
    this.seals.dispose();
  }

  private async loadFont(part: string) {
    try {
      const bytes = await this.pkg.bytes(part, OFD_LIMITS.fontBytes);
      return { value: parseTrueType(bytes), cost: bytes.length };
    } catch (error) {
      if (error instanceof FontFormatError) return { value: null, cost: 0 }; // CFF / damaged → system font
      throw error;
    }
  }

  private async loadImage(part: string) {
    const value = await decodeImage(await this.pkg.bytes(part, OFD_LIMITS.imageBytes));
    return { value, cost: value?.pixels ?? 0 };
  }

  /** `key` lists the signature value and seal file paths (see `sealKey`). */
  private async loadSeal(key: string) {
    for (const source of key.split("|")) {
      let picture;
      try {
        picture = extractSealPicture(await this.pkg.bytes(source, OFD_LIMITS.sealBytes));
      } catch (error) {
        if (error instanceof OfdFormatError) continue;
        throw error;
      }
      if (!picture) continue;
      const value = picture.kind === "image" ? await decodeImage(picture.bytes) : await this.renderSealDocument?.(picture.bytes);
      if (value) return { value, cost: value.pixels };
    }
    return { value: null, cost: 0 };
  }
}
