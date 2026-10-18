import { ViewerError, type WorkspaceReader } from "@anyfile/viewer-protocol";
import type { openBookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { sanitizeSvg } from "@anyfile/safe-svg-viewer/sanitize";
import type { Sheet, Topic } from "./model";

const MAX_ASSET = 16 * 1024 ** 2, MAX_TOTAL = 64 * 1024 ** 2;
const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
export async function loadAssets(sheets: Sheet[], signal: AbortSignal, zip?: Awaited<ReturnType<typeof openBookZip>>, workspace?: WorkspaceReader) {
  const assets = new Map<string, Blob>(), attachmentText = new Map<string, string>();
  const images = new Set<string>(), attachments = new Map<string, string>();
  function visit(t: Topic) {
    if (t.image) images.add(t.image);
    for (const a of t.attachments) attachments.set(a.path, a.name);
    t.children.forEach(visit);
  }
  sheets.forEach(s => visit(s.root));
  let total = 0;
  for (const reference of new Set([...images, ...attachments.keys()])) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const inline = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(reference);
    if (inline) {
      if (inline[2].length > MAX_ASSET * 4 / 3 + 4) throw new ViewerError("resource-limit", "Mind map resource limit exceeded.");
      const bytes = Uint8Array.from(atob(inline[2]), c => c.charCodeAt(0));
      total += bytes.byteLength;
      if (total > MAX_TOTAL) throw new ViewerError("resource-limit", "Mind map resource limit exceeded.");
      assets.set(reference, new Blob([bytes], { type: inline[1] }));
      continue;
    }
    if (!zip && reference.startsWith("/")) continue;
    const path = reference.replace(/^xap:/, "").replace(/^\//, "");
    if (!path || /[\\:]/.test(path) || path.split("/").some(p => !p || p === "." || p === "..")) continue;
    const extension = (attachments.get(reference) || path).split(".").pop()?.toLowerCase() || "";
    let mime = mimeTypes[extension];
    const isText = /^(txt|md|csv|json|xml|log)$/.test(extension);
    if (!mime && !isText && !images.has(reference)) continue;
    let bytes: Uint8Array | undefined;
    if (zip?.entries.has(path)) bytes = await zip.read(path, MAX_ASSET, signal);
    else if (!zip && workspace) {
      const file = await workspace.open(path, { signal });
      if (!file) continue;
      if (file.size > MAX_ASSET) throw new ViewerError("resource-limit", "Mind map resource limit exceeded.");
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    if (!bytes) continue;
    total += bytes.byteLength;
    if (total > MAX_TOTAL) throw new ViewerError("resource-limit", "Mind map resource limit exceeded.");
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!mime && images.has(reference)) {
      if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) mime = "image/png";
      else if (bytes[0] === 255 && bytes[1] === 216) mime = "image/jpeg";
      else if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) mime = "image/gif";
    }
    if (mime === "image/svg+xml") {
      const clean = sanitizeSvg(bytes);
      if (clean) assets.set(reference, new Blob([clean.source], { type: mime }));
    } else if (mime) assets.set(reference, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
    else if (isText && bytes.length <= 1024 ** 2) attachmentText.set(reference, new TextDecoder().decode(bytes));
  }
  sheets.forEach(s => { s.assets = assets; s.attachmentText = attachmentText; });
}
