// Windows-1252 C1 range (0x80..0x9F) mapping per WHATWG encoding standard.
const CP1252_EXTRA = new Map<number, string>([
  [0x80, "\u20AC"], [0x82, "\u201A"], [0x83, "\u0192"], [0x84, "\u201E"],
  [0x85, "\u2026"], [0x86, "\u2020"], [0x87, "\u2021"], [0x88, "\u02C6"],
  [0x89, "\u2030"], [0x8a, "\u0160"], [0x8b, "\u2039"], [0x8c, "\u0152"],
  [0x8e, "\u017D"], [0x91, "\u2018"], [0x92, "\u2019"], [0x93, "\u201C"],
  [0x94, "\u201D"], [0x95, "\u2022"], [0x96, "\u2013"], [0x97, "\u2014"],
  [0x98, "\u02DC"], [0x99, "\u2122"], [0x9a, "\u0161"], [0x9b, "\u203A"],
  [0x9c, "\u0153"], [0x9e, "\u017E"], [0x9f, "\u0178"],
]);

const CODEPAGE_MAP = new Map<number, string>([
  [874, "windows-874"],
  [932, "shift_jis"],
  [936, "gbk"],
  [949, "euc-kr"],
  [950, "big5"],
  [1250, "windows-1250"],
  [1251, "windows-1251"],
  [1252, "windows-1252"],
  [1253, "windows-1253"],
  [1254, "windows-1254"],
  [1255, "windows-1255"],
  [1256, "windows-1256"],
  [1257, "windows-1257"],
  [1258, "windows-1258"],
  [65001, "utf-8"],
]);

const CHARSET_TO_CODEPAGE = new Map<number, number>([
  [0, 1252],
  [1, 1252],
  [77, 10000],
  [128, 932],
  [129, 949],
  [134, 936],
  [136, 950],
  [161, 1253],
  [162, 1254],
  [163, 1258],
  [177, 1255],
  [178, 1256],
  [186, 1257],
  [204, 1251],
  [222, 874],
  [238, 1250],
]);

export function codePageFromCharset(charset: number): number | undefined {
  return CHARSET_TO_CODEPAGE.get(charset);
}

export function decodeCp1252Byte(byte: number): string {
  if (byte >= 0x80 && byte <= 0x9f) {
    return CP1252_EXTRA.get(byte) ?? String.fromCharCode(byte);
  }
  return String.fromCharCode(byte);
}

const decoderCache = new Map<string, TextDecoder>();

function getTextDecoder(label: string): TextDecoder | undefined {
  const cached = decoderCache.get(label);
  if (cached) return cached;
  try {
    const decoder = new TextDecoder(label);
    decoderCache.set(label, decoder);
    return decoder;
  } catch {
    return undefined;
  }
}

export function decodeWithCodePage(bytes: Uint8Array, codePage = 1252): string {
  if (bytes.byteLength === 0) return "";
  const label = CODEPAGE_MAP.get(codePage) ?? "windows-1252";
  const decoder = getTextDecoder(label);
  if (decoder) {
    return decoder.decode(bytes);
  }
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    out += decodeCp1252Byte(bytes[i]!);
  }
  return out;
}

export function decodeUtf16Le(bytes: Uint8Array): string {
  if (bytes.byteLength < 2) return "";
  const evenLen = bytes.byteLength & ~1;
  const decoder = getTextDecoder("utf-16le");
  if (decoder) {
    return decoder.decode(bytes.subarray(0, evenLen));
  }
  let out = "";
  for (let i = 0; i + 1 < evenLen; i += 2) {
    out += String.fromCharCode(bytes[i]! | (bytes[i + 1]! << 8));
  }
  return out;
}
