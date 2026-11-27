import {
  ViewerError,
  isViewerAbortError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
  abortError,
} from "@anyfile/viewer-protocol";

import { loadOfdDocument } from "./document";
import { OFD_LIMITS } from "./limits";
import { ofdManifest } from "./manifest";
import { loadOfdPage } from "./model";
import { OfdLimitError, OfdPackage } from "./package";
import { ofdCopy } from "./ui";
import { createOfdView } from "./view";

async function openOfd(context: OpenViewerContext): Promise<ViewerController> {
  const { file, signal, reportProgress } = context;
  const copy = ofdCopy(context.locale);
  const lifetime = new AbortController();
  let pkg: OfdPackage | undefined;
  let view: ReturnType<typeof createOfdView> | undefined;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    signal.removeEventListener("abort", dispose);
    if (view) view.dispose();
    else void pkg?.close();
  };

  try {
    if (signal.aborted) throw abortError();
    signal.addEventListener("abort", dispose, { once: true });
    if (file.size > OFD_LIMITS.maxInputBytes) throw new ViewerError("resource-limit", copy.limit);
    if (
      typeof DecompressionStream === "undefined" ||
      typeof DOMParser === "undefined" ||
      typeof Path2D === "undefined" ||
      typeof ResizeObserver === "undefined"
    ) {
      throw new ViewerError("unsupported-environment", copy.unsupported);
    }
    reportProgress({ stage: "reading", message: copy.reading });
    pkg = await OfdPackage.open(file, lifetime.signal);
    const document = await loadOfdDocument(pkg);
    if (lifetime.signal.aborted) throw abortError();
    reportProgress({ stage: "parsing", message: copy.parsing });
    const firstPage = await loadOfdPage(document, 0);
    if (lifetime.signal.aborted) throw abortError();
    view = createOfdView(file.name, context.locale, document, firstPage, copy, lifetime.signal);
    context.container.append(view.root);
    reportProgress({ stage: "ready", message: copy.ready });
    context.reportPreview?.({ outcome: "success", kind: "static" });
    return { dispose, captureImage: view.captureImage };
  } catch (error) {
    dispose();
    if (signal.aborted || isViewerAbortError(error)) throw abortError();
    if (error instanceof ViewerError) throw error;
    if (error instanceof OfdLimitError) throw new ViewerError("resource-limit", copy.limit, { cause: error });
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const ofdViewer: FileViewerPlugin = {
  manifest: ofdManifest,
  open: openOfd,
};
