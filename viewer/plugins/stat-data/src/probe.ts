import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
import type { StatFormat } from "./types";

export const HEADER_BYTES = 1024;
const SAS7BDAT_MAGIC = [0xc2, 0xea, 0x81, 0x60, 0xb3, 0x14, 0x11, 0xcf, 0xbd, 0x92, 0x08, 0x00, 0x09, 0xc7, 0x31, 0x8c, 0x18, 0x1f, 0x10, 0x11];
const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

/** Identifies the container from its leading bytes; ReadStat validates the rest when opening. */
export function detectStatFormat(bytes: Uint8Array): StatFormat | undefined {
  const head = ascii(bytes, 0, 80);
  if (head.startsWith("$FL2") || head.startsWith("$FL3")) return "sav";
  if (head.startsWith("<stata_dta>")) return "dta";
  // Stata 104–115: version byte, byte order 1 (MSF) or 2 (LSF), filetype 1.
  if (bytes.length >= 4 && bytes[0] >= 104 && bytes[0] <= 115 && (bytes[1] === 1 || bytes[1] === 2) && bytes[2] === 1) return "dta";
  if (bytes.length >= 32 && bytes.subarray(0, 12).every((byte) => byte === 0) && SAS7BDAT_MAGIC.every((byte, index) => bytes[12 + index] === byte)) return "sas7bdat";
  if (/^HEADER RECORD\*{7}LIB(?:RARY|V8   ) HEADER RECORD!{7}0{30}/.test(head)) return "xpt";
  // SPSS portable: 200-byte vanity header + 256-byte translation table, then the signature; lines may be wrapped.
  if (ascii(bytes, 450, 40).includes("SPSSPORT")) return "por";
  return undefined;
}

export async function readHeader(file: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  signal.throwIfAborted();
  return bytes;
}

export async function probeStatData({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  const format = detectStatFormat(await readHeader(file, signal));
  return format === undefined ? 0 : format === "por" ? 3 : 4;
}
