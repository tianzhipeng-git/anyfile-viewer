export interface BookEntry { filename: string; directory: boolean; uncompressedSize: number; }
export interface BookSource {
  entries: Map<string, BookEntry>;
  read(path: string, limit: number, signal?: AbortSignal): Promise<Uint8Array>;
  dispose(): Promise<void>;
}
export class ProtectedBookError extends Error {}
export function checkBookAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
