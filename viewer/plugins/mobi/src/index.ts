import { ViewerError, isViewerAbortError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { ProtectedBookError } from "@anyfile/archive-metadata-viewer/book-source";
import { createBookWorker } from "@anyfile/archive-metadata-viewer/book-worker";
import { createPublicationViewport, publicationCopy } from "@anyfile/rendering-publication";
import { mobiManifest } from "./manifest";
import { inspectMobi } from "./probe";
import { mobiPublication, type MobiResult } from "./publication";
export const mobiViewer: FileViewerPlugin = {
  manifest: mobiManifest,
  async open(context) {
    const root = document.createElement("div"), copy = publicationCopy(context.locale);
    root.className = "anyfile-mobi-reader";
    const lifetime = new AbortController();
    let worker: ReturnType<typeof createBookWorker> | undefined;
    let viewport: ReturnType<typeof createPublicationViewport> | undefined;
    let disposed = false;
    const dispose = () => {
      if (disposed) return; disposed = true;
      lifetime.abort(); context.signal.removeEventListener("abort", dispose);
      viewport?.dispose(); worker?.dispose(); root.remove();
    };
    try {
      context.signal.throwIfAborted();
      context.signal.addEventListener("abort", dispose, { once: true });
      const info = await inspectMobi(context.file, lifetime.signal, true);
      if (!info) throw new ViewerError("invalid-file", copy.invalid);
      if (info.protected) throw new ProtectedBookError();
      if (typeof Worker === "undefined" || typeof WebAssembly === "undefined" || typeof ResizeObserver === "undefined") throw new ViewerError("unsupported-environment", copy.environment);
      context.reportProgress({ stage: "parsing", message: copy.loading });
      worker = createBookWorker(new Worker(new URL("./decoder.worker.ts", import.meta.url), { type: "module" }), lifetime.signal);
      const result = await worker.request<MobiResult>({ type: "open", file: context.file, runtime: new URL("/vendor/libmobi/0.12-anyfile.1/mobi.js", location.origin).href });
      const source = {
        entries: new Map(result.entries.map(entry => [entry.filename, entry])),
        read(path: string, limit: number, signal = lifetime.signal) { return worker!.request<Uint8Array>({ type: "read", path, limit }, signal); },
        async dispose() { worker?.dispose(); },
      };
      const book = await mobiPublication(source, result, lifetime.signal);
      lifetime.signal.throwIfAborted(); context.container.append(root);
      viewport = createPublicationViewport(root, book, context.locale);
      return { dispose };
    } catch (error) {
      if (error instanceof ProtectedBookError && !lifetime.signal.aborted) {
        worker?.dispose();
        root.textContent = selectMessages(context.locale, { en: { text: "DRM-protected books, dictionaries and Print Replica are not supported." }, "zh-CN": { text: "不支持受 DRM 保护的电子书、词典或 Print Replica。" } }).text;
        root.setAttribute("role", "status"); context.container.append(root); return { dispose };
      }
      dispose();
      if (isViewerAbortError(error)) throw error;
      const code = error instanceof ViewerError ? error.code : "invalid-file";
      throw new ViewerError(code, code === "resource-limit" ? copy.limit : code === "unsupported-environment" ? copy.environment : copy.invalid, { cause: error });
    }
  },
};
