import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
export async function probePrint3d({file, signal}: ProbeViewerContext) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const text = await file.slice(0, 4096).text();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return (file.name.toLowerCase().endsWith(".3mf") ? text.startsWith("PK\x03\x04") : /<amf\b/.test(text)) ? 3 as const : 0 as const;
}
