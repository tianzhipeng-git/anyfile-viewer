import { decodeBinaryPlist } from "./binary-plist";
import { PlistError, type PlistValue } from "./types";
import { decodeXmlPlist } from "./xml-plist";

export const MAX_PLIST_BYTES = 64 * 1024 * 1024;

const BINARY_MAGIC = "bplist00";
const HEADER_BYTES = 64 * 1024;

function isBinary(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i += 1) if (bytes[i] !== BINARY_MAGIC.charCodeAt(i)) return false;
  return true;
}

/**
 * Sniff whether a file looks like a property list. Shared by `probe()` (bounded
 * header read) and `readPlist()` (full read) so both agree on the format.
 */
export function looksLikePlist(head: Uint8Array): boolean {
  if (isBinary(head)) return true;
  const start = new TextDecoder("utf-8", { fatal: false }).decode(head).trimStart();
  if (start.startsWith("<plist")) return true;
  // An XML declaration or plist DOCTYPE can precede the <plist> root beyond the header window.
  return /^<\?xml/.test(start) || /^<!DOCTYPE\s+plist/.test(start);
}

async function readHead(file: File, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw abortSignal();
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, HEADER_BYTES)).arrayBuffer());
    if (signal.aborted) throw abortSignal();
    return head;
  } catch (error) {
    if (signal.aborted || (error as { name?: string })?.name === "AbortError") throw abortSignal();
    throw error;
  }
}

function abortSignal() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

/** Probe only the header so the file-type router can decide without decoding. */
export async function probePlist({ file, signal }: { file: File; signal: AbortSignal }): Promise<0 | 1 | 2 | 3> {
  if (file.size === 0) return 0;
  const head = await readHead(file, signal);
  if (isBinary(head)) return head.length >= 8 + 32 ? 3 : 0;
  return looksLikePlist(head) ? 2 : 0;
}

export async function readPlist(file: File, signal: AbortSignal): Promise<PlistValue> {
  if (file.size > MAX_PLIST_BYTES) {
    throw new PlistError("resource-limit", `Property lists above ${MAX_PLIST_BYTES / (1024 * 1024)} MiB are not supported.`);
  }
  if (signal.aborted) throw abortSignal();
  const head = await readHead(file, signal);
  if (head.length === 0) throw new PlistError("invalid-file", "The file is empty.");
  if (isBinary(head)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signal.aborted) throw abortSignal();
    return decodeBinaryPlist(bytes);
  }
  if (!looksLikePlist(head)) throw new PlistError("invalid-file", "The file is not a property list.");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
  if (signal.aborted) throw abortSignal();
  try {
    return decodeXmlPlist(text);
  } catch (error) {
    if (error instanceof PlistError) throw error;
    throw new PlistError("invalid-file", "The XML property list is malformed.", { cause: error });
  }
}

export { PLIST_LIMITS, PlistError, type PlistValue } from "./types";
