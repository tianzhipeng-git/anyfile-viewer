import type { LegacyAlign, LegacyBlock, LegacyRun } from "./model";

export interface PptRecord {
  readonly ver: number;
  readonly inst: number;
  readonly type: number;
  readonly start: number;
  readonly end: number;
  readonly offset: number;
}

export interface LinkSpan {
  readonly begin: number;
  readonly end: number;
  readonly href: string;
}

export interface TextBox {
  readonly textType: number;
  readonly text: string;
  readonly styleAtom?: PptRecord;
  readonly links: readonly LinkSpan[];
}

export const MAX_DEPTH = 32;
const MAX_RECORDS = 50_000;

export function readRecords(buf: Uint8Array, start: number, end: number, state: { count: number }): PptRecord[] {
  const list: PptRecord[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = start;
  while (pos + 8 <= end) {
    if (++state.count > MAX_RECORDS) break;
    const vi = view.getUint16(pos, true);
    const type = view.getUint16(pos + 2, true);
    const len = view.getUint32(pos + 4, true);
    const payloadStart = pos + 8;
    const payloadEnd = payloadStart + len;
    if (payloadEnd > end || len > buf.byteLength) break;
    list.push({ ver: vi & 0x0f, inst: vi >>> 4, type, start: payloadStart, end: payloadEnd, offset: pos });
    pos = payloadEnd;
  }
  return list;
}

export function rgbFromColorRef(val: number): string | undefined {
  const flag = (val >>> 24) & 0xff;
  if (flag === 0xff || flag === 0xfe || flag === 0x00) {
    const r = val & 0xff;
    const g = (val >>> 8) & 0xff;
    const b = (val >>> 16) & 0xff;
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  return undefined;
}

interface ParsedStyleRuns {
  readonly paragraphs: Array<{ count: number; level: number; align?: LegacyAlign }>;
  readonly chars: Array<{
    count: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSizePt?: number;
    color?: string;
    superscript?: boolean;
    subscript?: boolean;
  }>;
}

function parseStyleTextPropAtom(buf: Uint8Array, rec: PptRecord, textLen: number): ParsedStyleRuns {
  const paragraphs: ParsedStyleRuns["paragraphs"] = [];
  const chars: ParsedStyleRuns["chars"] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = rec.start;
  const target = textLen + 1;

  let covered = 0;
  while (covered < target && pos + 10 <= rec.end) {
    const count = view.getUint32(pos, true);
    const level = view.getUint16(pos + 4, true);
    const mask = view.getUint32(pos + 6, true);
    pos += 10;
    if (count === 0) break;

    let align: LegacyAlign | undefined;
    if ((mask & 0x000f) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x0080) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x0010) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x0040) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x0020) !== 0 && pos + 4 <= rec.end) pos += 4;
    if ((mask & 0x0800) !== 0 && pos + 2 <= rec.end) {
      const a = view.getUint16(pos, true);
      align = a === 1 ? "center" : a === 2 ? "right" : a === 3 ? "justify" : "left";
      pos += 2;
    }
    for (const bit of [0x1000, 0x2000, 0x4000, 0x0100, 0x0400, 0x8000, 0x10000, 0x200000]) {
      if ((mask & bit) !== 0 && pos + 2 <= rec.end) pos += 2;
    }
    if ((mask & 0x100000) !== 0 && pos + 2 <= rec.end) {
      const tabCount = view.getUint16(pos, true);
      pos += 2 + Math.min(tabCount, 64) * 4;
    }
    if ((mask & 0xe0000) !== 0 && pos + 2 <= rec.end) pos += 2;

    paragraphs.push({ count, level: Math.min(4, level), align });
    covered += count;
  }

  covered = 0;
  while (covered < target && pos + 8 <= rec.end) {
    const count = view.getUint32(pos, true);
    const mask = view.getUint32(pos + 4, true);
    pos += 8;
    if (count === 0) break;

    let bold: boolean | undefined;
    let italic: boolean | undefined;
    let underline: boolean | undefined;
    let fontSizePt: number | undefined;
    let color: string | undefined;
    let superscript: boolean | undefined;
    let subscript: boolean | undefined;

    if ((mask & 0xffff) !== 0 && pos + 2 <= rec.end) {
      const cfStyle = view.getUint16(pos, true);
      bold = (mask & 0x0001) !== 0 ? (cfStyle & 0x0001) !== 0 : undefined;
      italic = (mask & 0x0002) !== 0 ? (cfStyle & 0x0002) !== 0 : undefined;
      underline = (mask & 0x0004) !== 0 ? (cfStyle & 0x0004) !== 0 : undefined;
      pos += 2;
    }
    if ((mask & 0x00010000) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x02000000) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x04000000) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x08000000) !== 0 && pos + 2 <= rec.end) pos += 2;
    if ((mask & 0x00020000) !== 0 && pos + 2 <= rec.end) {
      const sz = view.getUint16(pos, true);
      if (sz > 0 && sz < 1000) fontSizePt = sz;
      pos += 2;
    }
    if ((mask & 0x00040000) !== 0 && pos + 4 <= rec.end) {
      color = rgbFromColorRef(view.getUint32(pos, true));
      pos += 4;
    }
    if ((mask & 0x00080000) !== 0 && pos + 2 <= rec.end) {
      const pVal = view.getInt16(pos, true);
      superscript = pVal > 0;
      subscript = pVal < 0;
      pos += 2;
    }

    chars.push({ count, bold, italic, underline, fontSizePt, color, superscript, subscript });
    covered += count;
  }

  return { paragraphs, chars };
}

export function buildTextBlocks(buf: Uint8Array, box: TextBox, isTitleBox: boolean): LegacyBlock[] {
  const raw = box.text.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
  if (!raw.trim()) return [];
  const parsed = box.styleAtom ? parseStyleTextPropAtom(buf, box.styleAtom, raw.length) : undefined;

  const blocks: LegacyBlock[] = [];
  const paraRuns = parsed?.paragraphs ?? [];
  const charRuns = parsed?.chars ?? [];
  let charRunIdx = 0;
  let charRunPos = 0;
  let paraRunIdx = 0;
  let paraRunPos = 0;

  let lineStart = 0;
  for (let i = 0; i <= raw.length; i += 1) {
    if (i < raw.length && raw[i] !== "\r") continue;
    const lineEnd = i;
    const pMeta = paraRuns[paraRunIdx];
    const lineLevel = pMeta?.level ?? 0;
    const lineAlign = pMeta?.align;
    const runs: LegacyRun[] = [];

    for (let pos = lineStart; pos < lineEnd; pos += 1) {
      const ch = raw[pos]!;
      while (charRunIdx < charRuns.length && charRunPos >= charRuns[charRunIdx]!.count) {
        charRunPos = 0;
        charRunIdx += 1;
      }
      const cMeta = charRuns[charRunIdx];
      charRunPos += 1;

      const link = box.links.find((item) => pos >= item.begin && pos < item.end);
      const code = ch.charCodeAt(0);
      if (code < 0x20 && ch !== "\t" && ch !== "\x0b") continue;
      const text = ch === "\x0b" ? "\n" : ch;
      const prev = runs[runs.length - 1];
      if (
        prev &&
        prev.bold === cMeta?.bold &&
        prev.italic === cMeta?.italic &&
        prev.underline === cMeta?.underline &&
        prev.fontSizePt === cMeta?.fontSizePt &&
        prev.color === cMeta?.color &&
        prev.superscript === cMeta?.superscript &&
        prev.subscript === cMeta?.subscript &&
        prev.href === link?.href
      ) {
        runs[runs.length - 1] = { ...prev, text: prev.text + text };
      } else {
        runs.push({
          text,
          bold: cMeta?.bold,
          italic: cMeta?.italic,
          underline: cMeta?.underline,
          fontSizePt: cMeta?.fontSizePt,
          color: cMeta?.color,
          superscript: cMeta?.superscript,
          subscript: cMeta?.subscript,
          href: link?.href,
        });
      }
    }

    const lineLen = lineEnd - lineStart + 1;
    paraRunPos += lineLen;
    while (paraRunIdx < paraRuns.length && paraRunPos >= paraRuns[paraRunIdx]!.count) {
      paraRunPos -= paraRuns[paraRunIdx]!.count;
      paraRunIdx += 1;
    }
    charRunPos += 1;

    if (runs.length > 0) {
      if (isTitleBox && blocks.length === 0) {
        blocks.push({ kind: "heading", level: 2, align: lineAlign, runs });
      } else {
        blocks.push({
          kind: "paragraph",
          align: lineAlign,
          listLevel: lineLevel > 0 ? lineLevel - 1 : undefined,
          runs,
        });
      }
    }
    lineStart = i + 1;
  }
  return blocks;
}
