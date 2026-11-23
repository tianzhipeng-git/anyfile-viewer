import { ViewerError, type FileViewerPlugin, type OpenViewerContext, type ViewerController } from "@anyfile/viewer-protocol";

import { pstCopy } from "./copy";
import { pstManifest } from "./manifest";
import { PstArchive } from "./messaging";
import { PstError, throwIfAborted } from "./types";
import { createPstView } from "./ui";

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function openPst(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportPreview, reportProgress, signal } = context;
  const copy = pstCopy(locale);
  let view: ReturnType<typeof createPstView> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    if (typeof DecompressionStream === "undefined" || typeof DOMParser === "undefined") {
      throw new ViewerError("unsupported-environment", copy.invalid);
    }
    reportProgress({ stage: "reading", message: copy.reading });
    const archive = await PstArchive.open(file, signal);
    reportProgress({ stage: "rendering", message: copy.rendering });
    const top = await archive.subfolders(archive.rootFolder.nid);
    const initialPath = await archive.defaultFolderPath(top);
    throwIfAborted(signal);
    view = createPstView(file.name, archive, top, initialPath, copy, locale);
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    reportPreview?.({ outcome: "success", kind: "structure" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    if (error instanceof PstError) {
      if (error.code === "resource-limit") throw new ViewerError("resource-limit", copy.limit, { cause: error });
      if (error.code === "unsupported") throw new ViewerError("open-failed", copy.unsupported, { cause: error });
    }
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const pstViewer: FileViewerPlugin = { manifest: pstManifest, open: openPst };
export { pstManifest } from "./manifest";
