import { codePageFromCharset, decodeWithCodePage } from "./cp1252";
import { createImageCollector, wrapDibAsBmp } from "./images";
import {
  MAX_BLOCKS,
  MAX_TEXT_CHARS,
  sanitizeHref,
  type LegacyBlock,
  type LegacyDocument,
  type LegacyMetadata,
  type LegacyRun,
} from "./model";
import { appendRtfRun, parseHexBytes, SKIP_DESTINATIONS, type RtfState } from "./rtf-types";

export class RtfParseError extends Error {
  readonly code: "invalid-file" | "resource-limit";
  constructor(code: "invalid-file" | "resource-limit", message: string) {
    super(message);
    this.code = code;
  }
}

export function parseRtf(rawBytes: Uint8Array): LegacyDocument {
  let start = 0;
  if (rawBytes.byteLength >= 3 && rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf) {
    start = 3;
  }
  while (
    start < rawBytes.byteLength &&
    (rawBytes[start] === 0x20 || rawBytes[start] === 0x09 || rawBytes[start] === 0x0a || rawBytes[start] === 0x0d)
  ) {
    start += 1;
  }
  if (
    rawBytes.byteLength - start < 6 ||
    rawBytes[start] !== 0x7b ||
    rawBytes[start + 1] !== 0x5c ||
    rawBytes[start + 2] !== 0x72 ||
    rawBytes[start + 3] !== 0x74 ||
    rawBytes[start + 4] !== 0x66
  ) {
    throw new RtfParseError("invalid-file", "File does not begin with a valid RTF header.");
  }

  let docCodePage = 1252;
  const fontCodePages = new Map<number, number>();
  const colorTable: (string | undefined)[] = [undefined];
  const headingStyles = new Map<number, 1 | 2 | 3 | 4 | 5 | 6>();
  const metadata: Record<string, string> = {};
  const collector = createImageCollector();

  const blocks: LegacyBlock[] = [];
  const footnotes: LegacyBlock[] = [];
  let truncated = false;
  let totalChars = 0;

  let currentRuns: LegacyRun[] = [];
  let ftnRuns: LegacyRun[] = [];
  let tableRows: LegacyRun[][][] = [];
  let rowCells: LegacyRun[][] = [];

  let colorR: number | undefined;
  let colorG: number | undefined;
  let colorB: number | undefined;
  let styleNameBuf = "";
  let infoBuf = "";
  let fieldInstBuf = "";
  let pictHexBuf = "";
  let hexBuffer: number[] = [];

  const stack: RtfState[] = [];
  let state: RtfState = {
    mode: "body",
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    superscript: false,
    subscript: false,
    colorIdx: 0,
    bgColorIdx: 0,
    uc: 1,
    inTable: false,
  };

  const flushHexBuffer = () => {
    if (hexBuffer.length === 0) return;
    const cp = (state.fontId !== undefined ? fontCodePages.get(state.fontId) : undefined) ?? docCodePage;
    const text = decodeWithCodePage(new Uint8Array(hexBuffer), cp);
    hexBuffer = [];
    pushText(text);
  };

  const pushText = (text: string) => {
    if (!text || state.mode === "skip" || state.mode === "fonttbl" || state.mode === "listtext") return;
    if (state.mode === "colortbl") {
      for (const ch of text) {
        if (ch === ";") {
          colorTable.push(
            colorR !== undefined && colorG !== undefined && colorB !== undefined
              ? `#${colorR.toString(16).padStart(2, "0")}${colorG.toString(16).padStart(2, "0")}${colorB.toString(16).padStart(2, "0")}`
              : undefined,
          );
          colorR = undefined;
          colorG = undefined;
          colorB = undefined;
        }
      }
      return;
    }
    if (state.mode === "stylesheet") {
      styleNameBuf += text;
      if (styleNameBuf.includes(";")) {
        const cleaned = styleNameBuf.replace(/;/g, "").trim();
        const match = /^(?:heading|标题)\s*([1-6])$/i.exec(cleaned);
        if (match && state.styleEntryId !== undefined) {
          headingStyles.set(state.styleEntryId, Number(match[1]) as 1 | 2 | 3 | 4 | 5 | 6);
        }
        styleNameBuf = "";
      }
      return;
    }
    if (state.mode === "info-field") {
      if (infoBuf.length < 512) infoBuf += text;
      return;
    }
    if (state.mode === "field-inst") {
      if (fieldInstBuf.length < 2048) fieldInstBuf += text;
      return;
    }
    if (state.mode === "pict") {
      if (pictHexBuf.length < 32_000_000) pictHexBuf += text;
      return;
    }
    if (totalChars >= MAX_TEXT_CHARS) {
      truncated = true;
      return;
    }
    totalChars += text.length;
    appendRtfRun(state.mode === "footnote" ? ftnRuns : currentRuns, {
      text,
      bold: state.bold || undefined,
      italic: state.italic || undefined,
      underline: state.underline || undefined,
      strike: state.strike || undefined,
      superscript: state.superscript || undefined,
      subscript: state.subscript || undefined,
      fontSizePt: state.fontSizePt,
      color: state.colorIdx > 0 ? colorTable[state.colorIdx] : undefined,
      backgroundColor: state.bgColorIdx > 0 ? colorTable[state.bgColorIdx] : undefined,
      href: state.href,
    });
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      if (blocks.length < MAX_BLOCKS) blocks.push({ kind: "table", rows: tableRows });
      else truncated = true;
      tableRows = [];
    }
  };

  const flushParagraph = (isFootnote = false) => {
    flushHexBuffer();
    if (isFootnote) {
      if (ftnRuns.length > 0 && footnotes.length < MAX_BLOCKS) footnotes.push({ kind: "paragraph", runs: ftnRuns });
      ftnRuns = [];
      return;
    }
    if (state.inTable) {
      if (currentRuns.length > 0) appendRtfRun(currentRuns, { text: "\n" });
      return;
    }
    flushTable();
    if (currentRuns.length === 0) return;
    if (blocks.length >= MAX_BLOCKS) {
      truncated = true;
      currentRuns = [];
      return;
    }
    if (state.headingLevel) {
      blocks.push({ kind: "heading", level: state.headingLevel, align: state.align, runs: currentRuns });
    } else {
      blocks.push({ kind: "paragraph", align: state.align, listLevel: state.listLevel, runs: currentRuns });
    }
    currentRuns = [];
  };

  let pos = start;
  let skipFallback = 0;
  let ignorableNext = false;

  const applyControl = (word: string, param: number | undefined, hasParam: boolean) => {
    if (word !== "'") flushHexBuffer();

    if (ignorableNext) {
      ignorableNext = false;
      if (word === "fldinst") { state.mode = "field-inst"; fieldInstBuf = ""; return; }
      if (word === "listtext") { state.mode = "listtext"; return; }
      if (word !== "fonttbl" && word !== "colortbl" && word !== "stylesheet" && word !== "info") {
        state.mode = "skip";
        return;
      }
    }

    if (word === "fonttbl") { state.mode = "fonttbl"; return; }
    if (word === "colortbl") { state.mode = "colortbl"; return; }
    if (word === "stylesheet") { state.mode = "stylesheet"; styleNameBuf = ""; return; }
    if (word === "info") { state.mode = "info"; return; }
    if (word === "footnote") { state.mode = "footnote"; return; }
    if (word === "pict") { state.mode = "pict"; pictHexBuf = ""; state.pictType = undefined; return; }
    if (word === "fldinst") { state.mode = "field-inst"; fieldInstBuf = ""; return; }
    if (word === "fldrslt") {
      const match = /\bHYPERLINK\s+(?:"([^"]+)"|(\S+))/i.exec(fieldInstBuf);
      const safe = sanitizeHref(match?.[1] ?? match?.[2]);
      if (safe) state.href = safe;
      fieldInstBuf = "";
      return;
    }
    if (SKIP_DESTINATIONS.has(word)) { state.mode = "skip"; return; }

    if (state.mode === "info" && ["title", "author", "subject", "company", "keywords"].includes(word)) {
      state.mode = "info-field";
      state.infoKey = word as keyof LegacyMetadata;
      infoBuf = "";
      return;
    }
    if (state.mode === "colortbl") {
      if (word === "red") colorR = param ?? 0;
      else if (word === "green") colorG = param ?? 0;
      else if (word === "blue") colorB = param ?? 0;
      return;
    }
    if (state.mode === "fonttbl") {
      if (word === "f" && hasParam) state.fontEntryId = param;
      else if (word === "fcharset" && hasParam && state.fontEntryId !== undefined) {
        const cp = codePageFromCharset(param!);
        if (cp !== undefined) fontCodePages.set(state.fontEntryId, cp);
      }
      return;
    }
    if (state.mode === "stylesheet") {
      if (word === "s" && hasParam) { state.styleEntryId = param; styleNameBuf = ""; }
      return;
    }
    if (state.mode === "pict") {
      if (word === "pngblip") state.pictType = "png";
      else if (word === "jpegblip") state.pictType = "jpeg";
      else if (word === "dibitmap") state.pictType = "dib";
      return;
    }
    if (state.mode === "skip") return;

    if (word === "ansicpg" && hasParam && param! > 0) { docCodePage = param!; return; }
    if (word === "uc" && hasParam) { state.uc = Math.max(0, param!); return; }
    if (word === "u" && hasParam) {
      let code = param!;
      if (code < 0) code += 65536;
      pushText(String.fromCharCode(code));
      skipFallback = state.uc;
      return;
    }

    if (word === "par") { flushParagraph(state.mode === "footnote"); return; }
    if (word === "line") { pushText("\n"); return; }
    if (word === "tab") { pushText("\t"); return; }
    if (word === "page") {
      flushParagraph();
      if (blocks.length < MAX_BLOCKS) blocks.push({ kind: "page-break" });
      return;
    }
    if (word === "emdash") { pushText("\u2014"); return; }
    if (word === "endash") { pushText("\u2013"); return; }
    if (word === "lquote") { pushText("\u2018"); return; }
    if (word === "rquote") { pushText("\u2019"); return; }
    if (word === "ldblquote") { pushText("\u201c"); return; }
    if (word === "rdblquote") { pushText("\u201d"); return; }
    if (word === "bullet") { pushText("\u2022"); return; }
    if (word === "~") { pushText("\u00a0"); return; }
    if (word === "_") { pushText("-"); return; }

    if (word === "trowd") { state.inTable = true; rowCells = []; return; }
    if (word === "intbl") { state.inTable = true; return; }
    if (word === "cell") { rowCells.push(currentRuns); currentRuns = []; return; }
    if (word === "row") {
      if (currentRuns.length > 0) { rowCells.push(currentRuns); currentRuns = []; }
      if (rowCells.length > 0) tableRows.push(rowCells);
      rowCells = [];
      state.inTable = false;
      return;
    }

    if (word === "pard") {
      state.align = undefined;
      state.inTable = false;
      state.headingLevel = undefined;
      state.listLevel = undefined;
      return;
    }
    if (word === "ql") { state.align = "left"; return; }
    if (word === "qc") { state.align = "center"; return; }
    if (word === "qr") { state.align = "right"; return; }
    if (word === "qj") { state.align = "justify"; return; }
    if (word === "s" && hasParam) { state.headingLevel = headingStyles.get(param!); return; }
    if (word === "ls" && hasParam && param! > 0) { state.listLevel = state.listLevel ?? 0; return; }
    if (word === "ilvl" && hasParam) { state.listLevel = Math.max(0, Math.min(4, param!)); return; }

    if (word === "plain") {
      state.bold = false;
      state.italic = false;
      state.underline = false;
      state.strike = false;
      state.superscript = false;
      state.subscript = false;
      state.fontSizePt = undefined;
      state.colorIdx = 0;
      state.bgColorIdx = 0;
      return;
    }
    if (word === "b") { state.bold = !hasParam || param !== 0; return; }
    if (word === "i") { state.italic = !hasParam || param !== 0; return; }
    if (word === "ul" || word === "uld" || word === "uldb" || word === "ulw") {
      state.underline = !hasParam || param !== 0;
      return;
    }
    if (word === "ulnone" || word === "ul0") { state.underline = false; return; }
    if (word === "strike" || word === "striked") { state.strike = !hasParam || param !== 0; return; }
    if (word === "super") { state.superscript = true; state.subscript = false; return; }
    if (word === "sub") { state.subscript = true; state.superscript = false; return; }
    if (word === "nosupersub") { state.superscript = false; state.subscript = false; return; }
    if (word === "fs" && hasParam && param! > 0 && param! <= 2000) { state.fontSizePt = param! / 2; return; }
    if (word === "f" && hasParam) { state.fontId = param; return; }
    if (word === "cf" && hasParam) { state.colorIdx = param!; return; }
    if ((word === "highlight" || word === "cb") && hasParam) { state.bgColorIdx = param!; }
  };

  while (pos < rawBytes.byteLength) {
    const ch = rawBytes[pos]!;
    pos += 1;

    if (ch === 0x7b) {
      flushHexBuffer();
      if (stack.length >= 128) throw new RtfParseError("resource-limit", "RTF group nesting limit exceeded.");
      stack.push(state);
      state = { ...state };
      ignorableNext = false;
      continue;
    }

    if (ch === 0x7d) {
      flushHexBuffer();
      ignorableNext = false;
      if (state.mode === "info-field" && state.infoKey) {
        const val = infoBuf.trim();
        if (val && !metadata[state.infoKey]) metadata[state.infoKey] = val;
      } else if (state.mode === "pict" && state.pictType && pictHexBuf.length > 0) {
        const parsedBytes = parseHexBytes(pictHexBuf);
        const mime = state.pictType === "png" ? "image/png" : state.pictType === "jpeg" ? "image/jpeg" : "image/bmp";
        const finalBytes = state.pictType === "dib" ? wrapDibAsBmp(parsedBytes) : parsedBytes;
        if (finalBytes) {
          const idx = collector.add(mime, finalBytes);
          if (idx !== undefined) appendRtfRun(currentRuns, { text: "", imageIndex: idx });
        }
        pictHexBuf = "";
      } else if (state.mode === "footnote") {
        flushParagraph(true);
      }

      const prev = stack.pop();
      if (!prev) break;
      state = prev;
      if (stack.length === 0) break;
      continue;
    }

    if (ch === 0x0d || ch === 0x0a) continue;

    if (ch === 0x5c) {
      if (pos >= rawBytes.byteLength) break;
      const next = rawBytes[pos]!;
      if (next === 0x2a) { pos += 1; ignorableNext = true; continue; }
      if (next === 0x27) {
        pos += 1;
        if (pos + 2 <= rawBytes.byteLength) {
          const byteVal = parseInt(String.fromCharCode(rawBytes[pos]!, rawBytes[pos + 1]!), 16);
          pos += 2;
          if (!Number.isNaN(byteVal)) {
            if (skipFallback > 0) skipFallback -= 1;
            else hexBuffer.push(byteVal);
          }
        }
        continue;
      }
      if (next === 0x0d || next === 0x0a) {
        pos += 1;
        if (next === 0x0d && pos < rawBytes.byteLength && rawBytes[pos] === 0x0a) pos += 1;
        flushParagraph(state.mode === "footnote");
        continue;
      }
      if (next === 0x5c || next === 0x7b || next === 0x7d) {
        pos += 1;
        flushHexBuffer();
        if (skipFallback > 0) skipFallback -= 1;
        else pushText(String.fromCharCode(next));
        continue;
      }
      if ((next >= 0x41 && next <= 0x5a) || (next >= 0x61 && next <= 0x7a)) {
        const wordStart = pos;
        while (
          pos < rawBytes.byteLength &&
          ((rawBytes[pos]! >= 0x41 && rawBytes[pos]! <= 0x5a) || (rawBytes[pos]! >= 0x61 && rawBytes[pos]! <= 0x7a))
        ) pos += 1;
        const word = String.fromCharCode(...rawBytes.subarray(wordStart, pos));
        let hasParam = false;
        let param: number | undefined;
        if (pos < rawBytes.byteLength && (rawBytes[pos] === 0x2d || (rawBytes[pos]! >= 0x30 && rawBytes[pos]! <= 0x39))) {
          const numStart = pos;
          if (rawBytes[pos] === 0x2d) pos += 1;
          while (pos < rawBytes.byteLength && rawBytes[pos]! >= 0x30 && rawBytes[pos]! <= 0x39) pos += 1;
          param = parseInt(String.fromCharCode(...rawBytes.subarray(numStart, pos)), 10);
          hasParam = !Number.isNaN(param);
        }
        if (pos < rawBytes.byteLength && rawBytes[pos] === 0x20) pos += 1;

        if (word === "bin" && hasParam && param! >= 0) {
          const binEnd = Math.min(rawBytes.byteLength, pos + param!);
          if (state.mode === "pict" && state.pictType) {
            const rawBin = rawBytes.subarray(pos, binEnd);
            const mime = state.pictType === "png" ? "image/png" : state.pictType === "jpeg" ? "image/jpeg" : "image/bmp";
            const finalBytes = state.pictType === "dib" ? wrapDibAsBmp(rawBin) : rawBin.slice();
            if (finalBytes) {
              const idx = collector.add(mime, finalBytes);
              if (idx !== undefined) appendRtfRun(currentRuns, { text: "", imageIndex: idx });
            }
          }
          pos = binEnd;
          continue;
        }
        applyControl(word, param, hasParam);
        continue;
      }

      pos += 1;
      applyControl(String.fromCharCode(next), undefined, false);
      continue;
    }

    flushHexBuffer();
    if (skipFallback > 0) { skipFallback -= 1; continue; }
    pushText(String.fromCharCode(ch));
  }

  flushParagraph();
  flushTable();

  return {
    kind: "document",
    format: "rtf",
    metadata,
    blocks,
    footnotes,
    images: collector.images,
    truncated,
  };
}
