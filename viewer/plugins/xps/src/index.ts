import {
  ViewerError,
  isViewerAbortError,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
  abortError,
} from "@anyfile/viewer-protocol";

import { loadXpsDocument, loadXpsPage } from "./document";
import { XPS_LIMITS } from "./limits";
import { xpsManifest } from "./manifest";
import { XpsFormatError, XpsLimitError, XpsPackage } from "./package";
import { XpsResources } from "./resources";
import { xpsCopy } from "./ui";
import { createXpsView } from "./view";

async function openXps(context: OpenViewerContext): Promise<ViewerController> {
  const { file, signal, reportProgress } = context;
  const copy = xpsCopy(context.locale);
  const lifetime = new AbortController();
  let pkg: XpsPackage | undefined;
  let view: ReturnType<typeof createXpsView> | undefined;
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
    if (file.size > XPS_LIMITS.maxInputBytes) throw new ViewerError("resource-limit", copy.limit);
    if (
      typeof DecompressionStream === "undefined" ||
      typeof DOMParser === "undefined" ||
      typeof Path2D === "undefined" ||
      typeof ResizeObserver === "undefined"
    ) {
      throw new ViewerError("unsupported-environment", copy.unsupported);
    }
    reportProgress({ stage: "reading", message: copy.reading });
    pkg = await XpsPackage.open(file, lifetime.signal);
    const document = await loadXpsDocument(pkg);
    if (lifetime.signal.aborted) throw abortError();
    reportProgress({ stage: "parsing", message: copy.parsing });
    const firstPage = await loadXpsPage(pkg, document.pages[0]!.part);
    if (lifetime.signal.aborted) throw abortError();
    view = createXpsView(file.name, context.locale, document, firstPage, pkg, new XpsResources(pkg, lifetime.signal), copy);
    context.container.append(view.root);
    reportProgress({ stage: "ready", message: copy.ready });
    context.reportPreview?.({ outcome: "success", kind: "static" });
    return { dispose };
  } catch (error) {
    dispose();
    if (signal.aborted || isViewerAbortError(error)) throw abortError();
    if (error instanceof ViewerError) throw error;
    if (error instanceof XpsLimitError) throw new ViewerError("resource-limit", copy.limit, { cause: error });
    if (error instanceof XpsFormatError) throw new ViewerError("invalid-file", copy.invalid, { cause: error });
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const xpsViewer: FileViewerPlugin = {
  manifest: xpsManifest,
  open: openXps,
};
