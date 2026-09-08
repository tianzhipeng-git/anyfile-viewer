import { ViewerError, isViewerAbortError, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import {
  checkBookAbort,
  openBookZip,
  ProtectedBookError,
  type BookZip,
} from "@anyfile/archive-metadata-viewer/zip-source";
import { epubManifest } from "./manifest";
import { parsePublication } from "./publication";
import { createPublicationViewport } from "@anyfile/rendering-publication";
import { prepareChapter } from "./safe-content";
import { epubCopy } from "./ui";
export const epubViewer: FileViewerPlugin = {
  manifest: epubManifest,
  async open(context) {
    const copy = epubCopy(context.locale),
      root = document.createElement("div");
    root.className = "anyfile-epub-reader";
    const lifetime = new AbortController();
    let zip: BookZip | undefined,
      viewport: ReturnType<typeof createPublicationViewport> | undefined,
      disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      context.signal.removeEventListener("abort", dispose);
      viewport?.dispose();
      root.remove();
      void zip?.dispose();
    };
    try {
      checkBookAbort(context.signal);
      if (
        typeof ResizeObserver === "undefined" ||
        typeof DOMParser === "undefined" ||
        typeof CSSStyleSheet === "undefined"
      )
        throw new ViewerError("unsupported-environment", copy.environment);
      context.signal.addEventListener("abort", dispose, { once: true });
      context.reportProgress({ stage: "parsing", message: copy.loading });
      zip = await openBookZip(context.file, lifetime.signal);
      const book = await parsePublication(zip, lifetime.signal);
      checkBookAbort(lifetime.signal);
      context.container.append(root);
      viewport = createPublicationViewport(root, { ...book, loadSection: (path, signal) => prepareChapter(zip!, book, path, signal) }, context.locale, copy);
      return { dispose };
    } catch (error) {
      if (error instanceof ProtectedBookError && !lifetime.signal.aborted) {
        root.textContent = copy.protected;
        root.setAttribute("role", "status");
        context.container.append(root);
        return { dispose };
      }
      dispose();
      await zip?.dispose();
      if (isViewerAbortError(error)) throw error;
      const code = error instanceof ViewerError ? error.code : "invalid-file";
      throw new ViewerError(
        code,
        code === "resource-limit"
          ? copy.limit
          : code === "missing-related-file"
            ? copy.missing
            : code === "unsupported-environment"
              ? copy.environment
              : copy.invalid,
        { cause: error },
      );
    }
  },
};
