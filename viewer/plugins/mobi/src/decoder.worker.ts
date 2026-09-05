import { inspectMobi } from "./probe";
interface MobiModule {
  HEAPU8: Uint8Array; UTF8ToString(pointer: number): string;
  _malloc(size: number): number; _free(pointer: number): void;
  _open_book(pointer: number, size: number): number; _close_book(): void;
  _part_count(): number; _part_name(i: number): number; _part_type(i: number): number;
  _part_size(i: number): number; _part_data(i: number): number; _book_title(): number;
}
const stored = new Map<string, Uint8Array>();
const fail = (code: string): never => { throw new Error(code); };
async function open(file: File, runtime: string) {
  const info = await inspectMobi(file, new AbortController().signal, true);
  if (!info) fail("invalid-file");
  if (info!.protected) fail("protected");
  let mod: MobiModule;
  try { mod = await (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ runtime)).default(); }
  catch { return fail("unsupported-environment"); }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pointer = mod._malloc(bytes.length);
  if (!pointer) fail("resource-limit");
  try {
    mod.HEAPU8.set(bytes, pointer);
    const status = mod._open_book(pointer, bytes.length);
    if (status) fail(status === 2 || status === 4 ? "protected" : status === 3 ? "resource-limit" : "invalid-file");
    const entries: { filename: string; type: string; uncompressedSize: number; directory: boolean }[] = [];
    let total = 0;
    for (let i = 0; i < mod._part_count(); i++) {
      const filename = mod.UTF8ToString(mod._part_name(i)), type = mod.UTF8ToString(mod._part_type(i)), size = mod._part_size(i);
      total += size;
      if (total > 64 * 1024 ** 2) fail("resource-limit");
      stored.set(filename, mod.HEAPU8.slice(mod._part_data(i), mod._part_data(i) + size));
      entries.push({ filename, type, uncompressedSize: size, directory: false });
    }
    return { entries, palm: info!.palm, title: mod.UTF8ToString(mod._book_title()), heapBytes: mod.HEAPU8.byteLength };
  } finally { mod._close_book(); mod._free(pointer); }
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "open") self.postMessage({ id: data.id, result: await open(data.file, data.runtime) });
    else {
      const bytes = stored.get(data.path);
      if (!bytes) fail("missing-related-file");
      if (bytes!.length > data.limit) fail("resource-limit");
      const result = bytes!.slice();
      self.postMessage({ id: data.id, result }, { transfer: [result.buffer] });
    }
  } catch (error) {
    const code = error instanceof Error && ["protected", "invalid-file", "resource-limit", "missing-related-file", "unsupported-environment"].includes(error.message) ? error.message : error instanceof WebAssembly.RuntimeError ? "resource-limit" : "invalid-file";
    self.postMessage({ id: data.id, error: code });
  }
};
