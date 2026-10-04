import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
export function isIfcHeader(source: string) {
  return /^\s*ISO-10303-21\s*;/i.test(source) && /FILE_SCHEMA\s*\(\s*\(\s*'IFC(?:2X3|4|4X3_ADD2)'\s*\)\s*\)/i.test(source);
}
export async function probeIfc({ file, signal }: ProbeViewerContext) {
  signal.throwIfAborted();
  const header = await file.slice(0, 65536).text();
  signal.throwIfAborted();
  return isIfcHeader(header) ? 3 as const : 0 as const;
}
