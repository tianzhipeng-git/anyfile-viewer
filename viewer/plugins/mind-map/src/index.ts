import { ViewerError, isViewerAbortError, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { mindMapManifest } from "./manifest";
import { mindMapCopy } from "./messages";
import { checkAbort, readMindMap } from "./parse";
import { createMindMapView } from "./view";

export const mindMapViewer: FileViewerPlugin = {
  manifest: mindMapManifest,
  async open(context) {
    const copy = mindMapCopy(context.locale);
    let view: ReturnType<typeof createMindMapView> | undefined, disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      context.signal.removeEventListener("abort", dispose);
      view?.dispose();
    };
    try {
      checkAbort(context.signal);
      context.signal.addEventListener("abort", dispose, { once: true });
      context.reportProgress({ stage: "reading", message: copy.reading });
      const sheets = await readMindMap(context.file, context.signal);
      checkAbort(context.signal);
      view = createMindMapView(sheets, copy);
      context.container.append(view.root);
      context.reportPreview?.({ outcome: "success", kind: "structure" });
      return { dispose };
    } catch (error) {
      dispose();
      if (isViewerAbortError(error)) throw error;
      const code = error instanceof ViewerError ? error.code : "invalid-file";
      throw new ViewerError(code, code === "resource-limit" ? copy.limit : code === "unsupported-environment" ? copy.environment : copy.invalid, { cause: error });
    }
  },
};
