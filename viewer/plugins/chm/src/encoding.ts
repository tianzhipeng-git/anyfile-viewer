const LCID_ENCODING: Record<number, string> = {
  0x0404: "big5",
  0x0c04: "big5",
  0x1404: "big5",
  0x0804: "gbk",
  0x1004: "gbk",
  0x0411: "shift_jis",
  0x0412: "euc-kr",
  0x0419: "windows-1251",
  0x0422: "windows-1251",
  0x0423: "windows-1251",
  0x0405: "windows-1250",
  0x040e: "windows-1250",
  0x0415: "windows-1250",
  0x0418: "windows-1250",
  0x041a: "windows-1250",
  0x041b: "windows-1250",
  0x0424: "windows-1250",
  0x0408: "windows-1253",
  0x041f: "windows-1254",
  0x040d: "windows-1255",
  0x0401: "windows-1256",
  0x0801: "windows-1256",
  0x0429: "windows-1256",
  0x0425: "windows-1257",
  0x0426: "windows-1257",
  0x0427: "windows-1257",
  0x042a: "windows-1258",
  0x041e: "windows-874",
};

const utf8Fatal = new TextDecoder("utf-8", { fatal: true });
const latin1Decoder = new TextDecoder("windows-1252");

export function encodingFromLcid(lcid: number): string {
  return LCID_ENCODING[lcid & 0xffff] ?? "windows-1252";
}

function tryDecode(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      return null;
    }
  }
}

export function detectHtmlCharset(bytes: Uint8Array): string | null {
  const head = latin1Decoder.decode(bytes.subarray(0, Math.min(bytes.byteLength, 2048)));
  const metaCharset = /<meta\b[^>]*\bcharset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(head);
  if (metaCharset) return metaCharset[1].toLowerCase();
  const contentType = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-type["']?[^>]*\bcontent\s*=\s*["'][^"']*charset\s*=\s*([a-z0-9._-]+)/i.exec(
    head,
  );
  if (contentType) return contentType[1].toLowerCase();
  return null;
}

export function decodeChmText(bytes: Uint8Array, fallbackEncoding: string, isHtml = false): string {
  if (bytes.byteLength === 0) return "";
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  if (isHtml) {
    const declared = detectHtmlCharset(bytes);
    if (declared && declared !== "utf-8" && declared !== "utf8") {
      const decoded = tryDecode(bytes, declared);
      if (decoded !== null) return decoded;
    }
  }

  try {
    return utf8Fatal.decode(bytes);
  } catch {
    const fallback = tryDecode(bytes, fallbackEncoding);
    if (fallback !== null) return fallback;
    return latin1Decoder.decode(bytes);
  }
}
