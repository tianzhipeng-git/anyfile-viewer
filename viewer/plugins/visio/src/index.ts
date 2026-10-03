import { ViewerError, type FileViewerPlugin, type OpenViewerContext } from "@anyfile/viewer-protocol";
import { visioManifest } from "./manifest";
import { messages } from "./messages";
import { probeVisio } from "./probe";
import { readBlob } from "./read";
import { INPUT_LIMIT } from "./types";
import { VisioView } from "./view";
import { VisioWorkerClient } from "./worker-client";
async function open(context: OpenViewerContext) {
  const { file, signal, container, reportProgress } = context;
  const copy = messages(context.locale);
  let client: VisioWorkerClient | undefined, view: VisioView | undefined, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; signal.removeEventListener("abort", dispose); view?.dispose(); client?.dispose();
  };
  try {
    signal.throwIfAborted();
    if (!file.size) throw new ViewerError("invalid-file", copy.invalid);
    if (file.size > INPUT_LIMIT) throw new ViewerError("resource-limit", copy.limit);
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") throw new ViewerError("unsupported-environment", copy.unsupported);
    reportProgress({ stage: "reading", message: copy.reading });
    if (!(await probeVisio({ file, signal }))) throw new ViewerError("invalid-file", copy.invalid);
    const bytes = await readBlob(file, signal);
    signal.throwIfAborted();
    client = new VisioWorkerClient(signal, copy);
    reportProgress({ stage: "engine", message: copy.engine });
    await client.initialize();
    reportProgress({ stage: "rendering", message: copy.rendering });
    const pages = await client.open(bytes);
    signal.throwIfAborted();
    view = new VisioView(pages, client, copy); container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    await view.render();
    signal.throwIfAborted();
    context.reportPreview?.({ outcome: "success", kind: "static" });
    return { dispose };
  } catch (error) {
    dispose();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (error instanceof ViewerError) throw error;
    throw new ViewerError("open-failed", copy.invalid, { cause: error });
  }
}
export const visioViewer: FileViewerPlugin = { manifest: visioManifest, open };
