export const MAX_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_STREAM_BYTES = 64 * 1024 * 1024;
export const MAX_TEXT_CHARS = 8_000_000;
export const MAX_BLOCKS = 20_000;
export const MAX_SLIDES = 500;
export const MAX_IMAGES = 256;
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 48 * 1024 * 1024;

export interface LegacyMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly company?: string;
  readonly keywords?: string;
  readonly created?: string;
  readonly modified?: string;
}

export interface LegacyRun {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  readonly superscript?: boolean;
  readonly subscript?: boolean;
  readonly fontSizePt?: number;
  readonly color?: string;
  readonly backgroundColor?: string;
  readonly href?: string;
  readonly imageIndex?: number;
}

export type LegacyAlign = "left" | "center" | "right" | "justify";

export type LegacyBlock =
  | {
      readonly kind: "heading";
      readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      readonly align?: LegacyAlign;
      readonly runs: readonly LegacyRun[];
    }
  | {
      readonly kind: "paragraph";
      readonly align?: LegacyAlign;
      readonly listLevel?: number;
      readonly listOrdered?: boolean;
      readonly runs: readonly LegacyRun[];
    }
  | {
      readonly kind: "table";
      readonly rows: readonly (readonly (readonly LegacyRun[])[])[];
    }
  | {
      readonly kind: "page-break";
    };

export interface LegacyImage {
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly alt?: string;
}

export interface LegacyDocument {
  readonly kind: "document";
  readonly format: "doc" | "rtf";
  readonly metadata: LegacyMetadata;
  readonly blocks: readonly LegacyBlock[];
  readonly footnotes: readonly LegacyBlock[];
  readonly images: readonly LegacyImage[];
  readonly truncated?: boolean;
}

export interface LegacySlideShape {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly hasBounds: boolean;
  readonly paragraphs: readonly LegacyBlock[];
  readonly imageIndex?: number;
  readonly fillColor?: string;
  readonly borderColor?: string;
}

export interface LegacySlide {
  readonly index: number;
  readonly title?: string;
  readonly shapes: readonly LegacySlideShape[];
  readonly fallbackParagraphs: readonly LegacyBlock[];
  readonly notes: readonly LegacyBlock[];
  readonly backgroundColor?: string;
}

export interface LegacyPresentation {
  readonly kind: "presentation";
  readonly format: "ppt";
  readonly metadata: LegacyMetadata;
  readonly slideWidth: number;
  readonly slideHeight: number;
  readonly slides: readonly LegacySlide[];
  readonly images: readonly LegacyImage[];
  readonly truncated?: boolean;
}

export type LegacyOfficeModel = LegacyDocument | LegacyPresentation;

export function sanitizeHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed, "https://example.invalid");
    if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
