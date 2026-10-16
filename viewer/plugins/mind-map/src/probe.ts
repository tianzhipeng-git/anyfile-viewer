import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

export const PROBE_BYTES = 64 * 1024;
export async function probeMindMap({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (/\.(xmind|mmap)$/i.test(file.name)) return 3;
  if (!/\.mm$/i.test(file.name)) return 0;
  // .mm is also Objective-C++; inspect only the XML prolog/root, never the tree.
  const bytes = await file.slice(0, PROBE_BYTES).arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const header = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "")
    .replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/, "");
  return /^<map(?:\s|>)/.test(header) ? 3 : 0;
}
