import { ViewerError } from "@anyfile/viewer-protocol";
export const FB2_NAMESPACE = "http://www.gribuser.ru/xml/fictionbook/2.0";
export function decodeFb2(bytes: Uint8Array, stream = false): string {
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0
    ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c ? "utf-16be" : undefined;
  const header = new TextDecoder(utf16 ?? "ascii").decode(bytes.subarray(0, 512));
  const declared = /^\s*<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i.exec(header)?.[1].toLowerCase();
  const encoding = utf16 ?? declared ?? "utf-8";
  if (!/^(utf-8|utf-16le|utf-16be|windows-1251)$/.test(encoding))
    throw new ViewerError("invalid-file", "Unsupported FB2 encoding.");
  return new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream });
}
export function singleFb2(names: Iterable<string>): string | undefined {
  const files = [...names].filter((name) => !name.endsWith("/"));
  const books = files.filter((name) => /\.fb2$/i.test(name));
  return books.length === 1 ? books[0] : undefined;
}
