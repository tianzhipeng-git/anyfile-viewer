/**
 * Minimal TrueType reader for fixed-layout documents (XPS, OFD): glyph outlines come from
 * `glyf`/`loca` so text renders by glyph id without registering fonts globally.
 * CFF-flavoured OpenType is reported as unsupported and drawn with a fallback font.
 */

export class FontFormatError extends Error {}

const MAX_COMPOSITE_DEPTH = 8;

interface Table {
  readonly offset: number;
  readonly length: number;
}

export interface GlyphOutlineFont {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly numGlyphs: number;
  glyphIndex(codePoint: number): number;
  advance(glyph: number): number;
  /** SVG path data in font units (y up). Empty for blank glyphs. */
  outline(glyph: number): string;
}

function tag(view: DataView, offset: number) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function readTables(view: DataView, offset: number) {
  const tables = new Map<string, Table>();
  const count = view.getUint16(offset + 4);
  for (let i = 0; i < count; i += 1) {
    const record = offset + 12 + i * 16;
    const table = { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) };
    if (table.offset + table.length > view.byteLength) throw new FontFormatError("Font table out of range.");
    tables.set(tag(view, record), table);
  }
  return tables;
}

function cmapFormat4(view: DataView, start: number) {
  const segCount = view.getUint16(start + 6) / 2;
  const ends = start + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const ranges = deltas + segCount * 2;
  return (code: number) => {
    if (code > 0xffff) return 0;
    for (let i = 0; i < segCount; i += 1) {
      if (code > view.getUint16(ends + i * 2)) continue;
      const first = view.getUint16(starts + i * 2);
      if (code < first) return 0;
      const delta = view.getUint16(deltas + i * 2);
      const rangeOffset = view.getUint16(ranges + i * 2);
      if (rangeOffset === 0) return (code + delta) & 0xffff;
      const address = ranges + i * 2 + rangeOffset + (code - first) * 2;
      if (address + 2 > view.byteLength) return 0;
      const glyph = view.getUint16(address);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function cmapFormat12(view: DataView, start: number) {
  const groups = view.getUint32(start + 12);
  return (code: number) => {
    let low = 0;
    let high = groups - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const record = start + 16 + mid * 12;
      const first = view.getUint32(record);
      const last = view.getUint32(record + 4);
      if (code < first) high = mid - 1;
      else if (code > last) low = mid + 1;
      else return view.getUint32(record + 8) + (code - first);
    }
    return 0;
  };
}

function readCmap(view: DataView, table: Table | undefined) {
  if (!table) return { lookup: () => 0, symbol: false };
  const count = view.getUint16(table.offset + 2);
  const candidates: { score: number; offset: number; symbol: boolean }[] = [];
  for (let i = 0; i < count; i += 1) {
    const record = table.offset + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = table.offset + view.getUint32(record + 4);
    const format = view.getUint16(offset);
    if (format !== 4 && format !== 12) continue;
    const score = (platform === 3 && encoding === 10) || (platform === 0 && format === 12) ? 3 : platform === 3 && encoding === 1 ? 2 : platform === 0 ? 1 : platform === 3 && encoding === 0 ? 0.5 : -1;
    if (score >= 0) candidates.push({ score, offset, symbol: platform === 3 && encoding === 0 });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return { lookup: () => 0, symbol: false };
  const lookup = view.getUint16(best.offset) === 12 ? cmapFormat12(view, best.offset) : cmapFormat4(view, best.offset);
  return { lookup, symbol: best.symbol };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Converts quadratic TrueType contours to SVG path data (implicit on-curve midpoints). */
function contourPath(xs: number[], ys: number[], on: boolean[], start: number, end: number) {
  const count = end - start + 1;
  if (count < 2) return "";
  const at = (i: number) => start + ((i % count) + count) % count;
  // Start from an on-curve point, or the midpoint of the first two off-curve points.
  let first = -1;
  for (let i = 0; i < count; i += 1) if (on[at(i)]) { first = i; break; }
  let sx: number;
  let sy: number;
  if (first >= 0) {
    sx = xs[at(first)]!;
    sy = ys[at(first)]!;
  } else {
    first = 0;
    sx = (xs[at(0)]! + xs[at(1)]!) / 2;
    sy = (ys[at(0)]! + ys[at(1)]!) / 2;
  }
  let d = `M${round(sx)} ${round(sy)}`;
  let pending: [number, number] | undefined = first >= 0 && on[at(first)] ? undefined : [xs[at(0)]!, ys[at(0)]!];
  for (let step = 1; step <= count; step += 1) {
    const i = at(first + step);
    const x = xs[i]!;
    const y = ys[i]!;
    if (on[i]) {
      d += pending ? `Q${round(pending[0])} ${round(pending[1])} ${round(x)} ${round(y)}` : `L${round(x)} ${round(y)}`;
      pending = undefined;
    } else if (pending) {
      const mx = (pending[0] + x) / 2;
      const my = (pending[1] + y) / 2;
      d += `Q${round(pending[0])} ${round(pending[1])} ${round(mx)} ${round(my)}`;
      pending = [x, y];
    } else {
      pending = [x, y];
    }
  }
  if (pending) d += `Q${round(pending[0])} ${round(pending[1])} ${round(sx)} ${round(sy)}`;
  return `${d}Z`;
}

class TrueTypeFont implements GlyphOutlineFont {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly numGlyphs: number;
  private readonly view: DataView;
  private readonly cmap: { lookup: (code: number) => number; symbol: boolean };
  private readonly longLoca: boolean;
  private readonly metricsCount: number;
  private readonly hmtx: Table;
  private readonly loca: Table;
  private readonly glyf: Table;
  private readonly outlines = new Map<number, string>();

  constructor(bytes: Uint8Array, face: number) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    if (tag(this.view, 0) === "ttcf") {
      const faces = this.view.getUint32(8);
      offset = this.view.getUint32(12 + Math.min(Math.max(0, face), faces - 1) * 4);
    }
    const version = this.view.getUint32(offset);
    if (version === 0x4f54544f) throw new FontFormatError("CFF outlines are not supported.");
    if (version !== 0x00010000 && version !== 0x74727565) throw new FontFormatError("Not a TrueType font.");
    const tables = readTables(this.view, offset);
    const head = tables.get("head");
    const hhea = tables.get("hhea");
    const maxp = tables.get("maxp");
    const hmtx = tables.get("hmtx");
    const loca = tables.get("loca");
    const glyf = tables.get("glyf");
    if (!head || !hhea || !maxp || !hmtx || !loca || !glyf) throw new FontFormatError("Missing TrueType tables.");
    this.unitsPerEm = this.view.getUint16(head.offset + 18) || 1000;
    this.longLoca = this.view.getInt16(head.offset + 50) === 1;
    this.ascent = this.view.getInt16(hhea.offset + 4);
    this.metricsCount = Math.max(1, this.view.getUint16(hhea.offset + 34));
    this.numGlyphs = this.view.getUint16(maxp.offset + 4);
    this.hmtx = hmtx;
    this.loca = loca;
    this.glyf = glyf;
    this.cmap = readCmap(this.view, tables.get("cmap"));
  }

  glyphIndex(codePoint: number) {
    const glyph = this.cmap.lookup(codePoint);
    if (glyph || !this.cmap.symbol || codePoint > 0xff) return glyph;
    return this.cmap.lookup(0xf000 + codePoint);
  }

  advance(glyph: number) {
    const index = Math.min(glyph, this.metricsCount - 1);
    const offset = this.hmtx.offset + index * 4;
    return offset + 2 <= this.hmtx.offset + this.hmtx.length ? this.view.getUint16(offset) : this.unitsPerEm / 2;
  }

  outline(glyph: number): string {
    let cached = this.outlines.get(glyph);
    if (cached === undefined) {
      try {
        cached = this.readGlyph(glyph, 0, [1, 0, 0, 1, 0, 0]);
      } catch {
        cached = ""; // A corrupt glyph only blanks itself.
      }
      this.outlines.set(glyph, cached);
    }
    return cached;
  }

  private glyphRange(glyph: number) {
    if (glyph < 0 || glyph >= this.numGlyphs) return undefined;
    const v = this.view;
    const at = (i: number) => (this.longLoca ? v.getUint32(this.loca.offset + i * 4) : v.getUint16(this.loca.offset + i * 2) * 2);
    const start = at(glyph);
    const end = at(glyph + 1);
    if (end <= start || end > this.glyf.length) return undefined;
    return { start: this.glyf.offset + start, end: this.glyf.offset + end };
  }

  private readGlyph(glyph: number, depth: number, m: readonly number[]): string {
    const range = this.glyphRange(glyph);
    if (!range || depth > MAX_COMPOSITE_DEPTH) return "";
    const v = this.view;
    const contours = v.getInt16(range.start);
    if (contours < 0) return this.readComposite(range.start + 10, depth, m);
    let p = range.start + 10;
    const ends: number[] = [];
    for (let i = 0; i < contours; i += 1, p += 2) ends.push(v.getUint16(p));
    const points = (ends.at(-1) ?? -1) + 1;
    p += 2 + v.getUint16(p);
    const flags: number[] = [];
    while (flags.length < points) {
      const flag = v.getUint8(p++);
      flags.push(flag);
      if (flag & 8) {
        const repeat = v.getUint8(p++);
        for (let r = 0; r < repeat && flags.length < points; r += 1) flags.push(flag);
      }
    }
    const read = (shortBit: number, sameBit: number) => {
      const values: number[] = [];
      let value = 0;
      for (const flag of flags) {
        if (flag & shortBit) {
          const delta = v.getUint8(p++);
          value += flag & sameBit ? delta : -delta;
        } else if (!(flag & sameBit)) {
          value += v.getInt16(p);
          p += 2;
        }
        values.push(value);
      }
      return values;
    };
    const rawX = read(2, 16);
    const rawY = read(4, 32);
    if (p > range.end) throw new FontFormatError("Glyph data out of range.");
    const xs = rawX.map((x, i) => m[0]! * x + m[2]! * rawY[i]! + m[4]!);
    const ys = rawX.map((x, i) => m[1]! * x + m[3]! * rawY[i]! + m[5]!);
    const on = flags.map((flag) => (flag & 1) === 1);
    let d = "";
    let start = 0;
    for (const end of ends) {
      d += contourPath(xs, ys, on, start, end);
      start = end + 1;
    }
    return d;
  }

  private readComposite(p: number, depth: number, parent: readonly number[]): string {
    const v = this.view;
    let d = "";
    for (let more = true; more; ) {
      const flags = v.getUint16(p);
      const glyph = v.getUint16(p + 2);
      p += 4;
      let dx: number;
      let dy: number;
      if (flags & 1) {
        dx = v.getInt16(p);
        dy = v.getInt16(p + 2);
        p += 4;
      } else {
        dx = v.getInt8(p);
        dy = v.getInt8(p + 1);
        p += 2;
      }
      let [a, b, c, e] = [1, 0, 0, 1];
      const f2dot14 = (offset: number) => v.getInt16(offset) / 16384;
      if (flags & 8) {
        a = e = f2dot14(p);
        p += 2;
      } else if (flags & 0x40) {
        a = f2dot14(p);
        e = f2dot14(p + 2);
        p += 4;
      } else if (flags & 0x80) {
        a = f2dot14(p);
        b = f2dot14(p + 2);
        c = f2dot14(p + 4);
        e = f2dot14(p + 6);
        p += 8;
      }
      // Point-matching placement (flag 2 clear) is rare; treat the arguments as zero offsets.
      if (!(flags & 2)) dx = dy = 0;
      const local = [a, b, c, e, dx, dy];
      const combined = [
        local[0]! * parent[0]! + local[1]! * parent[2]!,
        local[0]! * parent[1]! + local[1]! * parent[3]!,
        local[2]! * parent[0]! + local[3]! * parent[2]!,
        local[2]! * parent[1]! + local[3]! * parent[3]!,
        local[4]! * parent[0]! + local[5]! * parent[2]! + parent[4]!,
        local[4]! * parent[1]! + local[5]! * parent[3]! + parent[5]!,
      ];
      d += this.readGlyph(glyph, depth + 1, combined);
      more = (flags & 0x20) !== 0;
    }
    return d;
  }
}

export function parseTrueType(bytes: Uint8Array, face = 0): GlyphOutlineFont {
  try {
    return new TrueTypeFont(bytes, face);
  } catch (error) {
    if (error instanceof FontFormatError) throw error;
    throw new FontFormatError("Damaged font.", { cause: error });
  }
}
