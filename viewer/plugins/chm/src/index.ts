import { ViewerError, isViewerAbortError, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { createPublicationViewport } from "@anyfile/rendering-publication";
import { readChmMetadata } from "./chm-metadata";
import { parseChmDirectory } from "./itsf";
import { createChmSectionReader, type ChmSectionReader } from "./section-reader";
import { chmManifest } from "./manifest";
import { createChmPublication } from "./publication";
import { chmCopy } from "./ui";

export const chmViewer: FileViewerPlugin = {
  manifest: chmManifest,
  async open(context) {
    const copy = chmCopy(context.locale);
    const root = document.createElement("div");
    root.className = "anyfile-chm-reader";
    const lifetime = new AbortController();
    let reader: ChmSectionReader | undefined;
    let viewport: ReturnType<typeof createPublicationViewport> | undefined;
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      context.signal.removeEventListener("abort", dispose);
      viewport?.dispose();
      reader?.dispose();
      root.remove();
    };

    try {
      if (context.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (
        typeof ResizeObserver === "undefined" ||
        typeof DOMParser === "undefined" ||
        typeof CSSStyleSheet === "undefined"
      ) {
        throw new ViewerError("unsupported-environment", copy.environment);
      }

      context.signal.addEventListener("abort", dispose, { once: true });
      context.reportProgress({ stage: "parsing", message: copy.loading });

      const directory = await parseChmDirectory(context.file, lifetime.signal);
      reader = createChmSectionReader(context.file, directory);
      const metadata = await readChmMetadata(directory, reader, lifetime.signal);
      const publication = createChmPublication(
        context.file.name,
        directory,
        metadata,
        reader,
        context.locale,
      );

      if (lifetime.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      context.container.append(root);
      viewport = createPublicationViewport(root, publication, context.locale, copy);
      return { dispose };
    } catch (error) {
      dispose();
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
