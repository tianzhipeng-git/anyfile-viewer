import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
import { decodeFb2, FB2_NAMESPACE, singleFb2 } from "./encoding";
export async function probeFictionBook({ file, signal }: ProbeViewerContext) {
  signal.throwIfAborted();
  if (/\.zip$/i.test(file.name)) {
    const { names } = await readBookZipCatalog(file, signal);
    return singleFb2(names) ? 4 : 0;
  }
  const bytes = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  signal.throwIfAborted();
  const header = decodeFb2(bytes, true).replace(/^\s*<\?xml[^?]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  return /^\s*<(?:[\w.-]+:)?FictionBook\b/.test(header) && header.includes(FB2_NAMESPACE) ? 4 : 0;
}
