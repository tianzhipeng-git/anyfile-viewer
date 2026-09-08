import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
// R13 through the AC1032 file family. The parser checks the complete file again.
export const dwgSignatures = new Set(["AC1012", "AC1014", "AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032"]);
export async function probeDwg({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (file.size < 128) return 0;
  const signature = new TextDecoder().decode(await file.slice(0, 6).arrayBuffer());
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return dwgSignatures.has(signature) ? 3 : 0;
}
