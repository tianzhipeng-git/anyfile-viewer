import { ViewerError, type ProbeViewerContext } from "@anyfile/viewer-protocol";
export const MOBI_LIMITS = { file: 64 * 1024 ** 2, text: 32 * 1024 ** 2, records: 10000, record: 16 * 1024 ** 2 };
export async function inspectMobi(file: File, signal: AbortSignal, full = false) {
  signal.throwIfAborted();
  const head = new Uint8Array(await file.slice(0, 86).arrayBuffer());
  signal.throwIfAborted();
  if (head.length < 86) return null;
  const signature = new TextDecoder().decode(head.subarray(60, 68));
  if (signature !== "BOOKMOBI" && signature !== "TEXtREAd") return null;
  const view = new DataView(head.buffer);
  const count = view.getUint16(76), first = view.getUint32(78);
  if (!count || first < 78 + count * 8 || first + 16 > file.size) return null;
  if (count > MOBI_LIMITS.records || file.size > MOBI_LIMITS.file) throw new ViewerError("resource-limit", "MOBI input limit.");
  const header = new Uint8Array(await file.slice(first, first + 280).arrayBuffer());
  signal.throwIfAborted();
  const record = new DataView(header.buffer), compression = record.getUint16(0);
  if (![1, 2, 17480].includes(compression)) return null;
  if (record.getUint32(4) > MOBI_LIMITS.text || record.getUint16(8) >= count) throw new ViewerError("resource-limit", "MOBI text limit.");
  if (signature === "BOOKMOBI" && (header.length < 40 || new TextDecoder().decode(header.subarray(16,20)) !== "MOBI")) return null;
  if (full) {
    const table = new DataView(await file.slice(78, 78 + count * 8).arrayBuffer());
    signal.throwIfAborted();
    let previous = first;
    for (let i = 1; i <= count; i++) {
      const next = i === count ? file.size : table.getUint32(i * 8);
      if (next <= previous || next > file.size) throw new ViewerError("invalid-file", "Invalid MOBI record offsets.");
      if (next - previous > MOBI_LIMITS.record) throw new ViewerError("resource-limit", "MOBI record limit.");
      previous = next;
    }
  }
  return { protected: signature === "BOOKMOBI" && record.getUint16(12) !== 0, palm: signature === "TEXtREAd" };
}
export async function probeMobi({ file, signal }: ProbeViewerContext) {
  return await inspectMobi(file, signal) ? 3 : 0;
}
