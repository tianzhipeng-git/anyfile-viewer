import { ViewerError, isViewerAbortError, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { createDjvuView } from "./djvu-view";
import { DJVU_LIMITS } from "./limits";
import { djvuManifest } from "./manifest";
import { inspectDjvuHeader } from "./probe";
import { djvuCopy } from "./ui";
import { createDjvuWorkerClient, type DjvuWorkerClient } from "./worker-client";

export const djvuViewer: FileViewerPlugin = {
  manifest: djvuManifest,
  async open(context) {
    const copy = djvuCopy(context.locale);
    const lifetime = new AbortController();
    let client: DjvuWorkerClient | undefined;
    let view: ReturnType<typeof createDjvuView> | undefined;
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      context.signal.removeEventListener("abort", dispose);
      view?.dispose();
      client?.dispose();
    };

    try {
      if (context.signal.aborted) {
        throw new DOMException("Viewer operation aborted.", "AbortError");
      }
      if (context.file.size > DJVU_LIMITS.maxInputBytes) {
        throw new ViewerError("resource-limit", copy.limit);
      }
      if (typeof Worker === "undefined" || typeof WebAssembly === "undefined" || typeof ResizeObserver === "undefined") {
        throw new ViewerError("unsupported-environment", copy.unsupported);
      }

      context.signal.addEventListener("abort", dispose, { once: true });
      context.reportProgress({ stage: "parse", message: copy.loading });

      const buffer = await context.file.arrayBuffer();
      if (lifetime.signal.aborted) {
        throw new DOMException("Viewer operation aborted.", "AbortError");
      }
      if (buffer.byteLength > DJVU_LIMITS.maxInputBytes) {
        throw new ViewerError("resource-limit", copy.limit);
      }

      const header = inspectDjvuHeader(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 64)));
      if (!header.valid) {
        throw new ViewerError("invalid-file", copy.invalid);
      }
      if (header.indirect) {
        throw new ViewerError("missing-related-file", copy.indirect);
      }

      client = await createDjvuWorkerClient(lifetime.signal, copy.unsupported);
      const document = await client.open(buffer);
      if (lifetime.signal.aborted) {
        throw new DOMException("Viewer operation aborted.", "AbortError");
      }

      view = createDjvuView(context.file.name, context.locale, document, copy, {
        renderPage: (pageIndex, width, height, options) => client!.renderPage(pageIndex, width, height, options),
        getPageText: (pageIndex, callSignal) => client!.getPageText(pageIndex, callSignal),
      });
      context.container.append(view.root);
      return { dispose };
    } catch (error) {
      dispose();
      if (isViewerAbortError(error)) throw error;
      if (error instanceof ViewerError) {
        const message =
          error.code === "resource-limit"
            ? copy.limit
            : error.code === "missing-related-file"
              ? copy.indirect
              : error.code === "unsupported-environment" || error.code === "runtime-unavailable"
                ? copy.unsupported
                : copy.invalid;
        throw new ViewerError(error.code, message, { cause: error });
      }
      throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    }
  },
};
