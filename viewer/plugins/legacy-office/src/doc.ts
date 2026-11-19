import type { CfbfArchive } from "./cfbf";
import { decodeUtf16Le, decodeWithCodePage } from "./cp1252";
import {
  findInRanges,
  parseChpxBinTable,
  parseHeadingStyleMap,
  parsePapxBinTable,
  parsePieceTable,
  type ChpStyle,
  type FcRange,
  type PapStyle,
} from "./doc-tables";
import { createImageCollector, decodeOfficeArtBlip } from "./images";
import {
  MAX_BLOCKS,
  MAX_TEXT_CHARS,
  sanitizeHref,
  type LegacyBlock,
  type LegacyDocument,
  type LegacyRun,
} from "./model";

export class DocParseError extends Error {
  readonly code: "invalid-file" | "resource-limit";
  constructor(code: "invalid-file" | "resource-limit", message: string) {
    super(message);
    this.code = code;
  }
}

function extractBStoreImages(
  wd: Uint8Array,
  table: Uint8Array,
  fcDggInfo: number,
  lcbDggInfo: number,
  collector: ReturnType<typeof createImageCollector>,
): number[] {
  const imageIndices: number[] = [];
  if (lcbDggInfo < 8 || fcDggInfo + lcbDggInfo > table.byteLength) return imageIndices;
  const end = fcDggInfo + lcbDggInfo;
  const tView = new DataView(table.buffer, table.byteOffset, table.byteLength);

  let pos = fcDggInfo;
  while (pos + 8 <= end) {
    const verInst = tView.getUint16(pos, true);
    const recType = tView.getUint16(pos + 2, true);
    const recLen = tView.getUint32(pos + 4, true);
    if ((verInst & 0x0f) === 0x0f) {
      pos += 8;
      continue;
    }
    if (recType === 0xf007 && pos + 8 + 36 <= end && pos + 8 + recLen <= end) {
      const foDelay = tView.getUint32(pos + 8 + 28, true);
      const inlineOffset = pos + 8 + 36;
      const decoded =
        (foDelay > 0 && foDelay < wd.byteLength ? decodeOfficeArtBlip(wd, foDelay) : undefined) ??
        decodeOfficeArtBlip(table, inlineOffset);
      if (decoded) {
        const idx = collector.add(decoded.mimeType, decoded.bytes);
        if (idx !== undefined) imageIndices.push(idx);
      }
    }
    pos += 8 + recLen;
  }
  return imageIndices;
}

function extractInlinePicture(
  dataStream: Uint8Array | undefined,
  fcPic: number,
  collector: ReturnType<typeof createImageCollector>,
): number | undefined {
  if (!dataStream || fcPic < 0 || fcPic + 68 > dataStream.byteLength) return undefined;
  const view = new DataView(dataStream.buffer, dataStream.byteOffset, dataStream.byteLength);
  const lcb = view.getUint32(fcPic, true);
  const cbHeader = view.getUint16(fcPic + 4, true);
  const end = Math.min(dataStream.byteLength, fcPic + lcb);
  let scan = fcPic + Math.max(68, cbHeader);
  while (scan + 8 <= end) {
    const recType = view.getUint16(scan + 2, true);
    const recLen = view.getUint32(scan + 4, true);
    if (recType >= 0xf01a && recType <= 0xf02a) {
      const blip = decodeOfficeArtBlip(dataStream, scan);
      if (blip) return collector.add(blip.mimeType, blip.bytes);
      break;
    }
    if ((view.getUint16(scan, true) & 0x0f) === 0x0f) scan += 8;
    else scan += 8 + recLen;
  }
  return undefined;
}

function appendRun(runs: LegacyRun[], next: LegacyRun) {
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
    prev.href === next.href
  ) {
    runs[runs.length - 1] = { ...prev, text: prev.text + next.text };
    return;
  }
  runs.push(next);
}

function parseFieldHyperlink(rawCode: string): string | undefined {
  const match = /\bHYPERLINK\s+(?:"([^"]+)"|(\S+))/i.exec(rawCode);
  return sanitizeHref(match?.[1] ?? match?.[2]);
}

function buildBlocksFromChars(
  chars: readonly { ch: string; fc: number }[],
  chpRanges: readonly FcRange<ChpStyle>[],
  papRanges: readonly FcRange<PapStyle>[],
  headingMap: ReadonlyMap<number, 1 | 2 | 3 | 4 | 5 | 6>,
  dataStream: Uint8Array | undefined,
  dggImages: readonly number[],
  collector: ReturnType<typeof createImageCollector>,
): { blocks: LegacyBlock[]; truncated: boolean } {
  const blocks: LegacyBlock[] = [];
  let truncated = false;
  let currentRuns: LegacyRun[] = [];
  let currentTableRows: LegacyRun[][][] = [];
  let currentRowCells: LegacyRun[][] = [];
  let fieldDepth = 0;
  let inFieldCode = false;
  let fieldCodeBuf = "";
  let activeHref: string | undefined;
  let dggCursor = 0;
  let paraFirstFc = chars[0]?.fc ?? 0;

  const flushTable = () => {
    if (currentTableRows.length > 0) {
      if (blocks.length < MAX_BLOCKS) blocks.push({ kind: "table", rows: currentTableRows });
      else truncated = true;
      currentTableRows = [];
    }
  };

  const flushParagraph = () => {
    flushTable();
    const pap = findInRanges(papRanges, paraFirstFc);
    const heading = pap ? headingMap.get(pap.istd) : undefined;
    if (blocks.length >= MAX_BLOCKS) {
      truncated = true;
      currentRuns = [];
      return;
    }
    if (heading) {
      blocks.push({ kind: "heading", level: heading, align: pap?.align, runs: currentRuns });
    } else if (currentRuns.length > 0) {
      const listLevel = pap?.ilfo && pap.ilfo > 0 ? (pap.ilvl ?? 0) : undefined;
      blocks.push({ kind: "paragraph", align: pap?.align, listLevel, runs: currentRuns });
    }
    currentRuns = [];
  };

  for (let i = 0; i < chars.length; i += 1) {
    const { ch, fc } = chars[i]!;
    if (currentRuns.length === 0 && currentRowCells.length === 0) paraFirstFc = fc;

    if (ch === "\x13") {
      fieldDepth += 1;
      inFieldCode = true;
      fieldCodeBuf = "";
      continue;
    }
    if (ch === "\x14") {
      if (fieldDepth === 1) activeHref = parseFieldHyperlink(fieldCodeBuf);
      inFieldCode = false;
      continue;
    }
    if (ch === "\x15") {
      if (fieldDepth > 0) fieldDepth -= 1;
      if (fieldDepth === 0) {
        inFieldCode = false;
        activeHref = undefined;
        fieldCodeBuf = "";
      }
      continue;
    }
    if (inFieldCode) {
      if (fieldDepth === 1) fieldCodeBuf += ch;
      continue;
    }

    if (ch === "\x07") {
      const pap = findInRanges(papRanges, paraFirstFc);
      if (pap?.isTtp || (currentRuns.length === 0 && currentRowCells.length > 0)) {
        if (currentRowCells.length > 0) currentTableRows.push(currentRowCells);
        currentRowCells = [];
      } else {
        currentRowCells.push(currentRuns);
      }
      currentRuns = [];
      continue;
    }

    if (ch === "\r") { flushParagraph(); continue; }
    if (ch === "\x0c") {
      flushParagraph();
      if (blocks.length < MAX_BLOCKS) blocks.push({ kind: "page-break" });
      continue;
    }
    if (ch === "\x0b") { appendRun(currentRuns, { text: "\n" }); continue; }
    if (ch === "\x01") {
      const chp = findInRanges(chpRanges, fc);
      if (chp?.fSpec && chp.fcPic !== undefined && chp.fcPic >= 0) {
        const imageIndex = extractInlinePicture(dataStream, chp.fcPic, collector);
        if (imageIndex !== undefined) appendRun(currentRuns, { text: "", imageIndex });
      }
      continue;
    }
    if (ch === "\x08") {
      if (dggCursor < dggImages.length) {
        appendRun(currentRuns, { text: "", imageIndex: dggImages[dggCursor]! });
        dggCursor += 1;
      }
      continue;
    }
    if (ch === "\t") { appendRun(currentRuns, { text: "\t" }); continue; }
    if (ch.charCodeAt(0) < 0x20) continue;

    const chp = findInRanges(chpRanges, fc);
    appendRun(currentRuns, {
      text: ch,
      bold: chp?.bold,
      italic: chp?.italic,
      underline: chp?.underline,
      strike: chp?.strike,
      superscript: chp?.superscript,
      subscript: chp?.subscript,
      fontSizePt: chp?.fontSizePt,
      color: chp?.color,
      href: activeHref,
    });
  }

  flushParagraph();
  flushTable();
  return { blocks, truncated };
}

function parseWord6Document(wd: Uint8Array, archive: CfbfArchive): LegacyDocument {
  const view = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  const fcMin = view.getUint32(0x18, true);
  const fcMac = view.getUint32(0x1c, true);
  if (fcMin >= fcMac || fcMac > wd.byteLength) {
    throw new DocParseError("invalid-file", "Legacy Word 6/95 document has invalid text bounds.");
  }
  const sliceLen = Math.min(fcMac - fcMin, MAX_TEXT_CHARS);
  const raw = decodeWithCodePage(wd.subarray(fcMin, fcMin + sliceLen), 1252);
  const blocks: LegacyBlock[] = [];
  for (const para of raw.split("\r")) {
    const cleaned = para.replace(/[\x00-\x08\x0b-\x1f]/g, "").trimEnd();
    if (cleaned.length > 0 && blocks.length < MAX_BLOCKS) {
      blocks.push({ kind: "paragraph", runs: [{ text: cleaned }] });
    }
  }
  return {
    kind: "document",
    format: "doc",
    metadata: archive.readMetadata(),
    blocks,
    footnotes: [],
    images: [],
    truncated: fcMac - fcMin > MAX_TEXT_CHARS,
  };
}

export function parseDoc(archive: CfbfArchive): LegacyDocument {
  const wd = archive.getStream("WordDocument");
  if (!wd || wd.byteLength < 64) {
    throw new DocParseError("invalid-file", "CFBF file does not contain a valid WordDocument stream.");
  }
  const view = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  const wIdent = view.getUint16(0, true);
  const nFib = view.getUint16(2, true);
  const flags = view.getUint16(10, true);

  if (wIdent !== 0xa5ec && wIdent !== 0xa5dc) {
    throw new DocParseError("invalid-file", "Invalid WordDocument FIB signature.");
  }
  if ((flags & 0x0100) !== 0) {
    throw new DocParseError("invalid-file", "Password-protected or encrypted Word documents are not supported.");
  }
  if (nFib < 0x00c0) {
    return parseWord6Document(wd, archive);
  }

  const tableName = (flags & 0x0200) !== 0 ? "1Table" : "0Table";
  const table = archive.getStream(tableName);
  if (!table) {
    throw new DocParseError("invalid-file", `Missing ${tableName} stream in Word document.`);
  }

  const csw = view.getUint16(32, true);
  const cslwOff = 34 + csw * 2;
  if (cslwOff + 2 > wd.byteLength) throw new DocParseError("invalid-file", "Truncated Word FIB sections.");
  const cslw = view.getUint16(cslwOff, true);
  const cbFcLcbOff = cslwOff + 2 + cslw * 4;
  if (cbFcLcbOff + 2 > wd.byteLength || cslw < 4) {
    throw new DocParseError("invalid-file", "Truncated Word FIB longword table.");
  }

  const ccpText = view.getInt32(cslwOff + 2 + 3 * 4, true);
  const ccpFtn = cslw > 4 ? view.getInt32(cslwOff + 2 + 4 * 4, true) : 0;
  const cbFcLcb = view.getUint16(cbFcLcbOff, true);
  const getFcLcb = (index: number): [number, number] => {
    const off = cbFcLcbOff + 2 + index * 8;
    if (index >= cbFcLcb || off + 8 > wd.byteLength) return [0, 0];
    return [view.getUint32(off, true), view.getUint32(off + 4, true)];
  };

  const [fcClx, lcbClx] = getFcLcb(33);
  const [fcStshf, lcbStshf] = getFcLcb(1);
  const [fcChpx, lcbChpx] = getFcLcb(12);
  const [fcPapx, lcbPapx] = getFcLcb(13);
  const [fcDggInfo, lcbDggInfo] = getFcLcb(50);

  let pieces;
  try {
    pieces = parsePieceTable(table, fcClx, lcbClx);
  } catch (error) {
    throw new DocParseError("invalid-file", (error as Error).message);
  }
  const chpRanges = parseChpxBinTable(wd, table, fcChpx, lcbChpx);
  const papRanges = parsePapxBinTable(wd, table, fcPapx, lcbPapx);
  const headingMap = parseHeadingStyleMap(table, fcStshf, lcbStshf);
  const collector = createImageCollector();
  const dggImages = extractBStoreImages(wd, table, fcDggInfo, lcbDggInfo, collector);
  const dataStream = archive.getStream("Data");

  const mainChars: { ch: string; fc: number }[] = [];
  const ftnChars: { ch: string; fc: number }[] = [];
  const mainEnd = Math.max(0, ccpText);
  const ftnEnd = mainEnd + Math.max(0, ccpFtn);
  let totalRead = 0;
  let textTruncated = false;

  for (const piece of pieces) {
    if (piece.cpStart >= ftnEnd) break;
    const count = piece.cpEnd - piece.cpStart;
    if (totalRead + count > MAX_TEXT_CHARS) {
      textTruncated = true;
      break;
    }
    const byteLen = piece.compressed ? count : count * 2;
    if (piece.fcStart + byteLen > wd.byteLength) continue;
    const slice = wd.subarray(piece.fcStart, piece.fcStart + byteLen);
    const decoded = piece.compressed ? decodeWithCodePage(slice, 1252) : decodeUtf16Le(slice);
    const step = piece.compressed ? 1 : 2;
    for (let i = 0; i < decoded.length; i += 1) {
      const cp = piece.cpStart + i;
      const item = { ch: decoded[i]!, fc: piece.fcStart + i * step };
      if (cp < mainEnd) mainChars.push(item);
      else if (cp < ftnEnd) ftnChars.push(item);
    }
    totalRead += decoded.length;
  }

  const mainResult = buildBlocksFromChars(
    mainChars,
    chpRanges,
    papRanges,
    headingMap,
    dataStream,
    dggImages,
    collector,
  );
  const ftnResult =
    ftnChars.length > 0
      ? buildBlocksFromChars(ftnChars, chpRanges, papRanges, headingMap, dataStream, [], collector)
      : { blocks: [], truncated: false };

  return {
    kind: "document",
    format: "doc",
    metadata: archive.readMetadata(),
    blocks: mainResult.blocks,
    footnotes: ftnResult.blocks,
    images: collector.images,
    truncated: textTruncated || mainResult.truncated || ftnResult.truncated,
  };
}
