import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";
export async function probeMesh3d({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const text = new TextDecoder().decode(bytes); const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "stl") return (bytes.length >= 84 && new DataView(bytes.buffer).getUint32(80, true) * 50 + 84 === file.size) || /^\s*solid\b/.test(text) ? 3 : 0;
  if (ext === "ply") return /^ply\r?\n/.test(text) ? 3 : 0;
  if (ext === "off") return /^\s*(?:#[^\n]*\n\s*)*OFF\b/.test(text) ? 3 : 0;
  if (ext === "obj") return /^\s*(v |o |#|mtllib |g )/m.test(text) ? 3 : 0;
  if (ext === "glb") return text.startsWith("glTF") ? 3 : 0;
  if (ext === "gltf") return /^\s*\{/.test(text) ? 3 : 0;
  return 0;
}
