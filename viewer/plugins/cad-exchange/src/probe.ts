import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
export async function probeCadExchange({file,signal}: ProbeViewerContext) {
  if (signal.aborted) throw new DOMException("Aborted","AbortError");
  const source = await file.slice(0,4096).text();
  if (signal.aborted) throw new DOMException("Aborted","AbortError");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "step" || ext === "stp") return /ISO-10303-21\s*;/.test(source) ? 3 as const : 0 as const;
  if (ext === "brep") return /DBRep_DrawableShape|CASCADE Topology/.test(source) ? 3 as const : 0 as const;
  return source.split(/\r?\n/).some(line => line.length >= 73 && line[72] === "S") ? 3 as const : 0 as const;
}
