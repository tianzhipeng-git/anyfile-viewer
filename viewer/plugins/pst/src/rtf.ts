/**
 * PidTagRtfCompressed support: LZFu decompression ([MS-OXRTFCP]) and a small
 * RTF reader that recovers plain text, or the original HTML when the RTF
 * encapsulates it (`\fromhtml1`, [MS-OXRTFEX]).
 */
import { u32 } from "./header";
import { PST_LIMITS, PstError, invalid } from "./types";

const latin1 = new TextDecoder("latin1");

const PREFIX =
  "{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx";

export function decompressRtf(data: Uint8Array): Uint8Array {
  if (data.length < 16) invalid("Truncated compressed RTF.");
  const rawSize = u32(data, 4);
  const type = u32(data, 8);
  if (type === 0x414c454d) return data.subarray(16, 16 + rawSize);
  if (type !== 0x75465a4c) invalid("Unknown compressed RTF type.");
  if (rawSize > PST_LIMITS.maxNodeBytes) throw new PstError("resource-limit", "RTF body too large.");
  const dict = new Uint8Array(4096);
  for (let i = 0; i < PREFIX.length; i++) dict[i] = PREFIX.charCodeAt(i);
  let write = PREFIX.length;
  const out = new Uint8Array(rawSize);
  let outPos = 0;
  let pos = 16;
  while (pos < data.length && outPos < rawSize) {
    const control = data[pos++];
    for (let bit = 0; bit < 8 && pos < data.length && outPos < rawSize; bit++) {
      if ((control & (1 << bit)) === 0) {
        dict[write] = out[outPos++] = data[pos++];
        write = (write + 1) & 0xfff;
        continue;
      }
      if (pos + 1 >= data.length) return out.subarray(0, outPos);
      const word = (data[pos] << 8) | data[pos + 1];
      pos += 2;
      const offset = word >> 4;
      if (offset === write) return out.subarray(0, outPos);
      const length = (word & 0xf) + 2;
      for (let i = 0; i < length && outPos < rawSize; i++) {
        const byte = dict[(offset + i) & 0xfff];
        dict[write] = out[outPos++] = byte;
        write = (write + 1) & 0xfff;
      }
    }
  }
  return out.subarray(0, outPos);
}

/** Destinations whose content is never body text. */
const SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr",
  "footerl", "footerr", "object", "listtable", "listoverridetable", "rsidtbl", "generator", "xmlnstbl",
  "themedata", "colorschememapping", "latentstyles", "datastore", "fldinst", "filetbl", "revtbl",
]);

interface Group {
  skip: boolean;
  htmlTag: boolean;
  htmlRtf: boolean;
  uc: number;
}

export interface RtfBody {
  readonly kind: "html" | "text";
  readonly content: string;
}

/** Extracts the readable body; encapsulated HTML is returned as HTML source. */
export function rtfToBody(rtf: Uint8Array): RtfBody {
  let codepage = 1252;
  const fromHtml = /\\fromhtml1/.test(latin1.decode(rtf.subarray(0, 512)));
  let out = "";
  let pendingBytes: number[] = [];
  const flush = () => {
    if (pendingBytes.length === 0) return;
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(codepage === 65001 ? "utf-8" : `windows-${codepage}`);
    } catch {
      decoder = new TextDecoder("windows-1252");
    }
    out += decoder.decode(new Uint8Array(pendingBytes));
    pendingBytes = [];
  };
  let state: Group = { skip: false, htmlTag: false, htmlRtf: false, uc: 1 };
  const stack: Group[] = [];
  let skipChars = 0;
  let groupStart = false;
  const visible = () => !state.skip && (!fromHtml || state.htmlTag || !state.htmlRtf);
  const emit = (text: string) => {
    if (skipChars > 0) {
      skipChars--;
      return;
    }
    if (!visible()) return;
    flush();
    out += text;
  };

  let i = 0;
  while (i < rtf.length) {
    const byte = rtf[i];
    if (byte === 0x7b) {
      if (stack.length > 4096) invalid("RTF nesting too deep.");
      stack.push(state);
      state = { ...state };
      groupStart = true;
      i++;
      continue;
    }
    if (byte === 0x7d) {
      flush();
      state = stack.pop() ?? state;
      groupStart = false;
      i++;
      continue;
    }
    if (byte === 0x5c) {
      const next = rtf[i + 1];
      if (next === 0x27) {
        const value = parseInt(String.fromCharCode(rtf[i + 2], rtf[i + 3]), 16);
        i += 4;
        if (skipChars > 0) skipChars--;
        else if (visible() && Number.isFinite(value)) pendingBytes.push(value);
        groupStart = false;
        continue;
      }
      if (next === 0x2a) {
        i += 2;
        // \* marks an ignorable destination unless it is an encapsulated HTML tag.
        let j = i;
        while (rtf[j] === 0x20 || rtf[j] === 0x0d || rtf[j] === 0x0a) j++;
        const word = /^\\([a-z]+)/.exec(latin1.decode(rtf.subarray(j, j + 16)))?.[1];
        if (word === "htmltag" && fromHtml) state.htmlTag = true;
        else state.skip = true;
        continue;
      }
      const match = /^\\([a-zA-Z]{1,32})(-?\d{1,10})? ?|^\\([^a-zA-Z])/.exec(latin1.decode(rtf.subarray(i, i + 48)));
      if (!match) {
        i++;
        continue;
      }
      i += match[0].length;
      if (match[3] !== undefined) {
        const symbol = match[3];
        if (symbol === "\\" || symbol === "{" || symbol === "}") emit(symbol);
        else if (symbol === "~") emit(" ");
        else if (symbol === "\r" || symbol === "\n") emit("\n");
        groupStart = false;
        continue;
      }
      const word = match[1];
      const param = match[2] === undefined ? undefined : Number(match[2]);
      if (groupStart && SKIP_DESTINATIONS.has(word)) state.skip = true;
      groupStart = false;
      switch (word) {
        case "ansicpg": if (param) codepage = param; break;
        case "uc": state.uc = param ?? 1; break;
        case "u":
          if (param !== undefined) {
            emit(String.fromCharCode(param < 0 ? param + 65536 : param));
            skipChars = state.uc;
          }
          break;
        case "htmlrtf": state.htmlRtf = param !== 0; break;
        case "par": case "line": if (!state.htmlTag) emit("\n"); else emit("\r\n"); break;
        case "tab": emit("\t"); break;
        case "emdash": emit("—"); break;
        case "endash": emit("–"); break;
        case "bullet": emit("•"); break;
        case "lquote": emit("‘"); break;
        case "rquote": emit("’"); break;
        case "ldblquote": emit("“"); break;
        case "rdblquote": emit("”"); break;
      }
      continue;
    }
    groupStart = false;
    if (byte === 0x0d || byte === 0x0a) {
      i++;
      continue;
    }
    if (skipChars > 0) skipChars--;
    else if (visible()) pendingBytes.push(byte);
    i++;
  }
  flush();
  return { kind: fromHtml ? "html" : "text", content: fromHtml ? out : out.replace(/\0/g, "").replace(/\n{3,}/g, "\n\n").trim() };
}
