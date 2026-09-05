import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
export async function probePointCloud({ file, signal }: ProbeViewerContext) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (/\.la[sz]$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.slice(0, 375).arrayBuffer());
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return bytes.length >= 227 && new DataView(bytes.buffer).getUint32(0, true) === 0x4653414c && bytes[24] === 1 && bytes[25] <= 4 && (bytes[104] & 63) <= 10 && !(bytes[104] & 64) ? 2 as const : 0 as const;
  }
  const text = await file.slice(0, 65536).text();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (file.name.toLowerCase().endsWith(".pcd")) return /^DATA\s+ascii\s*$/im.test(text) ? 2 as const : 0 as const;
  const line = text.split(/\r?\n/).find(line => line.trim() && !line.trim().startsWith("#"));
  return line && line.trim().split(/\s+/).length >= 3 && line.trim().split(/\s+/).slice(0,3).every(value => Number.isFinite(Number(value))) ? 2 as const : 0 as const;
}
