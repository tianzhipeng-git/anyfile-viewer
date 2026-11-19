import { decodeUtf16Le } from "./cp1252";
import type { LegacyAlign } from "./model";

export interface TextPiece {
  readonly cpStart: number;
  readonly cpEnd: number;
  readonly fcStart: number;
  readonly compressed: boolean;
}

export interface ChpStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  fontSizePt?: number;
  color?: string;
  fSpec?: boolean;
  fcPic?: number;
}

export interface PapStyle {
  istd: number;
  align?: LegacyAlign;
  inTable?: boolean;
  isTtp?: boolean;
  ilfo?: number;
  ilvl?: number;
}

export interface FcRange<T> {
  readonly fcStart: number;
  readonly fcEnd: number;
  readonly value: T;
}

const ICO_COLORS: readonly (string | undefined)[] = [
  undefined, "#000000", "#0000ff", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#ffff00",
  "#ffffff", "#000080", "#008080", "#008000", "#800080", "#800000", "#808000", "#808080",
  "#c0c0c0",
];

function sprmOperandLength(sprm: number, buf: Uint8Array, pos: number): number {
  const spra = (sprm >>> 13) & 0x7;
  switch (spra) {
    case 0:
    case 1:
      return 1;
    case 2:
    case 4:
    case 5:
      return 2;
    case 3:
      return 4;
    case 7:
      return 3;
    case 6: {
      if (pos >= buf.byteLength) return 0;
      if (sprm === 0xd608 && pos + 2 <= buf.byteLength) {
        return 2 + (buf[pos]! | (buf[pos + 1]! << 8));
      }
      return 1 + buf[pos]!;
    }
    default:
      return 0;
  }
}

function parseChpGrpprl(grpprl: Uint8Array): ChpStyle {
  const style: ChpStyle = {};
  const view = new DataView(grpprl.buffer, grpprl.byteOffset, grpprl.byteLength);
  let pos = 0;
  while (pos + 2 <= grpprl.byteLength) {
    const sprm = view.getUint16(pos, true);
    pos += 2;
    const opLen = sprmOperandLength(sprm, grpprl, pos);
    if (pos + opLen > grpprl.byteLength) break;

    if (sprm === 0x0835 && opLen >= 1) style.bold = (grpprl[pos]! & 1) !== 0;
    else if (sprm === 0x0836 && opLen >= 1) style.italic = (grpprl[pos]! & 1) !== 0;
    else if (sprm === 0x0837 && opLen >= 1) style.strike = (grpprl[pos]! & 1) !== 0;
    else if (sprm === 0x2a3e && opLen >= 1) style.underline = grpprl[pos]! !== 0;
    else if (sprm === 0x2a48 && opLen >= 1) {
      const iss = grpprl[pos]!;
      style.superscript = iss === 1;
      style.subscript = iss === 2;
    } else if (sprm === 0x4a43 && opLen >= 2) {
      const hps = view.getUint16(pos, true);
      if (hps > 0 && hps <= 2000) style.fontSizePt = hps / 2;
    } else if (sprm === 0x2a42 && opLen >= 1) {
      style.color = ICO_COLORS[grpprl[pos]!] ?? style.color;
    } else if (sprm === 0xca70 && opLen >= 5) {
      const r = grpprl[pos + 1]!;
      const g = grpprl[pos + 2]!;
      const b = grpprl[pos + 3]!;
      style.color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    } else if (sprm === 0x0855 && opLen >= 1) {
      style.fSpec = grpprl[pos]! !== 0;
    } else if (sprm === 0x6a03 && opLen >= 4) {
      style.fcPic = view.getInt32(pos, true);
    }

    pos += opLen;
  }
  return style;
}

function parsePapGrpprl(istd: number, grpprl: Uint8Array): PapStyle {
  const style: PapStyle = { istd };
  const view = new DataView(grpprl.buffer, grpprl.byteOffset, grpprl.byteLength);
  let pos = 0;
  while (pos + 2 <= grpprl.byteLength) {
    const sprm = view.getUint16(pos, true);
    pos += 2;
    const opLen = sprmOperandLength(sprm, grpprl, pos);
    if (pos + opLen > grpprl.byteLength) break;

    if ((sprm === 0x2403 || sprm === 0x2461) && opLen >= 1) {
      const jc = grpprl[pos]!;
      style.align = jc === 1 ? "center" : jc === 2 ? "right" : jc === 3 ? "justify" : "left";
    } else if (sprm === 0x2416 && opLen >= 1) {
      style.inTable = grpprl[pos]! !== 0;
    } else if (sprm === 0x2417 && opLen >= 1) {
      style.isTtp = grpprl[pos]! !== 0;
    } else if (sprm === 0x460b && opLen >= 2) {
      style.ilfo = view.getUint16(pos, true);
    } else if (sprm === 0x260a && opLen >= 1) {
      style.ilvl = grpprl[pos]!;
    }

    pos += opLen;
  }
  return style;
}

export function parseChpxBinTable(wd: Uint8Array, table: Uint8Array, fc: number, lcb: number): FcRange<ChpStyle>[] {
  if (lcb < 12 || fc + lcb > table.byteLength) return [];
  const tView = new DataView(table.buffer, table.byteOffset + fc, lcb);
  const n = Math.floor((lcb - 4) / 8);
  const ranges: FcRange<ChpStyle>[] = [];
  for (let i = 0; i < n; i += 1) {
    const pn = tView.getUint32(4 * (n + 1) + i * 4, true);
    const fkpOff = pn * 512;
    if (fkpOff + 512 > wd.byteLength) continue;
    const fkp = wd.subarray(fkpOff, fkpOff + 512);
    const fView = new DataView(fkp.buffer, fkp.byteOffset, 512);
    const crun = fkp[511]!;
    if (4 * (crun + 1) + crun > 511) continue;
    for (let r = 0; r < crun; r += 1) {
      const fcStart = fView.getUint32(r * 4, true);
      const fcEnd = fView.getUint32((r + 1) * 4, true);
      const rgb = fkp[4 * (crun + 1) + r]!;
      let value: ChpStyle = {};
      if (rgb > 0) {
        const chpxOff = rgb * 2;
        if (chpxOff < 511) {
          const cb = fkp[chpxOff]!;
          if (chpxOff + 1 + cb <= 511) {
            value = parseChpGrpprl(fkp.subarray(chpxOff + 1, chpxOff + 1 + cb));
          }
        }
      }
      ranges.push({ fcStart, fcEnd, value });
    }
  }
  ranges.sort((a, b) => a.fcStart - b.fcStart);
  return ranges;
}

export function parsePapxBinTable(wd: Uint8Array, table: Uint8Array, fc: number, lcb: number): FcRange<PapStyle>[] {
  if (lcb < 12 || fc + lcb > table.byteLength) return [];
  const tView = new DataView(table.buffer, table.byteOffset + fc, lcb);
  const n = Math.floor((lcb - 4) / 8);
  const ranges: FcRange<PapStyle>[] = [];
  for (let i = 0; i < n; i += 1) {
    const pn = tView.getUint32(4 * (n + 1) + i * 4, true);
    const fkpOff = pn * 512;
    if (fkpOff + 512 > wd.byteLength) continue;
    const fkp = wd.subarray(fkpOff, fkpOff + 512);
    const fView = new DataView(fkp.buffer, fkp.byteOffset, 512);
    const crun = fkp[511]!;
    if (4 * (crun + 1) + crun * 13 > 511) continue;
    for (let r = 0; r < crun; r += 1) {
      const fcStart = fView.getUint32(r * 4, true);
      const fcEnd = fView.getUint32((r + 1) * 4, true);
      const bOffset = fkp[4 * (crun + 1) + r * 13]!;
      let value: PapStyle = { istd: 0 };
      if (bOffset > 0) {
        const papxOff = bOffset * 2;
        if (papxOff + 2 < 511) {
          const cb = fkp[papxOff]!;
          const grpStart = cb === 0 ? papxOff + 2 : papxOff + 1;
          const grpEnd = cb === 0 ? grpStart + fkp[papxOff + 1]! * 2 : grpStart + cb * 2 - 1;
          if (grpStart + 2 <= Math.min(grpEnd, 511)) {
            const istd = fView.getUint16(grpStart, true);
            value = parsePapGrpprl(istd, fkp.subarray(grpStart + 2, Math.min(grpEnd, 511)));
          }
        }
      }
      ranges.push({ fcStart, fcEnd, value });
    }
  }
  ranges.sort((a, b) => a.fcStart - b.fcStart);
  return ranges;
}

export function findInRanges<T>(ranges: readonly FcRange<T>[], fc: number): T | undefined {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const item = ranges[mid]!;
    if (fc < item.fcStart) hi = mid - 1;
    else if (fc >= item.fcEnd) lo = mid + 1;
    else return item.value;
  }
  return undefined;
}

export function parseHeadingStyleMap(table: Uint8Array, fc: number, lcb: number): Map<number, 1 | 2 | 3 | 4 | 5 | 6> {
  const headings = new Map<number, 1 | 2 | 3 | 4 | 5 | 6>();
  for (let i = 1; i <= 6; i += 1) headings.set(i, i as 1 | 2 | 3 | 4 | 5 | 6);
  if (lcb < 20 || fc + lcb > table.byteLength) return headings;
  const view = new DataView(table.buffer, table.byteOffset + fc, lcb);
  const cbStshi = view.getUint16(0, true);
  if (2 + cbStshi > lcb || cbStshi < 4) return headings;
  const cstd = view.getUint16(2, true);
  const cbSTDBaseInFile = view.getUint16(4, true);
  let pos = 2 + cbStshi;
  for (let istd = 0; istd < cstd && pos + 2 <= lcb; istd += 1) {
    const cbStd = view.getUint16(pos, true);
    pos += 2;
    if (cbStd === 0 || pos + cbStd > lcb) {
      pos += cbStd;
      continue;
    }
    const nameLenOff = pos + cbSTDBaseInFile;
    if (nameLenOff + 2 <= pos + cbStd) {
      const cchName = view.getUint16(nameLenOff, true);
      const nameStart = nameLenOff + 2;
      const nameEnd = nameStart + cchName * 2;
      if (cchName > 0 && nameEnd <= pos + cbStd) {
        const name = decodeUtf16Le(table.subarray(fc + nameStart, fc + nameEnd)).replace(/\0+$/, "");
        const match = /^(?:heading|标题)\s*([1-6])$/i.exec(name.trim());
        if (match) headings.set(istd, Number(match[1]) as 1 | 2 | 3 | 4 | 5 | 6);
      }
    }
    pos += cbStd;
  }
  return headings;
}

export function parsePieceTable(table: Uint8Array, fcClx: number, lcbClx: number): TextPiece[] {
  if (lcbClx === 0 || fcClx + lcbClx > table.byteLength) {
    throw new Error("DOC piece table (Clx) is missing or truncated.");
  }
  const clx = table.subarray(fcClx, fcClx + lcbClx);
  const view = new DataView(clx.buffer, clx.byteOffset, clx.byteLength);
  let pos = 0;
  while (pos < clx.byteLength && clx[pos] === 1) {
    if (pos + 3 > clx.byteLength) break;
    const cb = view.getInt16(pos + 1, true);
    if (cb < 0) break;
    pos += 3 + cb;
  }
  if (pos + 5 > clx.byteLength || clx[pos] !== 2) {
    throw new Error("DOC Pcdt piece table marker missing.");
  }
  const lcbPcd = view.getUint32(pos + 1, true);
  if (pos + 5 + lcbPcd > clx.byteLength || lcbPcd < 4) {
    throw new Error("DOC PlcPcd table is truncated.");
  }
  const n = Math.floor((lcbPcd - 4) / 12);
  const cpBase = pos + 5;
  const pcdBase = cpBase + (n + 1) * 4;
  const pieces: TextPiece[] = [];
  for (let i = 0; i < n; i += 1) {
    const cpStart = view.getInt32(cpBase + i * 4, true);
    const cpEnd = view.getInt32(cpBase + (i + 1) * 4, true);
    const fcRaw = view.getUint32(pcdBase + i * 8 + 2, true);
    const compressed = (fcRaw & 0x40000000) !== 0;
    const fcStart = compressed ? (fcRaw & 0x3fffffff) >>> 1 : fcRaw & 0x3fffffff;
    if (cpEnd > cpStart) pieces.push({ cpStart, cpEnd, fcStart, compressed });
  }
  return pieces;
}
