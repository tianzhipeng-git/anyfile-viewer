import type { CfbfArchive } from "./cfbf";
import { decodeUtf16Le, decodeWithCodePage } from "./cp1252";
import { createImageCollector, decodeOfficeArtBlip } from "./images";
import {
  MAX_SLIDES,
  MAX_TEXT_CHARS,
  sanitizeHref,
  type LegacyBlock,
  type LegacyPresentation,
  type LegacySlide,
  type LegacySlideShape,
} from "./model";
import {
  buildTextBlocks,
  MAX_DEPTH,
  readRecords,
  rgbFromColorRef,
  type LinkSpan,
  type PptRecord,
  type TextBox,
} from "./ppt-records";

export class PptParseError extends Error {
  readonly code: "invalid-file" | "resource-limit";
  constructor(code: "invalid-file" | "resource-limit", message: string) {
    super(message);
    this.code = code;
  }
}

function parseExHyperlinks(buf: Uint8Array, docRec: PptRecord, state: { count: number }): Map<number, string> {
  const map = new Map<number, string>();
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (const child of readRecords(buf, docRec.start, docRec.end, state)) {
    if (child.type !== 1033) continue;
    for (const item of readRecords(buf, child.start, child.end, state)) {
      if (item.type !== 4055) continue;
      let id: number | undefined;
      let target: string | undefined;
      let fallback: string | undefined;
      for (const sub of readRecords(buf, item.start, item.end, state)) {
        if (sub.type === 4051 && sub.end - sub.start >= 4) {
          id = view.getUint32(sub.start, true);
        } else if (sub.type === 4026) {
          const s = decodeUtf16Le(buf.subarray(sub.start, sub.end)).replace(/\0+$/, "");
          if (sub.inst === 1) target = s;
          else if (!fallback) fallback = s;
        }
      }
      const safe = sanitizeHref(target ?? fallback);
      if (id !== undefined && safe) map.set(id, safe);
    }
  }
  return map;
}

function parseBStoreBlips(
  buf: Uint8Array,
  docRec: PptRecord,
  pictures: Uint8Array | undefined,
  collector: ReturnType<typeof createImageCollector>,
  state: { count: number },
): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const scan = (start: number, end: number, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const rec of readRecords(buf, start, end, state)) {
      if (rec.type === 0xf007 && rec.ver !== 0x0f && rec.start + 36 <= rec.end) {
        const foDelay = view.getUint32(rec.start + 28, true);
        const blip =
          (pictures && foDelay < pictures.byteLength ? decodeOfficeArtBlip(pictures, foDelay) : undefined) ??
          decodeOfficeArtBlip(buf, rec.start + 36);
        result.push(blip ? collector.add(blip.mimeType, blip.bytes) : undefined);
      } else if (rec.ver === 0x0f) {
        scan(rec.start, rec.end, depth + 1);
      }
    }
  };
  for (const child of readRecords(buf, docRec.start, docRec.end, state)) {
    if (child.type === 1035) scan(child.start, child.end, 0);
  }
  return result;
}

function parseTextBoxesFromStream(
  buf: Uint8Array,
  records: readonly PptRecord[],
  hyperlinks: ReadonlyMap<number, string>,
  state: { count: number },
): TextBox[] {
  const boxes: TextBox[] = [];
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let textType = 1;
  let pendingText: string | undefined;
  let pendingStyle: PptRecord | undefined;
  let pendingLinks: LinkSpan[] = [];
  let pendingHref: string | undefined;

  const flush = () => {
    if (pendingText !== undefined) {
      boxes.push({ textType, text: pendingText, styleAtom: pendingStyle, links: pendingLinks });
      pendingText = undefined;
      pendingStyle = undefined;
      pendingLinks = [];
      pendingHref = undefined;
    }
  };

  for (const rec of records) {
    if (rec.type === 3999 && rec.end - rec.start >= 4) {
      flush();
      textType = view.getUint32(rec.start, true);
    } else if (rec.type === 4000) {
      if (pendingText !== undefined) flush();
      pendingText = decodeUtf16Le(buf.subarray(rec.start, rec.end));
    } else if (rec.type === 4008) {
      if (pendingText !== undefined) flush();
      pendingText = decodeWithCodePage(buf.subarray(rec.start, rec.end), 1252);
    } else if (rec.type === 4001) {
      pendingStyle = rec;
    } else if (rec.type === 4082) {
      pendingHref = undefined;
      for (const sub of readRecords(buf, rec.start, rec.end, state)) {
        if (sub.type === 4083 && sub.end - sub.start >= 16) {
          const exHyperlinkId = view.getUint32(sub.start + 4, true);
          pendingHref = hyperlinks.get(exHyperlinkId);
        }
      }
    } else if (rec.type === 4063 && rec.end - rec.start >= 8 && pendingHref) {
      const begin = view.getUint32(rec.start, true);
      const end = view.getUint32(rec.start + 4, true);
      if (end > begin) pendingLinks.push({ begin, end, href: pendingHref });
      pendingHref = undefined;
    }
  }
  flush();
  return boxes;
}

function parseSlideShapes(
  buf: Uint8Array,
  slideRec: PptRecord,
  outlineBoxes: readonly TextBox[],
  bStoreImages: readonly (number | undefined)[],
  hyperlinks: ReadonlyMap<number, string>,
  state: { count: number },
): { shapes: LegacySlideShape[]; usedOutlineIndices: Set<number>; backgroundColor?: string } {
  const shapes: LegacySlideShape[] = [];
  const usedOutlineIndices = new Set<number>();
  let backgroundColor: string | undefined;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const parseOptProps = (optRec: PptRecord) => {
    const numProps = optRec.inst;
    let fillColor: string | undefined;
    let borderColor: string | undefined;
    let pib: number | undefined;
    let noFill = false;
    let noLine = false;
    let pos = optRec.start;
    for (let i = 0; i < numProps && pos + 6 <= optRec.end; i += 1) {
      const propId = view.getUint16(pos, true) & 0x3fff;
      const val = view.getUint32(pos + 2, true);
      pos += 6;
      if (propId === 0x0181) fillColor = rgbFromColorRef(val);
      else if (propId === 0x01bf) noFill = (val & 0x10) === 0;
      else if (propId === 0x01c0) borderColor = rgbFromColorRef(val);
      else if (propId === 0x01ff) noLine = (val & 0x08) === 0;
      else if (propId === 0x0104) pib = val;
    }
    return {
      fillColor: noFill ? undefined : fillColor,
      borderColor: noLine ? undefined : borderColor,
      pib,
    };
  };

  const visitSpContainer = (spRec: PptRecord, isBackgroundCandidate: boolean) => {
    const children = readRecords(buf, spRec.start, spRec.end, state);
    let hasBounds = false;
    let x = 0;
    let y = 0;
    let w = 0;
    let h = 0;
    let fillColor: string | undefined;
    let borderColor: string | undefined;
    let imageIndex: number | undefined;
    let isPlaceholderStar = false;
    const paragraphs: LegacyBlock[] = [];

    for (const child of children) {
      if (child.type === 0xf00b) {
        const props = parseOptProps(child);
        fillColor = props.fillColor;
        borderColor = props.borderColor;
        if (props.pib !== undefined && props.pib >= 1 && props.pib <= bStoreImages.length) {
          imageIndex = bStoreImages[props.pib - 1];
        }
      } else if (child.type === 0xf010 || child.type === 0xf00f) {
        if (child.end - child.start === 8) {
          const top = view.getInt16(child.start, true);
          const left = view.getInt16(child.start + 2, true);
          const right = view.getInt16(child.start + 4, true);
          const bottom = view.getInt16(child.start + 6, true);
          x = left;
          y = top;
          w = Math.max(0, right - left);
          h = Math.max(0, bottom - top);
          hasBounds = w > 0 && h > 0;
        } else if (child.end - child.start >= 16) {
          const left = view.getInt32(child.start, true);
          const top = view.getInt32(child.start + 4, true);
          const right = view.getInt32(child.start + 8, true);
          const bottom = view.getInt32(child.start + 12, true);
          x = left;
          y = top;
          w = Math.max(0, right - left);
          h = Math.max(0, bottom - top);
          hasBounds = w > 0 && h > 0;
        }
      } else if (child.type === 0xf00d) {
        const sub = readRecords(buf, child.start, child.end, state);
        const refAtom = sub.find((r) => r.type === 3998 && r.end - r.start >= 4);
        if (refAtom) {
          const idx = view.getInt32(refAtom.start, true);
          if (idx >= 0 && idx < outlineBoxes.length) {
            usedOutlineIndices.add(idx);
            const box = outlineBoxes[idx]!;
            paragraphs.push(...buildTextBlocks(buf, box, box.textType === 0 || box.textType === 6));
          }
        } else {
          for (const box of parseTextBoxesFromStream(buf, sub, hyperlinks, state)) {
            if (box.text.trim() === "*" && box.textType === 4) {
              isPlaceholderStar = true;
            } else {
              paragraphs.push(...buildTextBlocks(buf, box, box.textType === 0 || box.textType === 6));
            }
          }
        }
      }
    }

    if (isBackgroundCandidate && !hasBounds && fillColor && paragraphs.length === 0 && imageIndex === undefined) {
      backgroundColor = fillColor;
      return;
    }
    if (isPlaceholderStar && paragraphs.length === 0) return;
    if (paragraphs.length > 0 || imageIndex !== undefined) {
      shapes.push({ x, y, w, h, hasBounds, paragraphs, imageIndex, fillColor, borderColor });
    }
  };

  const walkDrawing = (start: number, end: number, depth: number, insideGroup: boolean) => {
    if (depth > MAX_DEPTH) return;
    for (const rec of readRecords(buf, start, end, state)) {
      if (rec.type === 0xf004) visitSpContainer(rec, !insideGroup);
      else if (rec.type === 0xf003) walkDrawing(rec.start, rec.end, depth + 1, true);
      else if (rec.ver === 0x0f) walkDrawing(rec.start, rec.end, depth + 1, insideGroup);
    }
  };

  for (const child of readRecords(buf, slideRec.start, slideRec.end, state)) {
    if (child.type === 1036) walkDrawing(child.start, child.end, 0, false);
  }
  return { shapes, usedOutlineIndices, backgroundColor };
}

export function parsePpt(archive: CfbfArchive): LegacyPresentation {
  const currentUser = archive.getStream("Current User");
  if (currentUser && currentUser.byteLength >= 24) {
    const cuView = new DataView(currentUser.buffer, currentUser.byteOffset, currentUser.byteLength);
    if (cuView.getUint32(12, true) === 0xf3d1c4df) {
      throw new PptParseError("invalid-file", "Password-protected or encrypted PowerPoint files are not supported.");
    }
  }
  if (archive.hasStream("EncryptedSummary")) {
    throw new PptParseError("invalid-file", "Password-protected or encrypted PowerPoint files are not supported.");
  }

  const pp = archive.getStream("PowerPoint Document");
  if (!pp || pp.byteLength < 16) {
    throw new PptParseError("invalid-file", "CFBF file does not contain a valid PowerPoint Document stream.");
  }

  const state = { count: 0 };
  const topRecords = readRecords(pp, 0, pp.byteLength, state);
  const docRec = topRecords.find((r) => r.type === 1000);
  if (!docRec) {
    throw new PptParseError("invalid-file", "PowerPoint Document stream is missing the Document container.");
  }

  const view = new DataView(pp.buffer, pp.byteOffset, pp.byteLength);
  let slideWidth = 5760;
  let slideHeight = 4320;
  const docChildren = readRecords(pp, docRec.start, docRec.end, state);
  const docAtom = docChildren.find((r) => r.type === 1001 && r.end - r.start >= 8);
  if (docAtom) {
    const w = view.getInt32(docAtom.start, true);
    const h = view.getInt32(docAtom.start + 4, true);
    if (w > 100 && w < 100_000 && h > 100 && h < 100_000) {
      slideWidth = w;
      slideHeight = h;
    }
  }

  const hyperlinks = parseExHyperlinks(pp, docRec, state);
  const collector = createImageCollector();
  const bStoreImages = parseBStoreBlips(pp, docRec, archive.getStream("Pictures"), collector, state);

  const persistMap = new Map<number, number>();
  for (const rec of topRecords) {
    if (rec.type !== 6002) continue;
    let pos = rec.start;
    while (pos + 4 <= rec.end) {
      const header = view.getUint32(pos, true);
      pos += 4;
      const startId = header & 0x000fffff;
      const count = header >>> 20;
      for (let i = 0; i < count && pos + 4 <= rec.end; i += 1) {
        persistMap.set(startId + i, view.getUint32(pos, true));
        pos += 4;
      }
    }
  }

  const slideOutlineEntries: Array<{ persistIdRef: number; slideId: number; boxes: TextBox[] }> = [];
  for (const child of docChildren) {
    if (child.type !== 4080 || child.inst !== 0) continue;
    let currentItems: PptRecord[] = [];
    let currentRef: number | undefined;
    let currentSlideId = 0;
    for (const item of readRecords(pp, child.start, child.end, state)) {
      if (item.type === 1011 && item.end - item.start >= 4) {
        if (currentRef !== undefined) {
          slideOutlineEntries.push({
            persistIdRef: currentRef,
            slideId: currentSlideId,
            boxes: parseTextBoxesFromStream(pp, currentItems, hyperlinks, state),
          });
        }
        currentRef = view.getUint32(item.start, true);
        currentSlideId = item.end - item.start >= 16 ? view.getUint32(item.start + 12, true) : 0;
        currentItems = [];
      } else if (currentRef !== undefined) {
        currentItems.push(item);
      }
    }
    if (currentRef !== undefined) {
      slideOutlineEntries.push({
        persistIdRef: currentRef,
        slideId: currentSlideId,
        boxes: parseTextBoxesFromStream(pp, currentItems, hyperlinks, state),
      });
    }
  }

  const recordByOffset = new Map<number, PptRecord>();
  for (const rec of topRecords) recordByOffset.set(rec.offset, rec);

  const notesBySlideId = new Map<number, PptRecord>();
  for (const nr of topRecords) {
    if (nr.type !== 1008) continue;
    const nAtom = readRecords(pp, nr.start, nr.end, state).find((r) => r.type === 1009 && r.end - r.start >= 4);
    if (nAtom) notesBySlideId.set(view.getUint32(nAtom.start, true), nr);
  }

  const slideRefs: Array<{ rec?: PptRecord; slideId?: number; boxes: TextBox[] }> =
    slideOutlineEntries.length > 0
      ? slideOutlineEntries.map((entry) => ({
          rec: persistMap.has(entry.persistIdRef) ? recordByOffset.get(persistMap.get(entry.persistIdRef)!) : undefined,
          slideId: entry.slideId,
          boxes: entry.boxes,
        }))
      : topRecords.filter((rec) => rec.type === 1006).map((rec) => ({ rec, boxes: [] }));

  const slides: LegacySlide[] = [];
  let totalChars = 0;
  let truncated = false;

  for (let i = 0; i < slideRefs.length; i += 1) {
    if (slides.length >= MAX_SLIDES || totalChars >= MAX_TEXT_CHARS) {
      truncated = true;
      break;
    }
    const ref = slideRefs[i]!;
    const parsedShapes = ref.rec
      ? parseSlideShapes(pp, ref.rec, ref.boxes, bStoreImages, hyperlinks, state)
      : { shapes: [], usedOutlineIndices: new Set<number>(), backgroundColor: undefined };

    const fallbackParagraphs: LegacyBlock[] = [];
    ref.boxes.forEach((box, idx) => {
      if (!parsedShapes.usedOutlineIndices.has(idx)) {
        fallbackParagraphs.push(...buildTextBlocks(pp, box, box.textType === 0 || box.textType === 6));
      }
    });

    let title: string | undefined;
    for (const block of [...parsedShapes.shapes.flatMap((s) => s.paragraphs), ...fallbackParagraphs]) {
      if (block.kind === "heading" || block.kind === "paragraph") {
        const text = block.runs.map((r) => r.text).join("").trim();
        if (text) {
          title = text.slice(0, 80);
          break;
        }
      }
    }

    const notes: LegacyBlock[] = [];
    let notesRec: PptRecord | undefined;
    if (ref.rec) {
      const sAtom = readRecords(pp, ref.rec.start, ref.rec.end, state).find((r) => r.type === 1007 && r.end - r.start >= 20);
      const notesPersistId = sAtom ? view.getUint32(sAtom.start + 16, true) : 0;
      if (notesPersistId > 0 && persistMap.has(notesPersistId)) {
        notesRec = recordByOffset.get(persistMap.get(notesPersistId)!);
      }
    }
    if (!notesRec && ref.slideId !== undefined) notesRec = notesBySlideId.get(ref.slideId);
    if (notesRec) {
      const noteShapes = parseSlideShapes(pp, notesRec, [], bStoreImages, hyperlinks, state);
      for (const s of noteShapes.shapes) notes.push(...s.paragraphs);
    }

    for (const s of parsedShapes.shapes) {
      for (const p of s.paragraphs) {
        if ("runs" in p) totalChars += p.runs.reduce((acc, r) => acc + r.text.length, 0);
      }
    }

    slides.push({
      index: i + 1,
      title,
      shapes: parsedShapes.shapes,
      fallbackParagraphs,
      notes,
      backgroundColor: parsedShapes.backgroundColor,
    });
  }

  return {
    kind: "presentation",
    format: "ppt",
    metadata: archive.readMetadata(),
    slideWidth,
    slideHeight,
    slides,
    images: collector.images,
    truncated,
  };
}
