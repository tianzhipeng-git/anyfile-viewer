import { openComicArchive } from "./archive-source";
import { ViewerError, isViewerAbortError, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import {
  checkBookAbort,
  ProtectedBookError,
  type BookSource,
} from "@anyfile/archive-metadata-viewer/book-source";
import { comicBookManifest } from "./manifest";
import { parseComic } from "./model";
import { createComicViewport } from "./viewport";
import { comicCopy } from "./ui";
export const comicBookViewer: FileViewerPlugin = {
  manifest: comicBookManifest,
  async open(context) {
    const copy = comicCopy(context.locale),
      root = document.createElement("div");
    root.className = "anyfile-comic-reader";
    const lifetime = new AbortController();
    let zip: BookSource | undefined,
      viewport: ReturnType<typeof createComicViewport> | undefined,
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
      if (typeof ResizeObserver === "undefined" || typeof DOMParser === "undefined")
        throw new ViewerError("unsupported-environment", copy.environment);
      context.signal.addEventListener("abort", dispose, { once: true });
      context.reportProgress({ stage: "parsing", message: copy.loading });
      zip = await openComicArchive(context.file, lifetime.signal);
      const book = await parseComic(zip, lifetime.signal);
      checkBookAbort(lifetime.signal);
      context.container.append(root);
      viewport = createComicViewport(root, zip, book.pages, book.rtl, context.locale);
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
          : code === "unsupported-environment"
            ? copy.environment
            : copy.invalid,
        { cause: error },
      );
    }
  },
};
