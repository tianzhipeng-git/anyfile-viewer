import { ViewerError, type FileViewerPlugin, type OpenViewerContext } from "@anyfile/viewer-protocol";
import { createPagedTableViewer, type PagedTableViewer } from "@anyfile/viewer-ui";
import { statDataManifest } from "./manifest";
import { messages } from "./messages";
import { detectStatFormat, readHeader } from "./probe";
import { createStatViews } from "./views";
import { StatWorkerClient } from "./worker-client";

async function open(context: OpenViewerContext) {
  const { file, signal, container, reportProgress } = context;
  const copy = messages(context.locale);
  let client: StatWorkerClient | undefined, view: PagedTableViewer | undefined, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; signal.removeEventListener("abort", dispose); view?.dispose(); client?.dispose();
  };
  try {
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") throw new ViewerError("unsupported-environment", copy.unsupported);
    reportProgress({ stage: "reading", message: copy.reading });
    const format = detectStatFormat(await readHeader(file, signal));
    if (!format) throw new ViewerError("invalid-file", copy.invalid);
    client = new StatWorkerClient(signal);
    reportProgress({ stage: "engine", message: copy.engine });
    await client.initialize();
    reportProgress({ stage: "parsing", message: copy.parsing });
    const schema = await client.open(file, format);
    const views = createStatViews(format, schema, copy, (...args) => client!.rows(...args));
    view = await createPagedTableViewer({
      className: "anyfile-stat-data-viewer", fileName: file.name, options: views.options,
      selectorLabel: copy.view, selectorDataAttribute: "view", previousLabel: copy.previous, nextLabel: copy.next,
      queryFailedMessage: copy.queryFailed, signal, loadPage: views.loadPage,
    });
    signal.throwIfAborted();
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    context.reportPreview?.({ outcome: "success", kind: "structure" });
    return { dispose };
  } catch (error) {
    dispose();
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    if (error instanceof ViewerError) throw new ViewerError(error.code, error.code === "resource-limit" ? copy.limit : error.code === "unsupported-environment" ? copy.unsupported : copy.invalid, { cause: error });
    throw new ViewerError("open-failed", copy.invalid, { cause: error });
  }
}

export const statDataViewer: FileViewerPlugin = { manifest: statDataManifest, open };
