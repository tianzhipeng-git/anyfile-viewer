import { imagePixels } from "./image-budget";
import { LoadingManager } from "three";
import { ViewerError, selectMessages, type OpenViewerContext } from "@anyfile/viewer-protocol";

export function resourcePath(uri: string) {
  const path = decodeURIComponent(uri).replaceAll("\\", "/");
  if (/^[a-z][a-z\d+.-]*:|^\/|[\x00-\x1f?#]/i.test(path)) throw new Error("Unsafe resource path");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("Resource escapes workspace"); parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}

export function localResources(context: OpenViewerContext) {
  const urls = new Map<string, string>(); const owned = new Set<string>(); let total = 0; let pixels = 0; let disposed = false;
  const copy = selectMessages(context.locale, { en: { missing: "A related model resource is missing. Open its containing folder.", limit: "Related resources exceed the size limit." }, "zh-CN": { missing: "模型缺少关联资源，请打开所在文件夹。", limit: "关联资源超过大小上限。" } });
  const manager = new LoadingManager();
  let pending = 0;
  let complete: (() => void) | undefined;
  const start = manager.itemStart.bind(manager), end = manager.itemEnd.bind(manager);
  manager.itemStart = (url) => { pending++; start(url); };
  manager.itemEnd = (url) => { end(url); if (--pending === 0) complete?.(); };

  const abort = () => { manager.abort(); };
  context.signal.addEventListener("abort", abort, { once: true });
  manager.setURLModifier(uri => {
    if (owned.has(uri)) return uri;
    const mapped = urls.get(uri);
    if (!mapped) throw new Error("Unresolved model resource");
    return mapped;
  });
  return {
    manager,
    get imagePixels() { return pixels; },
    wait() {
      if (!pending) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const abort = () => { complete = undefined; manager.abort(); reject(new DOMException("Aborted", "AbortError")); };
        complete = () => { context.signal.removeEventListener("abort", abort); resolve(); };
        context.signal.addEventListener("abort", abort, { once: true });
        if (context.signal.aborted) abort();
      });
    },
    async prepare(uri: string, image = false) {
      if (urls.has(uri)) return urls.get(uri)!;
      if (disposed || context.signal.aborted) throw new DOMException("Aborted", "AbortError");
      let blob: Blob;
      if (uri.startsWith("data:")) {
        const match = /^data:(application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp));base64,([A-Za-z\d+/=\r\n]+)$/.exec(uri);
        if (!match) throw new Error("Unsupported data URI");
        if (match[2].length > 90_000_000) throw new RangeError();
        const decoded = atob(match[2]); blob = new Blob([Uint8Array.from(decoded, c => c.charCodeAt(0))], { type: match[1] });
      } else {
        const file = await context.workspace?.open(resourcePath(uri), { signal: context.signal });
        if (!file) throw new ViewerError("missing-related-file", copy.missing);
        blob = file;
      }
      if (image) { pixels += await imagePixels(blob); if (pixels > 32_000_000) throw new RangeError("Total texture budget"); }
      total += blob.size;
      if (total > 128 * 1024 * 1024) throw new ViewerError("resource-limit", copy.limit);
      if (disposed || context.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const url = URL.createObjectURL(blob); owned.add(url); urls.set(uri, url); return url;
    },
    dispose() { disposed = true; context.signal.removeEventListener("abort", abort); for (const url of owned) URL.revokeObjectURL(url); owned.clear(); urls.clear(); },
  };
}
