import { importRuntime } from "@anyfile/runtime-assets";
import { comicArchiveKind } from "./signature";
import { COMPRESSED_COMIC_LIMIT, fail, readCompressedArchive, type ArchiveModule } from "./compressed-archive";
const stored = new Map<string, Uint8Array>();
async function open(file: File, runtime: string) {
  if (file.size > COMPRESSED_COMIC_LIMIT) fail("resource-limit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!comicArchiveKind(bytes)) fail("invalid-file");
  let mod: ArchiveModule;
  try { mod = await (await importRuntime<{ default(): Promise<ArchiveModule> }>(runtime)).default(); }
  catch { return fail("unsupported-environment"); }
  const result = readCompressedArchive(bytes, mod);
  for (const [path, data] of result.stored) stored.set(path, data);
  return { entries: result.entries, heapBytes: result.heapBytes, encodedBytes: result.encodedBytes };
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
