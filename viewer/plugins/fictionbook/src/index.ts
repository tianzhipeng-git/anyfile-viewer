import { ViewerError, isViewerAbortError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import {
  checkBookAbort,
  openBookZip,
  ProtectedBookError,
  type BookZip,
} from "@anyfile/archive-metadata-viewer/zip-source";
import { fictionBookManifest } from "./manifest";
import { parseFictionBook, FB2_LIMITS, type Fb2Book } from "./publication";
import { singleFb2 } from "./encoding";
import { createPublicationViewport } from "@anyfile/rendering-publication";
import { publicationCopy } from "@anyfile/rendering-publication";
export const fictionBookViewer: FileViewerPlugin = {
  manifest: fictionBookManifest,
  async open(context) {
    const copy = publicationCopy(context.locale),
      root = document.createElement("div");
    root.className = "anyfile-fictionbook-reader";
    const lifetime = new AbortController();
    let book: Fb2Book | undefined;
    let zip: BookZip | undefined,
      viewport: ReturnType<typeof createPublicationViewport> | undefined,
      disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      context.signal.removeEventListener("abort", dispose);
      viewport?.dispose();
      book?.sections.clear();
      book?.binaries.clear();
      book?.anchors.clear();
      book = undefined;
      root.remove();
      void zip?.dispose();
    };
    try {
      checkBookAbort(context.signal);
      if (
        typeof ResizeObserver === "undefined" ||
        typeof DOMParser === "undefined"
      )
        throw new ViewerError("unsupported-environment", copy.environment);
      context.signal.addEventListener("abort", dispose, { once: true });
      context.reportProgress({ stage: "parsing", message: copy.loading });
      let bytes: Uint8Array;
      if (/\.zip$/i.test(context.file.name)) {
        zip = await openBookZip(context.file, lifetime.signal);
        const path = singleFb2(zip.entries.keys());
        if (!path) throw new ViewerError("invalid-file", copy.invalid);
        bytes = await zip.read(path, FB2_LIMITS.file, lifetime.signal);
        await zip.dispose();
      } else {
        if (context.file.size > FB2_LIMITS.file) throw new ViewerError("resource-limit", copy.limit);
        bytes = new Uint8Array(await context.file.arrayBuffer());
      }
      checkBookAbort(lifetime.signal);
      book = parseFictionBook(bytes, lifetime.signal);
      checkBookAbort(lifetime.signal);
      context.container.append(root);
      viewport = createPublicationViewport(root, book, context.locale);
      return { dispose };
    } catch (error) {
      if (error instanceof ProtectedBookError && !lifetime.signal.aborted) {
        root.textContent = selectMessages(context.locale, { en: { protected: "Encrypted FictionBook archives are not supported." }, "zh-CN": { protected: "不支持加密的 FictionBook 归档。" } }).protected;
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
