import type { LegacyAlign, LegacyMetadata, LegacyRun } from "./model";

export type RtfMode =
  | "body"
  | "skip"
  | "fonttbl"
  | "colortbl"
  | "stylesheet"
  | "info"
  | "info-field"
  | "pict"
  | "field-inst"
  | "footnote"
  | "listtext";

export interface RtfState {
  mode: RtfMode;
  infoKey?: keyof LegacyMetadata;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  fontSizePt?: number;
  fontId?: number;
  colorIdx: number;
  bgColorIdx: number;
  uc: number;
  align?: LegacyAlign;
  inTable: boolean;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  listLevel?: number;
  href?: string;
  pictType?: "png" | "jpeg" | "dib";
  fontEntryId?: number;
  styleEntryId?: number;
}

export const SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "header", "footer",
  "headerl", "headerr", "headerf", "footerl", "footerr", "footerf",
  "listtable", "listoverridetable", "revtbl", "rsidtbl", "generator",
  "xmlnstbl", "latentstyles", "datastore", "themedata", "colorschememapping",
  "mmathPr", "pgdsctbl", "expandedcolortbl", "object", "objdata", "xe", "tc",
]);

export function appendRtfRun(runs: LegacyRun[], next: LegacyRun) {
  if (!next.text && next.imageIndex === undefined) return;
  const prev = runs[runs.length - 1];
  if (
    prev &&
    prev.imageIndex === undefined &&
    next.imageIndex === undefined &&
    prev.bold === next.bold &&
    prev.italic === next.italic &&
    prev.underline === next.underline &&
    prev.strike === next.strike &&
    prev.superscript === next.superscript &&
    prev.subscript === next.subscript &&
    prev.fontSizePt === next.fontSizePt &&
    prev.color === next.color &&
    prev.backgroundColor === next.backgroundColor &&
    prev.href === next.href
  ) {
    runs[runs.length - 1] = { ...prev, text: prev.text + next.text };
    return;
  }
  runs.push(next);
}

export function parseHexBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
